import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, orders, organizations, productVariants, sites, users } from "@/db/schema";
import { GET as kustomPageGet } from "@/app/api/betaling/kustom/route";
import { POST as pushPost } from "@/app/api/betaling/kustom/push/route";
import { POST as validatePost } from "@/app/api/betaling/kustom/valider/route";
import { idempotencyUuid } from "@/lib/payments/common";
import { paymentSetupView, savePaymentKeys, testPaymentConnection } from "@/lib/payments/config";
import { kustomBaseUrl, kustomClient } from "@/lib/payments/kustom";
import { changeOrderStatus, handlePaymentReturn, returnUrl, startPayment, sweepPayments } from "@/lib/payments/service";
import { readStoredProvider } from "@/lib/payments/state";
import { createProduct } from "@/lib/shop/catalog";
import { saveDiscount } from "@/lib/shop/discounts";
import { createOrder, setTracking, type CheckoutInput } from "@/lib/shop/orders";
import { availablePaymentMethods, readShopSettings } from "@/lib/shop/settings";

// Ordrebekreftelsen sendes med after(), som bare finnes inne i en ekte forespørsel.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));

const KUSTOM = { username: "M123456-kustombruker", password: "kco_test_api_hemmelig-passord-abc" };
const SNIPPET = '<div id="kco-iframe"></div><script>window._klarnaCheckout = function () {};</script>';

type Recorded = { method: string; url: URL; headers: Record<string, string>; body: Record<string, unknown> | undefined };
type FakeOrder = {
  id: string;
  status: string;
  checkoutStatus: string;
  fraud: string;
  amount: number;
  currency: string;
  ref1: string;
  ref2: string;
  captured: number;
  refunded: number;
  acknowledged: number;
};

const json = (status: number, body?: unknown) =>
  body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Kustom slik testene ser den: et lite, tilstandsfullt etterlignet API bak fetch. */
function kustomWorld() {
  const calls: Recorded[] = [];
  const orders = new Map<string, FakeOrder>();
  let counter = 0;
  const auth = `Basic ${Buffer.from(`${KUSTOM.username}:${KUSTOM.password}`).toString("base64")}`;

  function route(method: string, path: string, headers: Record<string, string>, body: Record<string, unknown> | undefined): Response {
    if (headers.Authorization !== auth) return json(401, { error_code: "UNAUTHORIZED" });
    if (path === "/checkout/v3/orders" && method === "POST") {
      const id = `kco-${++counter}`;
      orders.set(id, {
        id,
        status: "AUTHORIZED",
        checkoutStatus: "checkout_incomplete",
        fraud: "ACCEPTED",
        amount: Number(body?.order_amount),
        currency: String(body?.purchase_currency),
        ref1: String(body?.merchant_reference1),
        ref2: String(body?.merchant_reference2),
        captured: 0,
        refunded: 0,
        acknowledged: 0,
      });
      return json(201, { order_id: id, status: "checkout_incomplete", html_snippet: SNIPPET });
    }
    const checkout = /^\/checkout\/v3\/orders\/([^/]+)$/.exec(path);
    if (checkout) {
      const o = orders.get(decodeURIComponent(checkout[1]));
      return o ? json(200, { order_id: o.id, status: o.checkoutStatus, html_snippet: SNIPPET }) : json(404);
    }
    const om = /^\/ordermanagement\/v1\/orders\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
    const o = om ? orders.get(decodeURIComponent(om[1])) : undefined;
    // Order Management kjenner bare ordre der kunden har fullført kjøpet.
    if (!om || !o || o.checkoutStatus === "checkout_incomplete") return json(404, { error_code: "NOT_FOUND" });
    switch (om[2]) {
      case undefined:
        return json(200, {
          order_id: o.id,
          status: o.status,
          fraud_status: o.fraud,
          order_amount: o.amount,
          original_order_amount: o.amount,
          captured_amount: o.captured,
          refunded_amount: o.refunded,
          remaining_authorized_amount: o.status === "CANCELLED" ? 0 : o.amount - o.captured,
          purchase_currency: o.currency.toLowerCase(),
          // Dokumentasjonens eksempel har tall her, så vi sender tall.
          merchant_reference1: Number(o.ref1),
          merchant_reference2: o.ref2,
        });
      case "acknowledge":
        o.acknowledged++;
        return json(204);
      case "captures":
        o.captured += Number(body?.captured_amount);
        o.status = o.captured === o.amount ? "CAPTURED" : "PART_CAPTURED";
        return json(201);
      case "refunds":
        o.refunded += Number(body?.refunded_amount);
        return json(201);
      case "cancel":
        if (o.captured > 0) return json(403, { error_code: "CANCEL_NOT_ALLOWED" });
        o.status = "CANCELLED";
        return json(204);
    }
    return json(404, {});
  }

  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = { ...((init.headers ?? {}) as Record<string, string>) };
    const body = typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const method = init.method ?? "GET";
    calls.push({ method, url, headers, body });
    if (url.hostname === "api.playground.kustom.co") return route(method, url.pathname, headers, body);
    return json(404, {});
  });

  return {
    calls,
    orders,
    fetchMock,
    complete(id: string) {
      orders.get(id)!.checkoutStatus = "checkout_complete";
    },
    find(method: string, pathPart: string) {
      return calls.filter((c) => c.method === method && c.url.pathname.includes(pathPart));
    },
  };
}

