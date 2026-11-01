import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { setDbForTests, type Db } from "@/db";
import { demoTheme } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { auditLog, organizations, sites, users } from "@/db/schema";
import { BillingError, createPortalSession, isNorwegianVat, NOT_READY, startCheckout } from "@/lib/billing/checkout";
import { ADDON, PLANS, PRICE_SPECS, quote } from "@/lib/billing/plans";
import {
  canConnectDomain,
  DOMAIN_NEEDS_SUBSCRIPTION,
  hasActiveSubscription,
  readBilling,
  summarizeBilling,
  type SiteBilling,
} from "@/lib/billing/state";
import {
  createStripeClient,
  encodeForm,
  getStripe,
  missingBillingConfig,
  STRIPE_API_VERSION,
  StripeApiError,
  type StripeEvent,
} from "@/lib/billing/stripe";
import { confirmCheckoutSession, handleStripeEvent, setManualBilling } from "@/lib/billing/sync";
import { SIGNATURE_TOLERANCE_SECONDS, verifyStripeSignature, WebhookSignatureError } from "@/lib/billing/webhook";

const SECRET = "whsec_testhemmelighet";
/** 1. desember 2026, midnatt UTC. */
const PERIOD_END = 1796083200;

type Call = { method: string; path: string; query: URLSearchParams; body: URLSearchParams; headers: Headers };
type Json = Record<string, unknown>;

/** Stripe slik testene styrer det. Alle kall går gjennom fetch, som i Workeren. */
function fakeStripe() {
  const calls: Call[] = [];
  const prices = new Map<string, Json>(
    PRICE_SPECS.map((s) => [
      s.lookupKey,
      {
        id: `price_${s.lookupKey}`,
        object: "price",
        active: true,
        currency: "nok",
        unit_amount: s.amountOre,
        lookup_key: s.lookupKey,
        type: s.interval ? "recurring" : "one_time",
        recurring: s.interval ? { interval: s.interval, interval_count: 1 } : null,
        tax_behavior: "exclusive",
      },
    ]),
  );
  const taxRates: Json[] = [{ id: "txr_mva", object: "tax_rate", active: true, percentage: 25, inclusive: false, country: "NO", jurisdiction: "NO" }];
  const taxSettings: Json = { status: "pending" };
  const subscriptions = new Map<string, Json>();
  const sessions = new Map<string, Json>();
  let customerCount = 0;

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname, query: url.searchParams, body: new URLSearchParams(String(init?.body ?? "")), headers: new Headers(init?.headers) });
    const route = `${method} ${url.pathname}`;
    if (route === "GET /v1/prices") {
      const keys = [...url.searchParams.entries()].filter(([k]) => k.startsWith("lookup_keys")).map(([, v]) => v);
      return json(200, { object: "list", data: keys.map((k) => prices.get(k)).filter(Boolean), has_more: false });
    }
    if (route === "GET /v1/tax_rates") return json(200, { object: "list", data: taxRates, has_more: false });
    if (route === "GET /v1/tax/settings") return json(200, taxSettings);
    if (route === "POST /v1/customers") return json(200, { id: `cus_${++customerCount}`, object: "customer" });
    if (route === "POST /v1/checkout/sessions") return json(200, { id: "cs_test_abc123456", url: "https://checkout.stripe.com/c/pay/cs_test_abc123456" });
    if (route === "POST /v1/billing_portal/sessions") return json(200, { id: "bps_1", url: "https://billing.stripe.com/p/session/test_1" });
    const sub = /^\/v1\/subscriptions\/(.+)$/.exec(url.pathname);
    if (method === "GET" && sub) {
      const found = subscriptions.get(decodeURIComponent(sub[1]));
      return found ? json(200, found) : json(404, { error: { message: "No such subscription", code: "resource_missing" } });
    }
    const session = /^\/v1\/checkout\/sessions\/(.+)$/.exec(url.pathname);
    if (method === "GET" && session) {
      const found = sessions.get(decodeURIComponent(session[1]));
      return found ? json(200, found) : json(404, { error: { message: "No such checkout session" } });
    }
    return json(404, { error: { message: `Ukjent kall ${route}` } });
  });

  const posted = (path: string) => calls.filter((c) => c.method === "POST" && c.path === path);
  const fetched = (prefix: string) => calls.filter((c) => c.method === "GET" && c.path.startsWith(prefix));
  return { fetch, calls, prices, taxRates, taxSettings, subscriptions, sessions, posted, fetched, client: createStripeClient("sk_test_123", { fetch }) };
}

