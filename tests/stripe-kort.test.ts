import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, orders, organizations, productVariants, sites, users } from "@/db/schema";
import { parsePaymentRef } from "@/lib/payments/common";
import { currentStripeConnect, disconnectStripe, startStripeOnboarding, stripeSetupView, syncStripeAccount, updateShopSettings } from "@/lib/payments/config";
import { changeOrderStatus, handleCustomerCancel, handlePaymentReturn, refundPartOfPayment, returnUrl, startPayment, sweepPayments } from "@/lib/payments/service";
import { createProduct } from "@/lib/shop/catalog";
import { createOrder, type CheckoutInput } from "@/lib/shop/orders";
import { availablePaymentMethods, readShopSettings } from "@/lib/shop/settings";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));

const KEY = "sk_test_plattformnokkel";
const ACCOUNT = "acct_1Butikken";

type Recorded = { method: string; path: string; headers: Record<string, string>; body: URLSearchParams };
type Intent = { id: string; status: string; amount: number; amount_received: number; currency: string; metadata: Record<string, string>; latest_charge: { amount_refunded: number } };
type Session = { id: string; status: string; url: string; payment_intent: Intent | null; amount: number; orderId: string };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Stripe slik testene ser den: et lite, tilstandsfullt etterlignet API bak fetch. */
function stripeWorld() {
  const calls: Recorded[] = [];
  const sessions = new Map<string, Session>();
  const account = { id: ACCOUNT, charges_enabled: true, details_submitted: true };
  const idempotent = new Map<string, unknown>();
  let counter = 0;

  const intentOf = (id: string) => [...sessions.values()].map((s) => s.payment_intent).find((pi) => pi?.id === id);

  function route(method: string, path: string, headers: Record<string, string>, body: URLSearchParams): Response {
    if (headers.authorization !== `Bearer ${KEY}`) return json(401, { error: { message: "nei", code: "api_key" } });
    if (path === "/v1/accounts" && method === "POST") return json(200, { ...account, charges_enabled: false, details_submitted: false });
    if (path === `/v1/accounts/${ACCOUNT}`) return json(200, account);
    if (path === "/v1/account_links") return json(200, { url: "https://connect.stripe.com/setup/s/abc" });

    // Alt under dette gjelder butikkens egen konto.
    if (headers["stripe-account"] !== ACCOUNT) return json(403, { error: { message: "feil konto", code: "account_invalid" } });
    if (path === "/v1/checkout/sessions" && method === "POST") {
      const id = `cs_test_${++counter}`;
      const session: Session = {
        id,
        status: "open",
        url: `https://checkout.stripe.com/c/pay/${id}`,
        payment_intent: null,
        amount: Number(body.get("line_items[0][price_data][unit_amount]")),
        orderId: String(body.get("metadata[orderId]")),
      };
      sessions.set(id, session);
      return json(200, session);
    }
    const expire = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(path);
    if (expire) {
      const s = sessions.get(expire[1])!;
      if (s.status !== "open") return json(400, { error: { message: "ikke åpen", code: "checkout_session_not_open" } });
      s.status = "expired";
      return json(200, s);
    }
    const read = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
    if (read) {
      const s = sessions.get(read[1]);
      return s ? json(200, s) : json(404, { error: { message: "finnes ikke", code: "resource_missing" } });
    }
    const capture = /^\/v1\/payment_intents\/([^/]+)\/capture$/.exec(path);
    if (capture) {
      const pi = intentOf(capture[1])!;
      pi.status = "succeeded";
      pi.amount_received = Number(body.get("amount_to_capture"));
      return json(200, pi);
    }
    const cancel = /^\/v1\/payment_intents\/([^/]+)\/cancel$/.exec(path);
    if (cancel) {
      const pi = intentOf(cancel[1])!;
      pi.status = "canceled";
      return json(200, pi);
    }
    if (path === "/v1/refunds") {
      const pi = intentOf(String(body.get("payment_intent")))!;
      pi.latest_charge.amount_refunded += Number(body.get("amount"));
      return json(200, { id: "re_1", status: "succeeded" });
    }
    return json(404, { error: { message: `ukjent ${path}`, code: "resource_missing" } });
  }

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    calls.push({ method: init?.method ?? "GET", path: url.pathname, headers, body });
    const key = headers["idempotency-key"];
    if (key && idempotent.has(key)) return json(200, idempotent.get(key));
    const res = route(init?.method ?? "GET", url.pathname, headers, body);
    if (key && res.ok) idempotent.set(key, await res.clone().json());
    return res;
  });

  return {
    calls,
    sessions,
    account,
    fetchMock,
    find: (method: string, path: string) => calls.filter((c) => c.method === method && c.path.includes(path)),
    /** Kunden betaler på Stripes side. Beløpet er reservert, ikke trukket. */
    pay(sessionId: string, overrides: Partial<Intent> = {}) {
      const s = sessions.get(sessionId)!;
      s.status = "complete";
      s.payment_intent = {
        id: `pi_${sessionId}`,
        status: "requires_capture",
        amount: s.amount,
        amount_received: 0,
        currency: "nok",
        metadata: { orderId: s.orderId },
        latest_charge: { amount_refunded: 0 },
        ...overrides,
      };
    },
  };
}

