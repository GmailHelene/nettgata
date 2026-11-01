import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, organizations, sites } from "@/db/schema";
import { formatNok } from "@/lib/shop/money";
import { formatOrgnr, readSiteInfo } from "@/lib/site-info";
import { PLANS, planForKind, specsFor, type CheckoutChoice, type PriceSpec } from "./plans";
import { blocksNewCheckout, readBilling, type SiteBilling } from "./state";
import type { StripeCheckoutSession, StripeClient, StripeList, StripePrice, StripeTaxRate } from "./stripe";

/**
 * message er det kunden ser. adminDetail forklarer hva som er galt i Stripe-oppsettet,
 * og vises bare for plattformadmin.
 */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly adminDetail?: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export const NOT_READY = "Betaling med kort er ikke klar ennå. Send en e-post til kontakt@helene.cloud, så kan du få abonnementet på faktura i stedet.";

type SiteRow = typeof sites.$inferSelect;

// ---------- Mva ----------

export type TaxSetup = { kind: "rate"; id: string } | { kind: "auto" };

/** En skattesats på 25 % for Norge som legges på toppen av prisen (exclusive). */
export function isNorwegianVat(rate: StripeTaxRate): boolean {
  const norway = rate.country === "NO" || /^(no|norge|norway)$/i.test(rate.jurisdiction?.trim() ?? "");
  return rate.active && !rate.inclusive && Number(rate.percentage) === 25 && norway;
}

/**
 * Prisene er uten mva, og 25 % skal legges på. Først letes det etter en fast skattesats (gratis),
 * så etter Stripe Tax (koster per transaksjon). Finnes ingen av dem, stoppes betalingen: å ta betalt uten
 * mva ville gitt fakturaer som ikke stemmer, og mvaen måtte uansett betales til staten.
 */
export async function resolveTax(stripe: StripeClient): Promise<TaxSetup> {
  const rates = await stripe.get<StripeList<StripeTaxRate>>("/v1/tax_rates", { active: true, limit: 100 });
  const rate = rates.data.find(isNorwegianVat);
  if (rate) return { kind: "rate", id: rate.id };

  let detail = "";
  try {
    const settings = await stripe.get<{ status?: string }>("/v1/tax/settings");
    if (settings.status === "active") return { kind: "auto" };
    detail = ` Stripe Tax står som «${settings.status ?? "ukjent"}».`;
  } catch (err) {
    detail = ` Stripe Tax kunne ikke leses (${err instanceof Error ? err.message : String(err)}).`;
  }
  throw new BillingError(
    NOT_READY,
    `Stripe mangler 25 % mva. Lag en skattesats (Tax rate) på 25 % for Norge, ikke inkludert i prisen, eller slå på Stripe Tax.${detail}`,
  );
}

// ---------- Priser ----------

/** Hva som er galt med prisen i Stripe sammenlignet med vedtatt pris. Tom liste når alt stemmer. */
export function priceProblems(spec: PriceSpec, price: StripePrice | undefined, tax: TaxSetup): string[] {
  if (!price) return [`Fant ingen aktiv pris med oppslagsnøkkelen ${spec.lookupKey} i Stripe.`];
  const problems: string[] = [];
  if (price.currency.toLowerCase() !== "nok") problems.push(`${spec.lookupKey} er i ${price.currency.toUpperCase()}, men skal være i NOK.`);
  if (price.unit_amount !== spec.amountOre) {
    problems.push(`${spec.lookupKey} koster ${formatNok(price.unit_amount ?? 0)} i Stripe, men vedtatt pris er ${formatNok(spec.amountOre)} uten mva.`);
  }
  if (spec.interval) {
    const ok = price.type === "recurring" && price.recurring?.interval === spec.interval && (price.recurring?.interval_count ?? 1) === 1;
    if (!ok) problems.push(`${spec.lookupKey} skal være en ${spec.interval === "month" ? "månedlig" : "årlig"} pris.`);
  } else if (price.type !== "one_time") {
    problems.push(`${spec.lookupKey} skal være en engangspris.`);
  }
  if (tax.kind === "auto" && price.tax_behavior !== "exclusive") {
    problems.push(`${spec.lookupKey} må ha «Exclude tax» (tax behavior exclusive) når Stripe Tax brukes, ellers regnes mvaen som en del av prisen.`);
  }
  return problems;
}

/** Henter prisene med oppslagsnøklene, så Helene slipper å lime inn pris-id-er noe sted. */
export async function resolvePrices(stripe: StripeClient, specs: PriceSpec[], tax: TaxSetup): Promise<Map<string, StripePrice>> {
  const list = await stripe.get<StripeList<StripePrice>>("/v1/prices", {
    active: true,
    lookup_keys: specs.map((s) => s.lookupKey),
    limit: 20,
  });
  const byKey = new Map<string, StripePrice>();
  for (const price of list.data) if (price.lookup_key) byKey.set(price.lookup_key, price);
  const problems = specs.flatMap((spec) => priceProblems(spec, byKey.get(spec.lookupKey), tax));
  if (problems.length) throw new BillingError(NOT_READY, problems.join("\n"));
  return byKey;
}

// ---------- Kunde ----------

async function shortHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Én Stripe-kunde per nettsted. Lages første gang, med bedriftens navn, norsk språk på fakturaene og
 * org.nr som eget felt på fakturaen når vi har det. Adressen fylles inn av kunden i Checkout.
 */