function sign(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function event(type: string, object: Json, id = `evt_${type.replace(/\W/g, "_")}`): StripeEvent {
  return { id, type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object } };
}

const noDashes = (text: string) => !/[–—]/.test(text) && !/ - /.test(text);

describe("priser", () => {
  it("følger vedtatte priser uten mva, med oppslagsnøkler", () => {
    const byKey = Object.fromEntries(PRICE_SPECS.map((s) => [s.lookupKey, s.amountOre]));
    expect(byKey).toEqual({
      nettgata_nettside_mnd: 19900,
      nettgata_nettside_ar: 202800,
      nettgata_nettbutikk_mnd: 39900,
      nettgata_nettbutikk_ar: 406800,
      nettgata_tillegg_ai_mnd: 24900,
      nettgata_tillegg_ai_ar: 298800,
      nettgata_oppstart_nettside: 390000,
      nettgata_oppstart_nettbutikk: 990000,
    });
    // Årlig betaling er 169 og 339 kr i måneden.
    expect(PLANS.nettside.yearOre / 12).toBe(16900);
    expect(PLANS.nettbutikk.yearOre / 12).toBe(33900);
    expect(ADDON.yearOre).toBe(12 * ADDON.monthOre);
  });

  it("regner ut første betaling og fast pris med 25 % mva", () => {
    const q = quote("nettside", { interval: "month", addon: true, setup: true });
    expect(q.subtotalOre).toBe(19900 + 24900 + 390000);
    expect(q.vatOre).toBe(108700);
    expect(q.totalOre).toBe(543500);
    expect(q.recurringOre).toBe(44800);
    expect(quote("nettbutikk", { interval: "year", addon: false, setup: false })).toMatchObject({ subtotalOre: 406800, vatOre: 101700, recurringOre: 406800 });
  });
});

describe("Stripe-klienten", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("koder nøstede felt og lister slik Stripe vil ha dem, og hopper over tomme verdier", () => {
    const form = encodeForm({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1, tax_rates: ["txr_1"] }],
      metadata: { siteId: "abc" },
      automatic_tax: undefined,
      customer: null,
      flag: true,
    });
    expect([...form.entries()]).toEqual([
      ["mode", "subscription"],
      ["line_items[0][price]", "price_1"],
      ["line_items[0][quantity]", "1"],
      ["line_items[0][tax_rates][0]", "txr_1"],
      ["metadata[siteId]", "abc"],
      ["flag", "true"],
    ]);
  });

  it("sender nøkkel, låst API-versjon og skjemakoding, og gir norsk feilmelding", async () => {
    const fake = fakeStripe();
    await fake.client.get("/v1/prices", { lookup_keys: ["a", "b"] });
    await fake.client.post("/v1/customers", { name: "Test" }, { idempotencyKey: "nokkel-1" });
    const [get, post] = fake.calls;
    expect(get.query.get("lookup_keys[1]")).toBe("b");
    expect(get.headers.get("authorization")).toBe("Bearer sk_test_123");
    expect(get.headers.get("stripe-version")).toBe(STRIPE_API_VERSION);
    expect(post.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(post.headers.get("idempotency-key")).toBe("nokkel-1");
    expect(post.body.get("name")).toBe("Test");
    await expect(fake.client.get("/v1/finnes-ikke")).rejects.toBeInstanceOf(StripeApiError);
    await expect(fake.client.get("/v1/finnes-ikke")).rejects.toThrow(/Stripe svarte 404/);
    expect(fake.client.mode).toBe("test");
  });

  it("sier fra når nøklene mangler", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(getStripe()).toBeNull();
    expect(missingBillingConfig()).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    expect(getStripe()?.mode).toBe("live");
    expect(missingBillingConfig()).toEqual(["STRIPE_WEBHOOK_SECRET"]);
  });
});

