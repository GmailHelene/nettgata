import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, sites } from "@/db/schema";
import { priceSpecByKey, type BillingInterval, type Plan } from "./plans";
import { ENDED_STATUSES, readBilling, type SiteBilling } from "./state";
import {
  refId,
  type StripeCheckoutSession,
  type StripeClient,
  type StripeEvent,
  type StripeInvoice,
  type StripeSubscription,
} from "./stripe";

/**
 * Holder sites.billing i takt med Stripe.
 *
 * Hendelsene sier bare hvilket abonnement som er endret. Selve tilstanden hentes alltid fersk fra Stripe,
 * fordi Stripe ikke lover at hendelsene kommer i riktig rekkefølge. Da gir samme hendelse to ganger, eller
 * to hendelser i feil rekkefølge, samme resultat. Behandlede hendelser huskes i tillegg, så en hendelse som
 * sendes på nytt ikke gir ny logglinje eller nytt kall mot Stripe.
 */

export type SyncResult = {
  status: "oppdatert" | "duplikat" | "ignorert" | "eldre";
  siteId?: string;
  reason?: string;
};

/** Så mange hendelses-id-er huskes per nettsted. Stripe sender en hendelse på nytt i opptil tre dager. */
const REMEMBERED_EVENTS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

type SiteBillingRow = { id: string; billing: unknown };

async function siteById(db: Db, id: string | null | undefined): Promise<SiteBillingRow | null> {
  if (!id || !UUID.test(id)) return null;
  const [row] = await db.select({ id: sites.id, billing: sites.billing }).from(sites).where(eq(sites.id, id)).limit(1);
  return row ?? null;
}

/** Først metadata, så lagret abonnement, så kunden (bare når den hører til ett nettsted). */
async function findSite(db: Db, sub: StripeSubscription): Promise<SiteBillingRow | null> {
  const byMetadata = await siteById(db, sub.metadata?.siteId);
  if (byMetadata) return byMetadata;
  const [bySubscription] = await db
    .select({ id: sites.id, billing: sites.billing })
    .from(sites)
    .where(sql`${sites.billing}->>'stripeSubscriptionId' = ${sub.id}`)
    .limit(1);
  if (bySubscription) return bySubscription;
  const customer = refId(sub.customer);
  if (!customer) return null;
  const byCustomer = await db
    .select({ id: sites.id, billing: sites.billing })
    .from(sites)
    .where(sql`${sites.billing}->>'stripeCustomerId' = ${customer}`)
    .limit(2);
  return byCustomer.length === 1 ? byCustomer[0] : null;
}

/** Det vi lagrer om et abonnement. Plan og tillegg leses fra oppslagsnøklene på prisene. */
export function subscriptionPatch(sub: StripeSubscription): Partial<SiteBilling> {
  const items = sub.items?.data ?? [];
  let plan: Plan | null = null;
  let interval: BillingInterval | null = null;
  let addon = false;
  for (const item of items) {
    const spec = item.price?.lookup_key ? priceSpecByKey(item.price.lookup_key) : null;
    if (spec?.role === "plan") {
      plan = spec.plan;
      interval = spec.interval;
    } else if (spec?.role === "addon") {
      addon = true;
    }
  }
  const metaPlan = sub.metadata?.plan;
  if (!plan && (metaPlan === "nettside" || metaPlan === "nettbutikk")) plan = metaPlan;
  const recurring = items[0]?.price?.recurring?.interval;
  if (!interval && (recurring === "month" || recurring === "year")) interval = recurring;

  // Fra API-versjon 2025-03-31.basil har hver linje sin egen periode. Neste trekk er den tidligste.
  const ends = items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  const periodEnd = typeof sub.current_period_end === "number" ? sub.current_period_end : ends.length ? Math.min(...ends) : null;
  const cancelAt = sub.cancel_at ?? (sub.cancel_at_period_end && periodEnd ? periodEnd : null);

  return {
    plan,
    interval,
    addon,
    status: sub.status,
    stripeCustomerId: refId(sub.customer),
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd ? iso(periodEnd) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) || sub.cancel_at != null,
    cancelAt: cancelAt ? iso(cancelAt) : null,
  };
}

export type SyncContext = {
  /** Nettstedet hendelsen sier den gjelder, fra metadata. Sjekkes mot databasen før den brukes. */
  siteIdHint?: string | null;
  eventId?: string;
  eventType?: string;
  /** Oppstarten var med i betalingen og er betalt. */
  setupPaid?: boolean;
  now?: Date;
};