export async function ensureCustomer(db: Db, stripe: StripeClient, site: SiteRow, user: { id: string; email: string }): Promise<string> {
  const existing = readBilling(site.billing).stripeCustomerId;
  if (existing) return existing;

  const [org] = await db.select({ name: organizations.name, orgnr: organizations.orgnr }).from(organizations).where(eq(organizations.id, site.orgId)).limit(1);
  const orgnr = (org?.orgnr || readSiteInfo(site.info).orgnr || "").replace(/\s/g, "");
  const params = {
    name: org?.name || site.name,
    email: user.email,
    preferred_locales: ["nb"],
    invoice_settings: /^\d{9}$/.test(orgnr) ? { custom_fields: [{ name: "Org.nr.", value: formatOrgnr(orgnr) }] } : undefined,
    metadata: { app: "nettgata", siteId: site.id, orgId: site.orgId, orgnr: orgnr || undefined },
  };
  // Samme forespørsel to ganger (dobbeltklikk) gir samme kunde hos Stripe, ikke to.
  const idempotencyKey = `nettgata-kunde-${site.id}-${await shortHash(JSON.stringify(params))}`;
  const customer = await stripe.post<{ id: string }>("/v1/customers", params, { idempotencyKey });

  const saved = await db
    .update(sites)
    .set({ billing: sql`${sites.billing} || ${JSON.stringify({ stripeCustomerId: customer.id })}::jsonb` })
    .where(and(eq(sites.id, site.id), sql`${sites.billing}->>'stripeCustomerId' is null`))
    .returning({ id: sites.id });
  if (saved.length) return customer.id;
  // En annen forespørsel rakk å lagre en kunde først. Bruk den.
  const [row] = await db.select({ billing: sites.billing }).from(sites).where(eq(sites.id, site.id)).limit(1);
  return readBilling(row?.billing).stripeCustomerId ?? customer.id;
}

// ---------- Checkout og kundeportal ----------

export type StartCheckoutInput = {
  site: SiteRow;
  user: { id: string; email: string };
  choice: CheckoutChoice;
  /** Plattformens adresse, for eksempel https://nettgata.no. Kunden kommer tilbake hit etter betalingen. */
  baseUrl: string;
};

/** Lager en betalingsøkt hos Stripe og returnerer adressen kunden skal sendes til. */
export async function startCheckout(db: Db, stripe: StripeClient, input: StartCheckoutInput): Promise<string> {
  const { site, user, choice } = input;
  const billing = readBilling(site.billing);
  if (billing.manual) throw new BillingError("Abonnementet faktureres utenom kortbetaling. Ta kontakt hvis noe skal endres.");
  if (blocksNewCheckout(billing)) {
    throw new BillingError("Nettstedet har allerede et abonnement. Bruk knappen for kort og fakturaer for å endre det.");
  }

  const plan = planForKind(site.kind);
  const specs = specsFor(plan, choice);
  const tax = await resolveTax(stripe);
  const prices = await resolvePrices(stripe, specs, tax);
  const customer = await ensureCustomer(db, stripe, site, user);
  const back = `${input.baseUrl.replace(/\/$/, "")}/studio/nettsted/${site.id}/abonnement`;
  const metadata = { app: "nettgata", siteId: site.id, plan };

  const session = await stripe.post<StripeCheckoutSession>("/v1/checkout/sessions", {
    mode: "subscription",
    // Grønberg Tech Solutions selger selv og beregner mva med egen skattesats. Stripe sin «Managed Payments»
    // (Stripe som selger) kan være slått på som standard på kontoen, og krever da skattekode på hvert produkt.
    managed_payments: { enabled: false },
    customer,
    // Adressen og bedriftsnavnet fra Checkout lagres på kunden, så de kommer med på fakturaen.
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    line_items: specs.map((spec) => ({
      price: prices.get(spec.lookupKey)!.id,
      quantity: 1,
      tax_rates: tax.kind === "rate" ? [tax.id] : undefined,
    })),
    automatic_tax: tax.kind === "auto" ? { enabled: true } : undefined,
    client_reference_id: site.id,
    metadata: { ...metadata, interval: choice.interval, addon: choice.addon ? "1" : "0", setup: choice.setup ? "1" : "0" },
    // Metadata må ligge på abonnementet også. Hendelsene om abonnementet ser ikke økten.
    subscription_data: { description: `${PLANS[plan].label} for ${site.name}`, metadata },
    locale: "nb",
    success_url: `${back}?betaling=fullfort&okt={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}?betaling=avbrutt`,
  });
  if (!session.url) throw new BillingError(NOT_READY, "Stripe svarte uten adresse til betalingssiden.");

  await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "billing.checkout_started", detail: { plan, ...choice } });
  return session.url;
}

/** Stripe sin kundeportal: bytte kort, se og laste ned fakturaer, og si opp. */
export async function createPortalSession(stripe: StripeClient, billing: SiteBilling, returnUrl: string): Promise<string> {
  if (!billing.stripeCustomerId) throw new BillingError("Nettstedet har ingen betaling hos Stripe ennå.");
  const session = await stripe.post<{ url: string }>("/v1/billing_portal/sessions", { customer: billing.stripeCustomerId, return_url: returnUrl });
  return session.url;
}