describe("webhook-signatur", () => {
  const payload = JSON.stringify(event("invoice.paid", { id: "in_1" }));

  it("godtar en gyldig signatur, også som rå bytes", async () => {
    const e = await verifyStripeSignature(payload, sign(payload), SECRET);
    expect(e.type).toBe("invoice.paid");
    const bytes = new TextEncoder().encode(payload);
    expect((await verifyStripeSignature(bytes, sign(payload), SECRET)).id).toBe(e.id);
  });

  it("godtar når én av flere signaturer stemmer, som når hemmeligheten byttes", async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v1=${"0".repeat(64)},${sign(payload, SECRET, t).split(",")[1]}`;
    expect((await verifyStripeSignature(payload, header, SECRET)).type).toBe("invoice.paid");
  });

  it("avviser feil hemmelighet og endret innhold", async () => {
    const reason = (p: Promise<unknown>) => p.then(() => "godtatt", (err: unknown) => (err instanceof WebhookSignatureError ? err.reason : "annen feil"));
    expect(await reason(verifyStripeSignature(payload, sign(payload, "whsec_feil"), SECRET))).toBe("signatur");
    expect(await reason(verifyStripeSignature(payload.replace("in_1", "in_2"), sign(payload), SECRET))).toBe("signatur");
    expect(await reason(verifyStripeSignature(payload, null, SECRET))).toBe("mangler");
    expect(await reason(verifyStripeSignature(payload, "tull", SECRET))).toBe("format");
  });

  it("avviser hendelser som er for gamle, men ikke innenfor fem minutter", async () => {
    const now = new Date();
    const t = Math.floor(now.getTime() / 1000);
    const old = t - SIGNATURE_TOLERANCE_SECONDS - 1;
    await expect(verifyStripeSignature(payload, sign(payload, SECRET, old), SECRET, { now })).rejects.toMatchObject({ reason: "tidspunkt" });
    const recent = t - SIGNATURE_TOLERANCE_SECONDS + 1;
    await expect(verifyStripeSignature(payload, sign(payload, SECRET, recent), SECRET, { now })).resolves.toMatchObject({ type: "invoice.paid" });
  });
});

describe("med database", () => {
  let db: Db;
  let siteId: string;
  let shopId: string;
  let otherSiteId: string;
  let user: { id: string; email: string };
  let fake: ReturnType<typeof fakeStripe>;

  const loadSite = async (id: string) => (await db.select().from(sites).where(eq(sites.id, id)))[0];
  const billingOf = async (id: string) => readBilling((await loadSite(id)).billing);
  const setBilling = (id: string, billing: Partial<SiteBilling>) => db.update(sites).set({ billing }).where(eq(sites.id, id));
  const checkoutBody = () => fake.posted("/v1/checkout/sessions").at(-1)!.body;

  function subscription(overrides: Json = {}): Json {
    return {
      id: "sub_1",
      object: "subscription",
      status: "active",
      customer: "cus_1",
      metadata: { app: "nettgata", siteId, plan: "nettside" },
      cancel_at_period_end: false,
      cancel_at: null,
      items: {
        object: "list",
        data: [
          { id: "si_1", price: fake.prices.get("nettgata_nettside_mnd"), current_period_end: PERIOD_END },
          { id: "si_2", price: fake.prices.get("nettgata_tillegg_ai_mnd"), current_period_end: PERIOD_END },
        ],
      },
      ...overrides,
    };
  }

  const completedSession = (overrides: Json = {}): Json => ({
    id: "cs_test_abc123456",
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    subscription: "sub_1",
    customer: "cus_1",
    client_reference_id: siteId,
    metadata: { app: "nettgata", siteId, plan: "nettside", setup: "1" },
    ...overrides,
  });

  beforeEach(async () => {
    db = await createPgliteDb();
    fake = fakeStripe();
    const [u] = await db.insert(users).values({ email: "eier@hansen.no", passwordHash: "x" }).returning();
    user = { id: u.id, email: u.email };
    const [org] = await db.insert(organizations).values({ name: "Rørlegger Hansen AS", orgnr: "927889404" }).returning();
    const insertSite = async (values: { name: string; slug: string; kind?: "nettside" | "nettbutikk" }) =>
      (await db.insert(sites).values({ orgId: org.id, industryPack: "handverker", theme: demoTheme, ...values }).returning())[0].id;
    siteId = await insertSite({ name: "Rørlegger Hansen", slug: "hansen" });
    shopId = await insertSite({ name: "Hansen Butikk", slug: "hansen-butikk", kind: "nettbutikk" });
    otherSiteId = await insertSite({ name: "Et annet nettsted", slug: "annet" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("migreringen", () => {
    it("gir nye nettsteder et tomt abonnement", async () => {
      const site = await loadSite(siteId);
      expect(site.billing).toEqual({});
      expect(readBilling(site.billing)).toMatchObject({ status: "none", manual: false, stripeCustomerId: null, events: [] });
    });
  });

  describe("Checkout", () => {
    it("lager økten med riktige priser, mva på hver linje og nettstedet i metadata", async () => {
      const url = await startCheckout(db, fake.client, {
        site: await loadSite(siteId),
        user,
        choice: { interval: "month", addon: true, setup: true },
        baseUrl: "https://nettgata.no",
      });
      expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_abc123456");

      const priceQuery = fake.fetched("/v1/prices")[0].query;
      expect([0, 1, 2].map((i) => priceQuery.get(`lookup_keys[${i}]`))).toEqual(["nettgata_nettside_mnd", "nettgata_tillegg_ai_mnd", "nettgata_oppstart_nettside"]);
      expect(priceQuery.get("active")).toBe("true");

      const body = checkoutBody();
      expect(body.get("mode")).toBe("subscription");
      expect(body.get("customer")).toBe("cus_1");
      expect(body.get("line_items[0][price]")).toBe("price_nettgata_nettside_mnd");
      expect(body.get("line_items[1][price]")).toBe("price_nettgata_tillegg_ai_mnd");
      expect(body.get("line_items[2][price]")).toBe("price_nettgata_oppstart_nettside");
      for (const i of [0, 1, 2]) {
        expect(body.get(`line_items[${i}][quantity]`)).toBe("1");
        expect(body.get(`line_items[${i}][tax_rates][0]`)).toBe("txr_mva");
      }
      expect(body.has("line_items[3][price]")).toBe(false);
      expect(body.has("automatic_tax[enabled]")).toBe(false);
      expect(body.get("client_reference_id")).toBe(siteId);
      expect(body.get("metadata[siteId]")).toBe(siteId);
      expect(body.get("metadata[setup]")).toBe("1");
      expect(body.get("subscription_data[metadata][siteId]")).toBe(siteId);
      expect(body.get("billing_address_collection")).toBe("required");
      expect(body.get("tax_id_collection[enabled]")).toBe("true");
      expect(body.get("customer_update[address]")).toBe("auto");
      expect(body.get("locale")).toBe("nb");
      expect(body.has("payment_method_types[0]")).toBe(false);
      expect(body.get("success_url")).toBe(`https://nettgata.no/studio/nettsted/${siteId}/abonnement?betaling=fullfort&okt={CHECKOUT_SESSION_ID}`);
      expect(body.get("cancel_url")).toBe(`https://nettgata.no/studio/nettsted/${siteId}/abonnement?betaling=avbrutt`);

      // Kunden får bedriftsnavn, norsk språk og org.nr på fakturaen.
      const customer = fake.posted("/v1/customers")[0];
      expect(customer.body.get("name")).toBe("Rørlegger Hansen AS");
      expect(customer.body.get("email")).toBe("eier@hansen.no");
      expect(customer.body.get("preferred_locales[0]")).toBe("nb");
      expect(customer.body.get("invoice_settings[custom_fields][0][value]")).toBe("927 889 404");
      expect(customer.body.get("metadata[siteId]")).toBe(siteId);
      expect(customer.headers.get("idempotency-key")).toMatch(new RegExp(`^nettgata-kunde-${siteId}-[0-9a-f]{16}$`));

      expect((await billingOf(siteId)).stripeCustomerId).toBe("cus_1");
      const log = await db.select().from(auditLog).where(eq(auditLog.siteId, siteId));
      expect(log.map((l) => l.action)).toEqual(["billing.checkout_started"]);
    });

    it("nettbutikk med årlig betaling får årsprisene, også for tillegget", async () => {
      await startCheckout(db, fake.client, { site: await loadSite(shopId), user, choice: { interval: "year", addon: true, setup: false }, baseUrl: "http://localhost:3000" });
      const body = checkoutBody();
      expect(body.get("line_items[0][price]")).toBe("price_nettgata_nettbutikk_ar");
      expect(body.get("line_items[1][price]")).toBe("price_nettgata_tillegg_ai_ar");
      expect(body.has("line_items[2][price]")).toBe(false);
      expect(body.get("metadata[plan]")).toBe("nettbutikk");
    });

    it("bruker samme Stripe-kunde neste gang", async () => {
      const choice = { interval: "month" as const, addon: false, setup: false };
      await startCheckout(db, fake.client, { site: await loadSite(siteId), user, choice, baseUrl: "https://nettgata.no" });
      await startCheckout(db, fake.client, { site: await loadSite(siteId), user, choice, baseUrl: "https://nettgata.no" });
      expect(fake.posted("/v1/customers")).toHaveLength(1);
      expect(fake.posted("/v1/checkout/sessions").map((c) => c.body.get("customer"))).toEqual(["cus_1", "cus_1"]);
    });

    it("stopper når prisen i Stripe ikke stemmer med vedtatt pris", async () => {
      fake.prices.get("nettgata_nettside_mnd")!.unit_amount = 18900;
      const err = await startCheckout(db, fake.client, { site: await loadSite(siteId), user, choice: { interval: "month", addon: false, setup: false }, baseUrl: "https://nettgata.no" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BillingError);
      expect((err as BillingError).message).toBe(NOT_READY);
      expect((err as BillingError).adminDetail).toMatch(/nettgata_nettside_mnd koster 189 kr i Stripe, men vedtatt pris er 199 kr/);
      expect(fake.posted("/v1/checkout/sessions")).toHaveLength(0);
    });

    it("stopper når en pris mangler eller har feil intervall", async () => {
      fake.prices.delete("nettgata_oppstart_nettside");
      fake.prices.get("nettgata_nettside_mnd")!.recurring = { interval: "year", interval_count: 1 };
      const err = (await startCheckout(db, fake.client, {
        site: await loadSite(siteId),
        user,
        choice: { interval: "month", addon: false, setup: true },
        baseUrl: "https://nettgata.no",
      }).catch((e: unknown) => e)) as BillingError;
      expect(err.adminDetail).toMatch(/nettgata_nettside_mnd skal være en månedlig pris/);
      expect(err.adminDetail).toMatch(/Fant ingen aktiv pris med oppslagsnøkkelen nettgata_oppstart_nettside/);
      expect(fake.posted("/v1/checkout/sessions")).toHaveLength(0);
    });

    it("stopper uten 25 % mva, og godtar ikke mva som er inkludert i prisen", async () => {
      fake.taxRates.splice(0, 1, { id: "txr_inkl", active: true, percentage: 25, inclusive: true, country: "NO", jurisdiction: null });
      const err = (await startCheckout(db, fake.client, {
        site: await loadSite(siteId),
        user,
        choice: { interval: "month", addon: false, setup: false },
        baseUrl: "https://nettgata.no",
      }).catch((e: unknown) => e)) as BillingError;
      expect(err).toBeInstanceOf(BillingError);
      expect(err.adminDetail).toMatch(/Stripe mangler 25 % mva/);
      expect(fake.posted("/v1/checkout/sessions")).toHaveLength(0);
      expect(isNorwegianVat({ id: "a", active: true, percentage: 25, inclusive: false, country: null, jurisdiction: "Norge" })).toBe(true);
      expect(isNorwegianVat({ id: "b", active: true, percentage: 25, inclusive: false, country: "SE", jurisdiction: null })).toBe(false);
      expect(isNorwegianVat({ id: "c", active: false, percentage: 25, inclusive: false, country: "NO", jurisdiction: null })).toBe(false);
    });

    it("bruker Stripe Tax når det er slått på og ingen fast sats finnes", async () => {
      fake.taxRates.length = 0;
      fake.taxSettings.status = "active";
      await startCheckout(db, fake.client, { site: await loadSite(siteId), user, choice: { interval: "month", addon: true, setup: false }, baseUrl: "https://nettgata.no" });
      const body = checkoutBody();
      expect(body.get("automatic_tax[enabled]")).toBe("true");
      expect(body.has("line_items[0][tax_rates][0]")).toBe(false);
    });

    it("lar ikke kunden kjøpe et abonnement til når det finnes et, eller når det faktureres utenom Stripe", async () => {
      await setBilling(siteId, { status: "active", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" });
      const choice = { interval: "month" as const, addon: false, setup: false };
      await expect(startCheckout(db, fake.client, { site: await loadSite(siteId), user, choice, baseUrl: "https://nettgata.no" })).rejects.toThrow(/allerede et abonnement/);
      await setBilling(siteId, { manual: true });
      await expect(startCheckout(db, fake.client, { site: await loadSite(siteId), user, choice, baseUrl: "https://nettgata.no" })).rejects.toThrow(/utenom kortbetaling/);
      expect(fake.calls).toHaveLength(0);
    });

    it("kundeportalen åpnes for kunden, med vei tilbake til studioet", async () => {
      const back = `https://nettgata.no/studio/nettsted/${siteId}/abonnement`;
      expect(await createPortalSession(fake.client, readBilling({ stripeCustomerId: "cus_1" }), back)).toBe("https://billing.stripe.com/p/session/test_1");
      const call = fake.posted("/v1/billing_portal/sessions")[0];
      expect(call.body.get("customer")).toBe("cus_1");
      expect(call.body.get("return_url")).toBe(back);
      await expect(createPortalSession(fake.client, readBilling({}), back)).rejects.toBeInstanceOf(BillingError);
    });
  });

  describe("statusoppdatering fra Stripe", () => {
    beforeEach(() => {
      fake.subscriptions.set("sub_1", subscription());
    });

    it("betalt Checkout gir aktivt abonnement med plan, tillegg, periode og oppstart", async () => {
      const result = await handleStripeEvent(db, fake.client, event("checkout.session.completed", completedSession()));
      expect(result).toEqual({ status: "oppdatert", siteId });
      const billing = await billingOf(siteId);
      expect(billing).toMatchObject({
        status: "active",
        plan: "nettside",
        interval: "month",
        addon: true,
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        currentPeriodEnd: "2026-12-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      });
      expect(billing.setupPaidAt).not.toBeNull();
      expect(hasActiveSubscription(billing)).toBe(true);
      expect(summarizeBilling(billing, () => "1. desember")).toEqual({ label: "Aktivt", tone: "ok", text: "Neste betaling er 1. desember." });
    });

    it("samme hendelse to ganger gir én oppdatering", async () => {
      const e = event("checkout.session.completed", completedSession());
      await handleStripeEvent(db, fake.client, e);
      expect(await handleStripeEvent(db, fake.client, e)).toEqual({ status: "duplikat", siteId });
      expect(fake.fetched("/v1/subscriptions")).toHaveLength(1);
      const log = await db.select().from(auditLog).where(eq(auditLog.siteId, siteId));
      expect(log.filter((l) => l.action === "billing.stripe")).toHaveLength(1);
    });

    it("feilet trekk gir betalingsproblem, men kunden beholder tilgangen mens Stripe prøver igjen", async () => {
      await handleStripeEvent(db, fake.client, event("checkout.session.completed", completedSession()));
      fake.subscriptions.set("sub_1", subscription({ status: "past_due" }));
      const failed = event("invoice.payment_failed", { id: "in_1", parent: { subscription_details: { subscription: "sub_1", metadata: { siteId } } } });
      expect((await handleStripeEvent(db, fake.client, failed)).status).toBe("oppdatert");
      const billing = await billingOf(siteId);
      expect(billing.status).toBe("past_due");
      expect(hasActiveSubscription(billing)).toBe(true);
      expect(summarizeBilling(billing, String).label).toBe("Betalingen feilet");

      // invoice.paid med eldre API-form (subscription rett på fakturaen) tar den tilbake til aktiv.
      fake.subscriptions.set("sub_1", subscription());
      expect((await handleStripeEvent(db, fake.client, event("invoice.paid", { id: "in_2", subscription: "sub_1" }))).status).toBe("oppdatert");
      expect((await billingOf(siteId)).status).toBe("active");
    });

    it("oppsigelse vises med sluttdato, og slettet abonnement stenger for eget domene", async () => {
      await handleStripeEvent(db, fake.client, event("checkout.session.completed", completedSession()));
      fake.subscriptions.set("sub_1", subscription({ cancel_at_period_end: true }));
      await handleStripeEvent(db, fake.client, event("customer.subscription.updated", { id: "sub_1", metadata: { siteId } }));
      let billing = await billingOf(siteId);
      expect(billing).toMatchObject({ cancelAtPeriodEnd: true, cancelAt: "2026-12-01T00:00:00.000Z", status: "active" });
      expect(summarizeBilling(billing, () => "1. desember").text).toBe("Abonnementet varer til 1. desember, og blir ikke fornyet.");

      fake.subscriptions.set("sub_1", subscription({ status: "canceled" }));
      await handleStripeEvent(db, fake.client, event("customer.subscription.deleted", { id: "sub_1", metadata: { siteId } }));
      billing = await billingOf(siteId);
      expect(billing.status).toBe("canceled");
      expect(hasActiveSubscription(billing)).toBe(false);
      expect(canConnectDomain(billing, false)).toBe(false);
    });

    it("henter alltid fersk tilstand, så hendelser i feil rekkefølge ikke gjør skade", async () => {
      // Slettet hos Stripe før «updated»-hendelsen rakk fram: resultatet blir likevel avsluttet.
      fake.subscriptions.set("sub_1", subscription({ status: "canceled" }));
      await handleStripeEvent(db, fake.client, event("customer.subscription.deleted", { id: "sub_1", metadata: { siteId } }));
      await handleStripeEvent(db, fake.client, event("customer.subscription.updated", { id: "sub_1", metadata: { siteId }, status: "active" }));
      expect((await billingOf(siteId)).status).toBe("canceled");
    });

    it("et svar hentet tidligere overskriver aldri et nyere", async () => {
      const later = new Date("2026-11-01T12:00:00Z");
      const earlier = new Date("2026-11-01T11:59:00Z");
      expect((await handleStripeEvent(db, fake.client, event("invoice.paid", { id: "in_1", subscription: "sub_1" }, "evt_a"), later)).status).toBe("oppdatert");
      fake.subscriptions.set("sub_1", subscription({ status: "past_due" }));
      expect((await handleStripeEvent(db, fake.client, event("invoice.paid", { id: "in_1", subscription: "sub_1" }, "evt_b"), earlier)).status).toBe("eldre");
      expect((await billingOf(siteId)).status).toBe("active");
    });

    it("leser perioden fra linjene og velger den tidligste", async () => {
      fake.subscriptions.set(
        "sub_1",
        subscription({
          items: {
            data: [
              { id: "si_1", price: fake.prices.get("nettgata_nettside_ar"), current_period_end: PERIOD_END + 31 * 86400 },
              { id: "si_2", price: fake.prices.get("nettgata_tillegg_ai_ar"), current_period_end: PERIOD_END },
            ],
          },
        }),
      );
      await handleStripeEvent(db, fake.client, event("invoice.paid", { id: "in_1", subscription: "sub_1" }));
      expect(await billingOf(siteId)).toMatchObject({ interval: "year", addon: true, currentPeriodEnd: "2026-12-01T00:00:00.000Z" });
    });

    it("rører ikke nettstedene for abonnementer som ikke er våre", async () => {
      fake.subscriptions.set("sub_annet", { id: "sub_annet", status: "active", customer: "cus_annet", metadata: { slug: "bedriftsflyt" }, cancel_at_period_end: false, cancel_at: null, items: { data: [] } });
      const result = await handleStripeEvent(db, fake.client, event("customer.subscription.updated", { id: "sub_annet", metadata: { slug: "bedriftsflyt" } }));
      expect(result.status).toBe("ignorert");
      for (const id of [siteId, shopId, otherSiteId]) expect((await loadSite(id)).billing).toEqual({});
    });

    it("et gammelt, avsluttet abonnement overskriver ikke det nye", async () => {
      await handleStripeEvent(db, fake.client, event("checkout.session.completed", completedSession()));
      fake.subscriptions.set("sub_gammelt", subscription({ id: "sub_gammelt", status: "canceled" }));
      const result = await handleStripeEvent(db, fake.client, event("customer.subscription.deleted", { id: "sub_gammelt", metadata: { siteId } }));
      expect(result.status).toBe("ignorert");
      expect(await billingOf(siteId)).toMatchObject({ stripeSubscriptionId: "sub_1", status: "active" });
    });

    it("ignorerer hendelser fra feil modus og typer som ikke brukes", async () => {
      const live = { ...event("invoice.paid", { id: "in_1", subscription: "sub_1" }), livemode: true };
      expect((await handleStripeEvent(db, fake.client, live)).status).toBe("ignorert");
      expect((await handleStripeEvent(db, fake.client, event("charge.refunded", { id: "ch_1" }))).status).toBe("ignorert");
      expect((await handleStripeEvent(db, fake.client, event("invoice.paid", { id: "in_engang" }))).status).toBe("ignorert");
      expect(fake.calls).toHaveLength(0);
    });

    it("bekrefter betalingen når kunden kommer tilbake, men bare for riktig nettsted", async () => {
      fake.sessions.set("cs_test_abc123456", completedSession());
      expect((await confirmCheckoutSession(db, fake.client, otherSiteId, "cs_test_abc123456")).status).toBe("ignorert");
      expect((await loadSite(otherSiteId)).billing).toEqual({});
      expect((await confirmCheckoutSession(db, fake.client, siteId, "cs_test_abc123456")).status).toBe("oppdatert");
      expect((await billingOf(siteId)).status).toBe("active");
      expect((await confirmCheckoutSession(db, fake.client, siteId, "../tull")).status).toBe("ignorert");
    });
  });

  describe("webhook-ruten", () => {
    const post = (payload: string, signature: string | null) =>
      webhookRoute(
        new Request("https://nettgata.no/api/stripe/webhook", {
          method: "POST",
          body: payload,
          headers: signature ? { "stripe-signature": signature } : {},
        }),
      );

    beforeEach(() => {
      setDbForTests(db);
      vi.stubGlobal("fetch", fake.fetch);
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
      fake.subscriptions.set("sub_1", subscription());
    });

    it("oppdaterer abonnementet ved gyldig signatur", async () => {
      const payload = JSON.stringify(event("checkout.session.completed", completedSession()));
      const res = await post(payload, sign(payload));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ received: true, status: "oppdatert", siteId });
      expect((await billingOf(siteId)).status).toBe("active");
    });

    it("avviser feil signatur uten å røre noe", async () => {
      const payload = JSON.stringify(event("checkout.session.completed", completedSession()));
      expect((await post(payload, sign(payload, "whsec_annen"))).status).toBe(400);
      expect((await post(payload, null)).status).toBe(400);
      expect((await loadSite(siteId)).billing).toEqual({});
      expect(fake.calls).toHaveLength(0);
    });

    it("svarer 503 når Stripe ikke er satt opp, så Stripe prøver igjen senere", async () => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
      const payload = JSON.stringify(event("checkout.session.completed", completedSession()));
      expect((await post(payload, sign(payload))).status).toBe(503);
    });

    it("svarer 500 når Stripe ikke svarer, så hendelsen sendes på nytt", async () => {
      fake.subscriptions.clear();
      const payload = JSON.stringify(event("checkout.session.completed", completedSession()));
      expect((await post(payload, sign(payload))).status).toBe(500);
      expect((await billingOf(siteId)).events).toEqual([]);
    });
  });

  describe("eget domene krever abonnement", () => {
    it("åpnes for betalende og for plattformadmin", () => {
      expect(canConnectDomain({}, false)).toBe(false);
      expect(canConnectDomain({}, true)).toBe(true);
      expect(canConnectDomain({ status: "active", stripeSubscriptionId: "sub_1" }, false)).toBe(true);
      expect(canConnectDomain({ status: "trialing" }, false)).toBe(true);
      expect(canConnectDomain({ status: "past_due" }, false)).toBe(true);
      expect(canConnectDomain({ status: "unpaid" }, false)).toBe(false);
      expect(canConnectDomain({ status: "canceled" }, false)).toBe(false);
      expect(canConnectDomain({ status: "incomplete" }, false)).toBe(false);
      expect(DOMAIN_NEEDS_SUBSCRIPTION).toMatch(/«Abonnement»/);
    });

    it("plattformadmin kan slå på fakturert utenom Stripe, og det logges", async () => {
      await setManualBilling(db, siteId, { manual: true, note: "Faktura 3012" }, user.id);
      let site = await loadSite(siteId);
      expect(canConnectDomain(site.billing, false)).toBe(true);
      expect(readBilling(site.billing)).toMatchObject({ manual: true, manualNote: "Faktura 3012" });
      expect(summarizeBilling(readBilling(site.billing), String).label).toBe("Faktureres direkte");

      await setManualBilling(db, siteId, { manual: false, note: "" }, user.id);
      site = await loadSite(siteId);
      expect(canConnectDomain(site.billing, false)).toBe(false);
      const log = await db.select().from(auditLog).where(eq(auditLog.siteId, siteId));
      expect(log.map((l) => l.action).sort()).toEqual(["billing.manual_off", "billing.manual_on"]);
    });

    it("fakturert utenom Stripe visker ikke ut Stripe-feltene", async () => {
      await setBilling(siteId, { stripeCustomerId: "cus_9", status: "canceled" });
      await setManualBilling(db, siteId, { manual: true, note: "" }, user.id);
      expect(await billingOf(siteId)).toMatchObject({ stripeCustomerId: "cus_9", status: "canceled", manual: true });
    });
  });
});