describe("kort med Stripe", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let lueId: string;
  let world: ReturnType<typeof stripeWorld>;

  beforeEach(async () => {
    db = await createPgliteDb();
    setDbForTests(db);
    vi.stubEnv("STRIPE_SECRET_KEY", KEY);
    const [user] = await db.insert(users).values({ email: "eier@ullstua.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Ullstua AS" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Ullstua", slug: "ullstua", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme, info: { email: "post@ullstua.no" } })
      .returning();
    siteId = site.id;
    userId = user.id;
    const lue = await createProduct(db, siteId, { name: "Strikket lue", vatRate: 25, status: "active", variants: [{ optionValues: [], priceOre: 39900, stock: 5 }] }, userId);
    [{ id: lueId }] = await db.select().from(productVariants).where(eq(productVariants.productId, lue.id));
    world = stripeWorld();
    vi.stubGlobal("fetch", world.fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function site() {
    const [row] = await db.select().from(sites).where(eq(sites.id, siteId));
    return row;
  }

  const urls = { returnUrl: "https://nettgata.no/ferdig", refreshUrl: "https://nettgata.no/utlopt" };

  async function connect() {
    await startStripeOnboarding(db, await site(), { id: userId, email: "eier@ullstua.no" }, urls);
    await syncStripeAccount(db, await site(), userId);
  }

  async function order(overrides: Partial<CheckoutInput> = {}) {
    const input: CheckoutInput = {
      lines: [{ variantId: lueId, quantity: 2 }],
      name: "Kari Nordmann",
      email: "kari@test.no",
      shippingCode: "post",
      address: { street: "Storgata 1", postalCode: "3340", city: "Åmot" },
      paymentMethod: "stripe",
      acceptedTerms: true,
      ...overrides,
    };
    return createOrder(db, siteId, readShopSettings((await site()).shop), input, { startsPayment: true });
  }

  const start = async (o: Awaited<ReturnType<typeof order>>) => startPayment(db, await site(), o, returnUrl("https://ullstua.no", o));

  async function orderRow(id: string) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row;
  }

  const sessionOf = (paymentRef: string | null) => {
    const ref = parsePaymentRef(paymentRef);
    if (ref?.provider !== "stripe") throw new Error("Ikke en Stripe-referanse");
    return ref.sessionId;
  };

  async function paidOrder() {
    await connect();
    const o = await order();
    await start(o);
    world.pay(sessionOf((await orderRow(o.id)).paymentRef));
    await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    return o;
  }

  it("oppretter en konto der Stripe står for kontroll og tap, og lagrer ingen hemmeligheter", async () => {
    const link = await startStripeOnboarding(db, await site(), { id: userId, email: "eier@ullstua.no" }, urls);
    expect(link).toBe("https://connect.stripe.com/setup/s/abc");
    const [created] = world.find("POST", "/v1/accounts");
    expect(created.headers["stripe-account"]).toBeUndefined();
    expect(created.body.get("controller[losses][payments]")).toBe("stripe");
    expect(created.body.get("controller[fees][payer]")).toBe("account");
    expect(created.body.get("controller[requirement_collection]")).toBe("stripe");
    expect(created.body.get("controller[stripe_dashboard][type]")).toBe("full");
    expect(created.body.get("country")).toBe("NO");
    expect(JSON.stringify((await site()).shop)).not.toContain(KEY);
    // Ikke godkjent ennå: kort vises ikke i kassen.
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).not.toContain("stripe");
  });

  it("gjenbruker kontoen når eieren fortsetter, og viser kort når Stripe har godkjent", async () => {
    await startStripeOnboarding(db, await site(), { id: userId, email: "eier@ullstua.no" }, urls);
    await startStripeOnboarding(db, await site(), { id: userId, email: "eier@ullstua.no" }, urls);
    expect(world.find("POST", "/v1/accounts")).toHaveLength(1);
    await syncStripeAccount(db, await site(), userId);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toContain("stripe");
    expect(stripeSetupView((await site()).shop)).toEqual({ available: true, connection: { environment: "test", chargesEnabled: true, detailsSubmitted: true } });

    // Stripe stenger kontoen: kort forsvinner fra kassen.
    world.account.charges_enabled = false;
    await syncStripeAccount(db, await site(), userId);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).not.toContain("stripe");
  });

  it("sier at kort ikke er slått på når plattformen mangler nøkkelen", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(stripeSetupView((await site()).shop).available).toBe(false);
    await expect(startStripeOnboarding(db, await site(), { id: userId, email: "e@e.no" }, urls)).rejects.toThrow(/ikke slått på/);
  });

  it("lagring av butikkinnstillinger beholder koblingen", async () => {
    await connect();
    await updateShopSettings(db, siteId, readShopSettings((await site()).shop));
    expect(currentStripeConnect((await site()).shop)?.accountId).toBe(ACCOUNT);
  });

  it("betalingen er en direkte betaling på butikkens konto, uten andel til plattformen, og beløpet bare reserveres", async () => {
    await connect();
    const o = await order();
    const url = await start(o);
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [created] = world.find("POST", "/v1/checkout/sessions");
    expect(created.headers["stripe-account"]).toBe(ACCOUNT);
    expect(created.body.get("payment_intent_data[capture_method]")).toBe("manual");
    expect(created.body.get("payment_intent_data[application_fee_amount]")).toBeNull();
    expect(created.body.get("line_items[0][price_data][unit_amount]")).toBe(String(o.totalOre));
    expect(created.body.get("line_items[0][price_data][currency]")).toBe("nok");
    expect(created.body.get("locale")).toBe("nb");
    expect(parsePaymentRef((await orderRow(o.id)).paymentRef)).toMatchObject({ provider: "stripe", environment: "test", accountId: ACCOUNT });
  });

  it("ordren blir betalt først når Stripe bekrefter, og bare én gang", async () => {
    await connect();
    const o = await order();
    await start(o);
    // Kunden kommer tilbake uten å ha betalt.
    expect((await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" }))?.paidOrderId).toBeNull();
    expect((await orderRow(o.id)).status).toBe("pending_payment");

    world.pay(sessionOf((await orderRow(o.id)).paymentRef));
    expect((await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" }))?.paidOrderId).toBe(o.id);
    expect((await orderRow(o.id)).status).toBe("paid");
    expect((await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" }))?.paidOrderId).toBeNull();
  });

  it("godtar ikke en betaling med feil beløp, og frigjør reservasjonen", async () => {
    await connect();
    const o = await order();
    await start(o);
    const sessionId = sessionOf((await orderRow(o.id)).paymentRef);
    world.pay(sessionId, { amount: 100 });
    await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect((await orderRow(o.id)).status).toBe("cancelled");
    expect(world.sessions.get(sessionId)!.payment_intent!.status).toBe("canceled");
    const mismatch = await db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, "payment.amount_mismatch")));
    expect(mismatch).toHaveLength(1);
  });

  it("trekker beløpet når ordren sendes", async () => {
    const o = await paidOrder();
    const sessionId = sessionOf((await orderRow(o.id)).paymentRef);
    const result = await changeOrderStatus(db, siteId, o.id, "fulfilled", userId);
    expect(result.message).toMatch(/trukket med Stripe/);
    expect(world.sessions.get(sessionId)!.payment_intent!.status).toBe("succeeded");
    expect(world.find("POST", "/capture")[0].body.get("amount_to_capture")).toBe(String(o.totalOre));
    expect(world.find("POST", "/capture")[0].headers["stripe-account"]).toBe(ACCOUNT);
  });

  it("stopper trekket når reservasjonen er utløpt", async () => {
    const o = await paidOrder();
    world.sessions.get(sessionOf((await orderRow(o.id)).paymentRef))!.payment_intent!.status = "canceled";
    await expect(changeOrderStatus(db, siteId, o.id, "fulfilled", userId)).rejects.toThrow(/frigjort eller utløpt/);
    expect((await orderRow(o.id)).status).toBe("paid");
  });

  it("kansellering frigjør reservasjonen uten refusjon", async () => {
    const o = await paidOrder();
    const sessionId = sessionOf((await orderRow(o.id)).paymentRef);
    await changeOrderStatus(db, siteId, o.id, "cancelled", userId);
    expect(world.sessions.get(sessionId)!.payment_intent!.status).toBe("canceled");
    expect(world.find("POST", "/v1/refunds")).toHaveLength(0);
  });

  it("refusjon etter sending betaler tilbake det som er trukket, også delvis", async () => {
    const o = await paidOrder();
    const sessionId = sessionOf((await orderRow(o.id)).paymentRef);
    await changeOrderStatus(db, siteId, o.id, "fulfilled", userId);

    await refundPartOfPayment(db, siteId, o.id, 5000, "11111111-1111-4111-8111-111111111111", userId);
    expect(world.sessions.get(sessionId)!.payment_intent!.latest_charge.amount_refunded).toBe(5000);
    await expect(refundPartOfPayment(db, siteId, o.id, o.totalOre, "22222222-2222-4222-8222-222222222222", userId)).rejects.toThrow(/kr igjen/);

    await changeOrderStatus(db, siteId, o.id, "refunded", userId);
    expect(world.sessions.get(sessionId)!.payment_intent!.latest_charge.amount_refunded).toBe(o.totalOre);
  });

  it("avbryter kunden, stenges betalingssiden og varene legges tilbake", async () => {
    await connect();
    const o = await order();
    await start(o);
    const sessionId = sessionOf((await orderRow(o.id)).paymentRef);
    await handleCustomerCancel(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect(world.sessions.get(sessionId)!.status).toBe("expired");
    expect((await orderRow(o.id)).status).toBe("cancelled");
  });

  it("bakgrunnsjobben finner kunder som betalte og aldri kom tilbake, og rydder utløpte betalinger", async () => {
    await connect();
    const betalt = await order();
    await start(betalt);
    world.pay(sessionOf((await orderRow(betalt.id)).paymentRef));
    const glemt = await order({ lines: [{ variantId: lueId, quantity: 1 }] });
    await start(glemt);
    const glemtSession = sessionOf((await orderRow(glemt.id)).paymentRef);

    // Innenfor fristen står den urørt.
    const first = await sweepPayments(db, { now: new Date(Date.now() + 5 * 60_000) });
    expect(first).toMatchObject({ paid: 1, waiting: 1, cancelled: 0 });
    expect(world.sessions.get(glemtSession)!.status).toBe("open");

    const second = await sweepPayments(db, { now: new Date(Date.now() + 61 * 60_000) });
    expect(second).toMatchObject({ cancelled: 1 });
    expect(world.sessions.get(glemtSession)!.status).toBe("expired");
    expect((await orderRow(glemt.id)).status).toBe("cancelled");
  });

  it("kansellerer ordren og sier fra når Stripe ikke svarer ved start", async () => {
    await connect();
    const o = await order();
    world.fetchMock.mockImplementationOnce(async () => json(500, { error: { message: "feil", code: "api_error" } }));
    await expect(start(o)).rejects.toThrow(/Ingenting er trukket/);
    expect((await orderRow(o.id)).status).toBe("cancelled");
  });

  it("en konto koblet til fra et annet miljø brukes ikke, og pengene kan ikke flyttes med feil konto", async () => {
    const o = await paidOrder();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_annen");
    expect(currentStripeConnect((await site()).shop)).toBeNull();
    // Testbetalinger kan fortsette uten kobling. Ingen kall går til Stripe med feil konto.
    const before = world.calls.length;
    await changeOrderStatus(db, siteId, o.id, "cancelled", userId);
    expect(world.calls.length).toBe(before);
  });

  it("frakobling tar kort ut av kassen", async () => {
    await connect();
    await disconnectStripe(db, siteId, userId);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).not.toContain("stripe");
  });
});