/** Henter abonnementet fra Stripe og lagrer tilstanden på nettstedet det hører til. */
export async function syncSubscription(db: Db, stripe: StripeClient, subscriptionId: string, context: SyncContext = {}): Promise<SyncResult> {
  const { eventId } = context;
  let site = await siteById(db, context.siteIdHint);
  if (site && eventId && readBilling(site.billing).events.includes(eventId)) return { status: "duplikat", siteId: site.id };

  const sub = await stripe.get<StripeSubscription>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const fetchedAt = (context.now ?? new Date()).toISOString();
  site ??= await findSite(db, sub);
  // Hendelser om abonnementer som ikke er våre, for eksempel fra et annet produkt på samme Stripe-konto.
  if (!site) return { status: "ignorert", reason: "Abonnementet hører ikke til noe nettsted" };

  const billing = readBilling(site.billing);
  if (eventId && billing.events.includes(eventId)) return { status: "duplikat", siteId: site.id };
  if (billing.stripeSubscriptionId && billing.stripeSubscriptionId !== sub.id && ENDED_STATUSES.has(sub.status)) {
    return { status: "ignorert", siteId: site.id, reason: "Et eldre, avsluttet abonnement" };
  }

  const patch: Partial<SiteBilling> = {
    ...subscriptionPatch(sub),
    syncedAt: fetchedAt,
    ...(eventId ? { events: [...billing.events, eventId].slice(-REMEMBERED_EVENTS) } : {}),
    ...(context.setupPaid && !billing.setupPaidAt ? { setupPaidAt: fetchedAt } : {}),
  };
  // Vilkåret hindrer at et svar hentet tidligere (en tregere forespørsel samtidig) overskriver et nyere.
  const updated = await db
    .update(sites)
    .set({ billing: sql`${sites.billing} || ${JSON.stringify(patch)}::jsonb` })
    .where(and(eq(sites.id, site.id), sql`coalesce((${sites.billing}->>'syncedAt')::timestamptz, '-infinity') <= ${fetchedAt}::timestamptz`))
    .returning({ id: sites.id });
  if (!updated.length) return { status: "eldre", siteId: site.id };

  await db.insert(auditLog).values({
    siteId: site.id,
    action: "billing.stripe",
    detail: { event: context.eventType ?? "synk", eventId: eventId ?? null, subscription: sub.id, status: sub.status },
  });
  return { status: "oppdatert", siteId: site.id };
}

function ignored(reason: string): SyncResult {
  return { status: "ignorert", reason };
}

/** Webhooken. Andre hendelsestyper kvitteres uten at noe skjer, ellers prøver Stripe igjen i dagevis. */
export async function handleStripeEvent(db: Db, stripe: StripeClient, event: StripeEvent, now?: Date): Promise<SyncResult> {
  // En testhendelse til live-nøkkelen (eller omvendt) betyr at noe er koblet feil. Den rører ingenting.
  if (stripe.mode !== "ukjent" && event.livemode !== (stripe.mode === "live")) return ignored("Hendelsen er fra en annen modus enn nøkkelen");
  const base = { eventId: event.id, eventType: event.type, now };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as unknown as StripeCheckoutSession;
      const subscription = refId(session.subscription);
      if (session.mode !== "subscription" || !subscription) return ignored("Ikke en betaling for abonnement");
      return syncSubscription(db, stripe, subscription, {
        ...base,
        siteIdHint: session.metadata?.siteId ?? session.client_reference_id,
        setupPaid: session.metadata?.setup === "1" && session.payment_status === "paid",
      });
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as StripeSubscription;
      return syncSubscription(db, stripe, sub.id, { ...base, siteIdHint: sub.metadata?.siteId });
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as unknown as StripeInvoice;
      // Abonnementet ligger to ulike steder, avhengig av API-versjonen webhooken i Stripe står på. Les begge.
      const details = invoice.parent?.subscription_details;
      const subscription = refId(details?.subscription) ?? refId(invoice.subscription);
      if (!subscription) return ignored("Fakturaen hører ikke til et abonnement");
      return syncSubscription(db, stripe, subscription, { ...base, siteIdHint: details?.metadata?.siteId });
    }
    default:
      return ignored(`${event.type} brukes ikke`);
  }
}

/**
 * Når kunden kommer tilbake fra Checkout. Webhooken kan komme noen sekunder senere, så vi henter
 * økten selv og sjekker at den hører til dette nettstedet før noe lagres.
 */
export async function confirmCheckoutSession(db: Db, stripe: StripeClient, siteId: string, sessionId: string, now?: Date): Promise<SyncResult> {
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) return ignored("Ugyldig økt");
  const session = await stripe.get<StripeCheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if ((session.metadata?.siteId ?? session.client_reference_id) !== siteId) return ignored("Økten gjelder et annet nettsted");
  const subscription = refId(session.subscription);
  if (session.status !== "complete" || !subscription) return ignored("Betalingen er ikke fullført");
  return syncSubscription(db, stripe, subscription, {
    siteIdHint: siteId,
    eventType: "checkout.retur",
    setupPaid: session.metadata?.setup === "1" && session.payment_status === "paid",
    now,
  });
}

/** Plattformadmin slår på eller av «fakturert utenom Stripe», for kunder Helene fakturerer selv. */
export async function setManualBilling(db: Db, siteId: string, input: { manual: boolean; note: string }, userId: string) {
  const note = input.note.trim().slice(0, 200);
  await db
    .update(sites)
    .set({ billing: sql`${sites.billing} || ${JSON.stringify({ manual: input.manual, manualNote: note })}::jsonb` })
    .where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: input.manual ? "billing.manual_on" : "billing.manual_off", detail: { note } });
}