describe("betaling med Kustom", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let lueId: string;
  let kaffeId: string;
  let world: ReturnType<typeof kustomWorld>;
  let logged: string[];

  beforeEach(async () => {
    db = await createPgliteDb();
    setDbForTests(db);
    const [user] = await db.insert(users).values({ email: "eier@ullstua.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Ullstua AS" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Ullstua", slug: "ullstua", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme, info: { email: "post@ullstua.no" } })
      .returning();
    siteId = site.id;
    userId = user.id;
    const lue = await createProduct(db, siteId, { name: "Strikket lue", vatRate: 25, status: "active", variants: [{ optionValues: [], priceOre: 39900, stock: 5 }] }, userId);
    const kaffe = await createProduct(db, siteId, { name: "Kaffe", vatRate: 15, status: "active", variants: [{ optionValues: [], priceOre: 12900, stock: null }] }, userId);
    [lueId, kaffeId] = await Promise.all(
      [lue.id, kaffe.id].map(async (id) => (await db.select().from(productVariants).where(eq(productVariants.productId, id)))[0].id),
    );
    world = kustomWorld();
    vi.stubGlobal("fetch", world.fetchMock);
    logged = [];
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(async () => {
    // Nøklene skal aldri havne i loggen eller i revisjonsloggen.
    const audit = JSON.stringify(await db.select().from(auditLog));
    for (const secret of [KUSTOM.username, KUSTOM.password]) {
      expect(logged.join("\n")).not.toContain(secret);
      expect(audit).not.toContain(secret);
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function site() {
    const [row] = await db.select().from(sites).where(eq(sites.id, siteId));
    return row;
  }

  async function connect() {
    await savePaymentKeys(db, siteId, "kustom", { environment: "test", ...KUSTOM }, userId);
    return testPaymentConnection(db, siteId, "kustom", userId);
  }

  async function order(overrides: Partial<CheckoutInput> = {}) {
    const input: CheckoutInput = {
      lines: [{ variantId: lueId, quantity: 2 }],
      name: "Kari Nordmann",
      email: "kari@test.no",
      shippingCode: "post",
      address: { street: "Storgata 1", postalCode: "3340", city: "Åmot" },
      paymentMethod: "kustom",
      acceptedTerms: true,
      ...overrides,
    };
    return createOrder(db, siteId, readShopSettings((await site()).shop), input, { startsPayment: true });
  }

  async function start(o: Awaited<ReturnType<typeof order>>) {
    return startPayment(db, await site(), o, returnUrl("https://ullstua.no", o));
  }

  async function orderRow(id: string) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row;
  }

  const kustomIdOf = (paymentRef: string | null) => paymentRef!.split(":")[2];

  const push = (o: { id: string; accessToken: string }, kustomId: string) =>
    pushPost(new Request(`https://ullstua.no/api/betaling/kustom/push?ordre=${o.id}&t=${o.accessToken}&kustom=${kustomId}`, { method: "POST", body: "{}" }));

  it("lagrer nøklene kryptert, tester mot playground og vises i kassen først etter testen", async () => {
    await savePaymentKeys(db, siteId, "kustom", { environment: "test", ...KUSTOM }, userId);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).not.toContain("kustom");
    expect((await testPaymentConnection(db, siteId, "kustom", userId)).ok).toBe(true);

    const raw = JSON.stringify((await site()).shop);
    expect(raw).not.toContain(KUSTOM.password);
    expect(raw).not.toContain(KUSTOM.username);
    expect(readStoredProvider((await site()).shop, "kustom")?.secret).toMatch(/^v1:/);
    expect(paymentSetupView((await site()).shop).kustom).toMatchObject({ environment: "test", ready: true });
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toContain("kustom");

    const [test] = world.find("GET", "/checkout/v3/orders/");
    expect(test.url.origin).toBe("https://api.playground.kustom.co");
    expect(test.headers.Authorization).toBe(`Basic ${Buffer.from(`${KUSTOM.username}:${KUSTOM.password}`).toString("base64")}`);

    // Feil passord: Kustom svarer 401, og kassen viser ikke Kustom.
    await savePaymentKeys(db, siteId, "kustom", { environment: "test", ...KUSTOM, password: "kco_test_api_feil" }, userId);
    const failed = await testPaymentConnection(db, siteId, "kustom", userId);
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/Kustom godtok ikke/);
  });

  it("velger riktig miljø og stopper nøkler fra feil miljø", async () => {
    expect(kustomBaseUrl).toEqual({ test: "https://api.playground.kustom.co", production: "https://api.kustom.co" });
    world.fetchMock.mockImplementationOnce(async () => json(404));
    await kustomClient("production", KUSTOM).testConnection();
    expect(String(world.fetchMock.mock.calls.at(-1)![0])).toMatch(/^https:\/\/api\.kustom\.co\/checkout\/v3\/orders\//);
    await expect(savePaymentKeys(db, siteId, "kustom", { environment: "production", ...KUSTOM }, userId)).rejects.toThrow(/testpassord/);
    await expect(savePaymentKeys(db, siteId, "kustom", { environment: "test", ...KUSTOM, password: "kco_live_api_x" }, userId)).rejects.toThrow(/produksjonspassord/);
  });

  it("hele veien: kasse, validering, push, kvittering, trekk og refusjon", async () => {
    await connect();
    await saveDiscount(db, siteId, null, { code: "TIPROSENT", kind: "percent", value: 10 }, userId);
    const o = await order({
      lines: [
        { variantId: lueId, quantity: 1 },
        { variantId: kaffeId, quantity: 3 },
      ],
      discountCode: "TIPROSENT",
    });
    const redirect = await start(o);
    expect(redirect).toBe(`https://ullstua.no/api/betaling/kustom?ordre=${o.id}&t=${o.accessToken}`);

    // Ordrelinjene: summene stemmer, MVA per sats, frakt og rabatt.
    const [create] = world.find("POST", "/checkout/v3/orders");
    expect(create.headers["Kustom-Idempotency-Key"]).toBeUndefined();
    const body = create.body as {
      order_amount: number;
      order_tax_amount: number;
      order_lines: { type: string; quantity: number; unit_price: number; tax_rate: number; total_amount: number; total_discount_amount: number; total_tax_amount: number }[];
      merchant_urls: Record<string, string>;
      options: Record<string, unknown>;
    };
    expect(body).toMatchObject({ purchase_country: "NO", purchase_currency: "NOK", locale: "nb-NO", order_amount: o.totalOre, merchant_reference1: String(o.number), merchant_reference2: o.id });
    expect(body.order_lines.reduce((s, l) => s + l.total_amount, 0)).toBe(o.totalOre);
    expect(body.order_lines.reduce((s, l) => s + l.total_tax_amount, 0)).toBe(body.order_tax_amount);
    for (const l of body.order_lines) {
      expect(l.total_amount).toBe(l.quantity * l.unit_price - l.total_discount_amount);
      expect(Math.abs(l.total_tax_amount - (l.total_amount - (l.total_amount * 10000) / (10000 + l.tax_rate)))).toBeLessThanOrEqual(1);
    }
    expect(body.order_lines.filter((l) => l.type === "shipping_fee").map((l) => l.tax_rate)).toEqual([2500, 1500]);
    expect(body.order_lines.filter((l) => l.type === "physical").reduce((s, l) => s + l.total_discount_amount, 0)).toBe(o.discountOre);
    const q = `ordre=${o.id}&t=${o.accessToken}`;
    expect(body.merchant_urls).toEqual({
      terms: "https://ullstua.no/kjopsvilkar",
      checkout: `https://ullstua.no/api/betaling/kustom?${q}`,
      confirmation: `https://ullstua.no/api/betaling/retur?${q}`,
      push: `https://ullstua.no/api/betaling/kustom/push?${q}&kustom={checkout.order.id}`,
      validation: `https://ullstua.no/api/betaling/kustom/valider?${q}`,
    });
    expect(body.options).toEqual({ require_validate_callback_success: true });
    const kustomId = kustomIdOf((await orderRow(o.id)).paymentRef);
    expect((await orderRow(o.id)).paymentRef).toBe(`kustom:test:${kustomId}`);

    // Kassesiden viser snutten fra Kustom.
    const page = await kustomPageGet(new Request(`https://ullstua.no/api/betaling/kustom?${q}`, { headers: { host: "ullstua.no" } }));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(SNIPPET);
    expect(html).toContain('<html lang="nb">');

    // Validering: godtas når alt stemmer.
    const valid = { order_id: kustomId, order_amount: o.totalOre, purchase_currency: "nok", merchant_reference1: String(o.number), merchant_reference2: o.id };
    const ok = await validatePost(new Request(`https://ullstua.no/api/betaling/kustom/valider?${q}`, { method: "POST", headers: { host: "ullstua.no" }, body: JSON.stringify(valid) }));
    expect(ok.status).toBe(200);
    const wrong = await validatePost(
      new Request(`https://ullstua.no/api/betaling/kustom/valider?${q}`, { method: "POST", headers: { host: "ullstua.no" }, body: JSON.stringify({ ...valid, order_amount: 100 }) }),
    );
    expect(wrong.status).toBe(303);

    // Push før kjøpet er fullført: ingenting skjer.
    expect((await push(o, kustomId)).status).toBe(200);
    expect((await orderRow(o.id)).status).toBe("pending_payment");

    // Push med feil Kustom-ID blir avvist.
    expect((await push(o, "kco-999")).status).toBe(404);

    world.complete(kustomId);
    expect((await push(o, kustomId)).status).toBe(200);
    expect((await orderRow(o.id)).status).toBe("paid");
    const [ack] = world.find("POST", "/acknowledge");
    expect(ack.headers["Kustom-Idempotency-Key"]).toBe(await idempotencyUuid(`kustom-ack:${o.id}`));
    expect((await db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, "payment.paid"))))[0].detail).toMatchObject({
      provider: "kustom",
      reference: kustomId,
      amountOre: o.totalOre,
    });

    // Gjentatt push og retur: fortsatt bare én betaling. Kvitteringen sendes på nytt med samme nøkkel.
    expect((await push(o, kustomId)).status).toBe(200);
    expect((await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" }))?.paidOrderId).toBeNull();
    expect(world.find("POST", "/acknowledge").map((c) => c.headers["Kustom-Idempotency-Key"])).toEqual([ack.headers["Kustom-Idempotency-Key"], ack.headers["Kustom-Idempotency-Key"]]);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, "payment.paid")))).toHaveLength(1);

    // Kassesiden sender kunden til kvitteringen når kjøpet er fullført.
    const after = await kustomPageGet(new Request(`https://ullstua.no/api/betaling/kustom?${q}`, { headers: { host: "ullstua.no" } }));
    expect(after.status).toBe(303);
    expect(after.headers.get("location")).toBe(`/ordre/${o.id}?t=${o.accessToken}`);

    await setTracking(db, siteId, o.id, { carrier: "posten", number: "RR123456785NO" }, userId);
    await changeOrderStatus(db, siteId, o.id, "fulfilled", userId);
    const [capture] = world.find("POST", "/captures");
    expect(capture.body).toMatchObject({ captured_amount: o.totalOre, shipping_info: [{ tracking_number: "RR123456785NO" }] });
    expect(capture.headers["Kustom-Idempotency-Key"]).toBe(await idempotencyUuid(`kustom-capture:${o.id}`));

    await changeOrderStatus(db, siteId, o.id, "refunded", userId);
    const [refund] = world.find("POST", "/refunds");
    expect(refund.body).toEqual({ refunded_amount: o.totalOre });
    expect(refund.headers["Kustom-Idempotency-Key"]).toBe(await idempotencyUuid(`kustom-refund:${o.id}`));
    expect((await orderRow(o.id)).status).toBe("refunded");
  });

  it("feil beløp hos Kustom gjør aldri ordren betalt, og ordren kanselleres hos Kustom", async () => {
    await connect();
    const o = await order();
    await start(o);
    const kustomId = kustomIdOf((await orderRow(o.id)).paymentRef);
    world.complete(kustomId);
    world.orders.get(kustomId)!.amount = 100;
    await push(o, kustomId);
    expect((await orderRow(o.id)).status).toBe("cancelled");
    expect(world.find("POST", "/acknowledge")).toHaveLength(0);
    const [cancel] = world.find("POST", "/cancel");
    expect(cancel.headers["Kustom-Idempotency-Key"]).toBe(await idempotencyUuid(`kustom-cancel:${o.id}`));
    expect(world.orders.get(kustomId)!.status).toBe("CANCELLED");
  });

  it("feil ordrereferanse hos Kustom gjør aldri ordren betalt", async () => {
    await connect();
    const o = await order();
    await start(o);
    const kustomId = kustomIdOf((await orderRow(o.id)).paymentRef);
    world.complete(kustomId);
    world.orders.get(kustomId)!.ref2 = "en-annen-ordre";
    await push(o, kustomId);
    expect((await orderRow(o.id)).status).toBe("cancelled");
  });

  it("kansellering før sending kansellerer hos Kustom, og validering avviser en kansellert ordre", async () => {
    await connect();
    const o = await order();
    await start(o);
    const kustomId = kustomIdOf((await orderRow(o.id)).paymentRef);
    world.complete(kustomId);
    await push(o, kustomId);
    expect((await orderRow(o.id)).status).toBe("paid");
    await changeOrderStatus(db, siteId, o.id, "cancelled", userId);
    expect(world.orders.get(kustomId)!.status).toBe("CANCELLED");
    expect(world.find("POST", "/cancel")[0].headers["Kustom-Idempotency-Key"]).toBe(await idempotencyUuid(`kustom-cancel:${o.id}`));

    const res = await validatePost(
      new Request(`https://ullstua.no/api/betaling/kustom/valider?ordre=${o.id}&t=${o.accessToken}`, {
        method: "POST",
        headers: { host: "ullstua.no" },
        body: JSON.stringify({ order_id: kustomId, order_amount: o.totalOre, purchase_currency: "NOK", merchant_reference1: String(o.number), merchant_reference2: o.id }),
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://ullstua.no/ordre/${o.id}?t=${o.accessToken}`);
  });

  it("bakgrunnsjobben fanger opp betalt ordre og rydder bort kasser som aldri ble fullført", async () => {
    await connect();
    const paid = await order();
    await start(paid);
    world.complete(kustomIdOf((await orderRow(paid.id)).paymentRef));
    const abandoned = await order();
    await start(abandoned);

    await sweepPayments(db);
    expect((await orderRow(paid.id)).status).toBe("paid");
    expect((await orderRow(abandoned.id)).status).toBe("pending_payment");

    await sweepPayments(db, { now: new Date(Date.now() + 2 * 60 * 60_000) });
    expect((await orderRow(abandoned.id)).status).toBe("cancelled");
  });
});