describe("lagring og tekst", () => {
  it("én ødelagt verdi visker ikke ut resten", () => {
    const billing = readBilling({ status: 5, stripeCustomerId: "cus_9", events: "tull", plan: "gratis", cancelAtPeriodEnd: "ja" });
    expect(billing).toMatchObject({ status: "none", stripeCustomerId: "cus_9", events: [], plan: null, cancelAtPeriodEnd: false });
    expect(readBilling(null).status).toBe("none");
    expect(readBilling([1, 2]).manual).toBe(false);
  });

  it("tekstene kunden ser har ikke tankestrek", () => {
    const texts = [DOMAIN_NEEDS_SUBSCRIPTION, NOT_READY, ADDON.includes, PLANS.nettside.setupIncludes, PLANS.nettbutikk.setupIncludes];
    for (const status of ["none", "active", "trialing", "past_due", "unpaid", "paused", "canceled", "incomplete", "incomplete_expired"]) {
      for (const cancel of [false, true]) {
        const s = summarizeBilling(readBilling({ status, cancelAtPeriodEnd: cancel, currentPeriodEnd: "2026-12-01T00:00:00.000Z" }), () => "1. desember");
        texts.push(s.label, s.text ?? "");
      }
    }
    texts.push(summarizeBilling(readBilling({ manual: true }), String).text ?? "");
    for (const text of texts) expect(noDashes(text), text).toBe(true);
  });
});
