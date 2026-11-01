import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, discountCodes, orders, organizations, productVariants, sites, users } from "@/db/schema";
import { getCheckoutData } from "@/app/actions/shop";
import { POST as cronPost } from "@/app/api/cron/betaling/route";
import { GET as returnGet } from "@/app/api/betaling/retur/route";
import { cronKey } from "@/lib/cron";
import { onlinePaymentInfo } from "@/lib/payments/checkout-action";
import { idempotencyUuid } from "@/lib/payments/common";
import { paymentSetupView, removePaymentKeys, savePaymentKeys, testPaymentConnection, updateShopSettings } from "@/lib/payments/config";
import { klarnaOrderBody } from "@/lib/payments/klarna";
import { changeOrderStatus, handleCustomerCancel, handlePaymentReturn, returnUrl, startPayment, sweepPayments, syncOrderPayment } from "@/lib/payments/service";
import { readStoredProvider } from "@/lib/payments/state";
import { createProduct } from "@/lib/shop/catalog";
import { saveDiscount } from "@/lib/shop/discounts";
import { createOrder, setTracking, type CheckoutInput } from "@/lib/shop/orders";
import { availablePaymentMethods, readShopSettings, type PaymentMethod } from "@/lib/shop/settings";

// Nøkler som aldri skal vises for nettleseren, havne i loggen eller i revisjonsloggen.
const VIPPS = { clientId: "vipps-klient-a1b2c3-1234", clientSecret: "vipps-hemmelig-secret-9f8e7d", subscriptionKey: "vipps-abonnement-0f9e8d7c6b", msn: "123456" };
const KLARNA = { username: "klarna-bruker-uid-5678", password: "klarna-passord-hemmelig-xyz" };
const SECRETS = [VIPPS.clientId, VIPPS.clientSecret, VIPPS.subscriptionKey, KLARNA.username, KLARNA.password];

type Recorded = { method: string; url: URL; headers: Record<string, string>; body: Record<string, unknown> | undefined };
type FakeVippsPayment = { reference: string; state: string; currency: string; amount: number; authorized: number; captured: number; refunded: number; cancelled: number };
type FakeKlarnaOrder = { id: string; amount: number; currency: string; captured: number; refunded: number; released: number; status: string; fraud: string };

const json = (status: number, body?: unknown) =>
  status === 204 || body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Vipps og Klarna slik testene ser dem: et lite, tilstandsfullt etterlignet API bak fetch. */
function paymentWorld() {
  const calls: Recorded[] = [];
  const vipps = { payments: new Map<string, FakeVippsPayment>() };
  const klarna = {
    fraud: "ACCEPTED",
    sessions: new Map<string, Record<string, unknown>>(),
    hpp: new Map<string, { status: string; token?: string; paymentSessionUrl: string; merchantUrls: Record<string, string> }>(),
    orders: new Map<string, FakeKlarnaOrder>(),
    usedTokens: new Set<string>(),
    idempotent: new Map<string, string>(),
  };
  let counter = 0;

  function vippsRoute(method: string, path: string, headers: Record<string, string>, body: Record<string, unknown> | undefined): Response {
    if (path === "/accesstoken/get" && method === "POST") {
      const ok = headers.client_id === VIPPS.clientId && headers.client_secret === VIPPS.clientSecret && headers["Ocp-Apim-Subscription-Key"] === VIPPS.subscriptionKey;
      return ok ? json(200, { token_type: "Bearer", expires_in: "3599", access_token: "vipps-tilgang" }) : json(401, { error: "invalid_client" });
    }
    if (headers.Authorization !== "Bearer vipps-tilgang" || headers["Ocp-Apim-Subscription-Key"] !== VIPPS.subscriptionKey) return json(401, { title: "Unauthorized" });
    if (headers["Merchant-Serial-Number"] !== VIPPS.msn) return json(403, { title: "Forbidden" });

    if (path === "/epayment/v1/payments" && method === "POST") {
      const reference = String(body?.reference);
      const amount = body?.amount as { currency: string; value: number };
      if (vipps.payments.has(reference)) return json(409, { title: "Conflict" });
      vipps.payments.set(reference, { reference, state: "CREATED", currency: amount.currency, amount: amount.value, authorized: 0, captured: 0, refunded: 0, cancelled: 0 });
      return json(201, { redirectUrl: `https://landing.vipps.no/?token=${reference}`, reference });
    }
    const m = /^\/epayment\/v1\/payments\/([^/]+)(?:\/(capture|refund|cancel))?$/.exec(path);
    const p = m ? vipps.payments.get(decodeURIComponent(m[1])) : undefined;
    if (!m || !p) return json(404, { title: "Not Found", detail: "Payment not found" });
    const money = (value: number) => ({ currency: p.currency, value });
    const view = () => ({
      reference: p.reference,
      state: p.state,
      amount: money(p.amount),
      aggregate: { authorizedAmount: money(p.authorized), cancelledAmount: money(p.cancelled), capturedAmount: money(p.captured), refundedAmount: money(p.refunded) },
      pspReference: "psp-1",
    });
    const value = Number((body?.modificationAmount as { value?: number } | undefined)?.value);
    switch (m[2]) {
      case undefined:
        return json(200, view());
      case "capture":
        if (p.state !== "AUTHORIZED" || value > p.authorized - p.captured - p.cancelled) return json(400, { title: "Capture not allowed" });
        p.captured += value;
        return json(200, view());
      case "refund":
        if (value > p.captured - p.refunded) return json(400, { title: "Refund not allowed" });
        p.refunded += value;
        return json(200, view());
      case "cancel":
        if (p.state === "CREATED") p.state = "TERMINATED";
        else if (p.state === "AUTHORIZED" && !body?.cancelTransactionOnly) p.cancelled = p.authorized - p.captured;
        return json(200, view());
    }
    return json(404, {});
  }

  const klarnaAuth = `Basic ${Buffer.from(`${KLARNA.username}:${KLARNA.password}`).toString("base64")}`;

  function klarnaRoute(method: string, path: string, headers: Record<string, string>, body: Record<string, unknown> | undefined): Response {
    if (headers.Authorization !== klarnaAuth) return json(401, { error_code: "UNAUTHORIZED", error_messages: ["Bad credentials"], correlation_id: "k1" });
    let m: RegExpExecArray | null;
    if (path === "/payments/v1/sessions" && method === "POST") {
      const id = `kp-${++counter}`;
      klarna.sessions.set(id, body!);
      return json(200, { session_id: id, client_token: "klient", payment_method_categories: [] });
    }
    if ((m = /^\/payments\/v1\/sessions\/([^/]+)$/.exec(path))) {
      return klarna.sessions.has(m[1]) ? json(200, klarna.sessions.get(m[1])) : json(404, { error_code: "NOT_FOUND", error_messages: ["Session not found"] });
    }
    if (path === "/hpp/v1/sessions" && method === "POST") {
      const id = `hpp-${++counter}`;
      klarna.hpp.set(id, { status: "WAITING", paymentSessionUrl: String(body?.payment_session_url), merchantUrls: body?.merchant_urls as Record<string, string> });
      return json(201, { session_id: id, redirect_url: `https://pay.playground.klarna.com/eu/hpp/payments/${id}`, session_url: `https://api.playground.klarna.com/hpp/v1/sessions/${id}` });
    }
    if ((m = /^\/hpp\/v1\/sessions\/([^/]+)$/.exec(path))) {
      const s = klarna.hpp.get(m[1]);
      if (!s) return json(404, { error_code: "NOT_FOUND" });
      if (method === "DELETE") {
        if (s.status !== "COMPLETED") s.status = "DISABLED";
        return json(204);
      }
      return json(200, { session_id: m[1], status: s.status, ...(s.token && { authorization_token: s.token }) });
    }
    if ((m = /^\/payments\/v1\/authorizations\/([^/]+)(\/order)?$/.exec(path))) {
      const token = m[1];
      if (method === "DELETE") return json(204);
      const key = headers["Klarna-Idempotency-Key"];
      if (key && klarna.idempotent.has(key)) {
        const existing = klarna.orders.get(klarna.idempotent.get(key)!)!;
        return json(200, { order_id: existing.id, fraud_status: existing.fraud, redirect_url: "https://pay.playground.klarna.com/done" });
      }
      const session = [...klarna.hpp.values()].find((s) => s.token === token && s.status === "COMPLETED");
      if (!session || klarna.usedTokens.has(token)) return json(404, { error_code: "NOT_FOUND", error_messages: ["Invalid authorization token"] });
      const kp = klarna.sessions.get(session.paymentSessionUrl.split("/").pop()!)!;
      if (JSON.stringify(kp.order_lines) !== JSON.stringify(body?.order_lines) || kp.order_amount !== body?.order_amount) {
        return json(400, { error_code: "BAD_VALUE", error_messages: ["Not matching fields"] });
      }
      klarna.usedTokens.add(token);
      const id = `ko-${++counter}`;
      klarna.orders.set(id, { id, amount: Number(body?.order_amount), currency: String(body?.purchase_currency), captured: 0, refunded: 0, released: 0, status: "AUTHORIZED", fraud: klarna.fraud });
      if (key) klarna.idempotent.set(key, id);
      return json(200, { order_id: id, fraud_status: klarna.fraud, redirect_url: "https://pay.playground.klarna.com/done", authorized_payment_method: "invoice" });
    }
    if ((m = /^\/ordermanagement\/v1\/orders\/([^/]+)(?:\/(captures|refunds|cancel|release-remaining-authorization))?$/.exec(path))) {
      const o = klarna.orders.get(m[1]);
      if (!o) return json(404, { error_code: "NO_SUCH_ORDER" });
      const remaining = o.status === "CANCELLED" ? 0 : o.amount - o.captured - o.released;
      switch (m[2]) {
        case undefined:
          return json(200, {
            order_id: o.id,
            status: o.status,
            fraud_status: o.fraud,
            order_amount: o.amount,
            original_order_amount: o.amount,
            captured_amount: o.captured,
            refunded_amount: o.refunded,
            remaining_authorized_amount: remaining,
            purchase_currency: o.currency,
          });
        case "captures": {
          const amount = Number(body?.captured_amount);
          if (amount > remaining) return json(403, { error_code: "CAPTURE_NOT_ALLOWED" });
          o.captured += amount;
          o.status = o.captured === o.amount ? "CAPTURED" : "PART_CAPTURED";
          return json(201);
        }
        case "refunds":
          o.refunded += Number(body?.refunded_amount);
          return json(201);
        case "cancel":
          if (o.captured > 0) return json(403, { error_code: "CANCEL_NOT_ALLOWED" });
          o.status = "CANCELLED";
          return json(204);
        case "release-remaining-authorization":
          o.released = o.amount - o.captured;
          return json(204);
      }
    }
    return json(404, { error_code: "NOT_FOUND" });
  }

  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = { ...((init.headers ?? {}) as Record<string, string>) };
    const body = typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const method = init.method ?? "GET";
    calls.push({ method, url, headers, body });
    if (url.hostname === "apitest.vipps.no") return vippsRoute(method, url.pathname, headers, body);
    if (url.hostname === "api.playground.klarna.com") return klarnaRoute(method, url.pathname, headers, body);
    return json(404, {});
  });

  return {
    calls,
    fetchMock,
    vipps,
    klarna,
    /** Kunden godkjenner i Vipps-appen. Med et annet beløp etterlignes en betaling som ikke stemmer med ordren. */
    approveVipps(reference: string, amount?: number) {
      const p = vipps.payments.get(reference)!;
      if (amount !== undefined) p.amount = amount;
      p.state = "AUTHORIZED";
      p.authorized = p.amount;
    },
    setVippsState(reference: string, state: string) {
      vipps.payments.get(reference)!.state = state;
    },
    /** Kunden fullfører på Klarnas betalingsside. */
    completeKlarna(sessionId: string) {
      const s = klarna.hpp.get(sessionId)!;
      s.status = "COMPLETED";
      s.token = `auth-${sessionId}`;
    },
    find(method: string, pathPart: string) {
      return calls.filter((c) => c.method === method && c.url.pathname.includes(pathPart));
    },
  };
}

describe("betaling med Vipps og Klarna", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let lueId: string;
  let kaffeId: string;
  let world: ReturnType<typeof paymentWorld>;
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

    world = paymentWorld();
    vi.stubGlobal("fetch", world.fetchMock);
    logged = [];
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(async () => {
    // Nøklene skal aldri havne i loggen eller i revisjonsloggen, uansett hva testen gjorde.
    const audit = JSON.stringify(await db.select().from(auditLog));
    for (const secret of SECRETS) {
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

  async function connectVipps(overrides: Partial<typeof VIPPS> = {}) {
    await savePaymentKeys(db, siteId, "vipps", { environment: "test", ...VIPPS, ...overrides }, userId);
    return testPaymentConnection(db, siteId, "vipps", userId);
  }

  async function connectKlarna(overrides: Partial<typeof KLARNA> = {}) {
    await savePaymentKeys(db, siteId, "klarna", { environment: "test", ...KLARNA, ...overrides }, userId);
    return testPaymentConnection(db, siteId, "klarna", userId);
  }

  function checkoutInput(paymentMethod: PaymentMethod, overrides: Partial<CheckoutInput> = {}): CheckoutInput {
    return {
      lines: [{ variantId: lueId, quantity: 2 }],
      name: "Kari Nordmann",
      email: "kari@test.no",
      shippingCode: "post",
      address: { street: "Storgata 1", postalCode: "3340", city: "Åmot" },
      paymentMethod,
      acceptedTerms: true,
      ...overrides,
    };
  }

  /** Slik kassen lager ordren når kunden velger Vipps eller Klarna (lib/payments/checkout-action.ts). */
  async function order(paymentMethod: PaymentMethod, overrides: Partial<CheckoutInput> = {}) {
    return createOrder(db, siteId, readShopSettings((await site()).shop), checkoutInput(paymentMethod, overrides), { startsPayment: true });
  }

  async function start(o: Awaited<ReturnType<typeof order>>) {
    return startPayment(db, await site(), o, returnUrl("https://ullstua.no", o));
  }

  async function orderRow(id: string) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row;
  }

  async function audits(action: string) {
    return db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, action)));
  }

  async function stockOf(variantId: string) {
    const [row] = await db.select({ stock: productVariants.stock }).from(productVariants).where(eq(productVariants.id, variantId));
    return row.stock;
  }

  const vippsRefOf = (paymentRef: string | null) => paymentRef!.split(":")[2];

  it("lagrer nøklene kryptert og sender dem aldri til nettleseren", async () => {
    expect((await connectVipps()).ok).toBe(true);
    const shop = (await site()).shop;
    const raw = JSON.stringify(shop);
    for (const secret of SECRETS) expect(raw).not.toContain(secret);
    expect(readStoredProvider(shop, "vipps")).toMatchObject({ environment: "test", hint: "1234" });
    expect(readStoredProvider(shop, "vipps")?.secret).toMatch(/^v1:/);

    // Det kassen og studioet får, har ingen nøkler, verken i klartekst eller kryptert.
    const settings = readShopSettings(shop);
    const view = paymentSetupView(shop);
    const checkout = await getCheckoutData(siteId, [{ variantId: lueId, quantity: 1 }]);
    const info = await onlinePaymentInfo(siteId);
    for (const visible of [settings, view, checkout, info]) {
      const text = JSON.stringify(visible);
      for (const secret of SECRETS) expect(text).not.toContain(secret);
      expect(text).not.toContain("v1:");
    }
    expect(settings.online).toEqual({ vipps: { environment: "test" } });
    expect(view.vipps).toMatchObject({ ready: true, environment: "test", hint: "1234" });
    expect(checkout?.paymentMethods.map((m) => m.code)).toEqual(["vipps", "ved-henting"]);
    expect(info).toEqual({ vipps: { environment: "test" } });
  });

  it("viser Vipps og Klarna i kassen bare når nøklene er lagt inn og testen har lyktes", async () => {
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toEqual(["ved-henting"]);

    // Feil passord: lagret, men ikke i kassen. Meldingen sier hva som er galt, uten å vise nøkkelen.
    const wrong = await connectKlarna({ password: "feil-passord" });
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/godtok ikke brukernavnet og passordet/);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toEqual(["ved-henting"]);
    await expect(order("klarna")).rejects.toThrow(/Betalingsmåten/);
    expect(paymentSetupView((await site()).shop).klarna).toMatchObject({ ready: false, lastError: expect.stringMatching(/godtok ikke/) });

    // Feil salgssted hos Vipps: tilgangsnøkkelen virker, men oppslaget avvises.
    const wrongMsn = await connectVipps({ msn: "999999" });
    expect(wrongMsn.ok).toBe(false);
    expect(wrongMsn.message).toMatch(/salgsstednummeret/);

    expect((await connectKlarna()).ok).toBe(true);
    expect((await connectVipps()).ok).toBe(true);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toEqual(["vipps", "klarna", "ved-henting"]);
    // Vipps-ordre lages bare av kassen som også starter betalingen, ikke av den vanlige bestillingen.
    await expect(createOrder(db, siteId, readShopSettings((await site()).shop), checkoutInput("vipps"))).rejects.toThrow(/Last siden på nytt/);

    // Nye nøkler må testes på nytt før de brukes.
    await savePaymentKeys(db, siteId, "vipps", { environment: "test", ...VIPPS }, userId);
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toEqual(["klarna", "ved-henting"]);

    await removePaymentKeys(db, siteId, "klarna", userId);
    expect(readStoredProvider((await site()).shop, "klarna")).toBeNull();
    expect(availablePaymentMethods(readShopSettings((await site()).shop))).toEqual(["ved-henting"]);

    // Klarna-nøkler som sier at de hører til et annet miljø, stoppes før testen.
    await expect(savePaymentKeys(db, siteId, "klarna", { environment: "production", username: "uid", password: "klarna_test_api_abc" }, userId)).rejects.toThrow(
      /testnøkkel/,
    );
  });

  it("lagring av butikkinnstillinger mister ikke nøklene, og nøklene mister ikke innstillingene", async () => {
    await connectVipps();
    const before = readShopSettings((await site()).shop);
    await updateShopSettings(db, siteId, { ...before, freeShippingOverOre: 50000, paymentMethods: [] });
    const after = await site();
    expect(readShopSettings(after.shop)).toMatchObject({ freeShippingOverOre: 50000, paymentMethods: [], online: { vipps: { environment: "test" } } });
    expect(readStoredProvider(after.shop, "vipps")?.testedAt).not.toBeNull();
    // Det avledede feltet lagres aldri.
    expect(after.shop).not.toHaveProperty("online");
    // Butikken kan ta betalt bare med Vipps.
    expect(availablePaymentMethods(readShopSettings(after.shop))).toEqual(["vipps"]);

    await connectKlarna();
    expect(readShopSettings((await site()).shop).freeShippingOverOre).toBe(50000);
  });

  it("Vipps hele veien: opprett, retur, betalt, trekk ved sending og refusjon", async () => {
    await connectVipps();
    const token = world.find("POST", "/accesstoken/get")[0];
    expect(token.headers).toMatchObject({
      client_id: VIPPS.clientId,
      client_secret: VIPPS.clientSecret,
      "Ocp-Apim-Subscription-Key": VIPPS.subscriptionKey,
      "Merchant-Serial-Number": "123456",
      "Vipps-System-Name": "Nettgata",
    });
    expect(token.url.origin).toBe("https://apitest.vipps.no");

    const o = await order("vipps");
    expect(o.status).toBe("pending_payment");
    expect(await stockOf(lueId)).toBe(3);
    const redirect = await start(o);
    const [create] = world.find("POST", "/epayment/v1/payments");
    const reference = String(create.body?.reference);
    expect(redirect).toBe(`https://landing.vipps.no/?token=${reference}`);
    expect(reference).toMatch(/^[a-zA-Z0-9-]{8,64}$/);
    expect(create.headers).toMatchObject({
      Authorization: "Bearer vipps-tilgang",
      "Merchant-Serial-Number": "123456",
      "Idempotency-Key": `create-${o.id}`,
      "Vipps-System-Plugin-Name": "nettgata-nettbutikk",
    });
    expect(create.headers["Idempotency-Key"].length).toBeLessThanOrEqual(50);
    expect(create.body).toMatchObject({
      amount: { currency: "NOK", value: o.totalOre },
      paymentMethod: { type: "WALLET" },
      userFlow: "WEB_REDIRECT",
      returnUrl: `https://ullstua.no/api/betaling/retur?ordre=${o.id}&t=${o.accessToken}`,
    });
    expect((await orderRow(o.id)).paymentRef).toBe(`vipps:test:${reference}`);

    // Kunden kommer tilbake før betalingen er godkjent: ordren venter fortsatt.
    const early = await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect(early).toEqual({ location: `/ordre/${o.id}?t=${o.accessToken}`, paidOrderId: null });
    expect((await orderRow(o.id)).status).toBe("pending_payment");

    // Lenken alene gjør ingenting: feil nøkkel gir ingen ordre.
    expect(await handlePaymentReturn(db, { orderId: o.id, token: "0".repeat(48), host: "ullstua.no" })).toBeNull();

    world.approveVipps(reference);
    const back = await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect(back?.paidOrderId).toBe(o.id);
    const paid = await orderRow(o.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
    expect((await audits("payment.paid"))[0].detail).toMatchObject({ orderId: o.id, provider: "vipps", amountOre: o.totalOre, environment: "test" });

    // Retur på nytt og bakgrunnsjobben: ingen dobbel «betalt».
    expect((await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" }))?.paidOrderId).toBeNull();
    expect((await sweepPayments(db)).checked).toBe(0);
    expect(await audits("payment.paid")).toHaveLength(1);

    // Beløpet trekkes først når ordren sendes.
    expect(world.find("POST", "/capture")).toHaveLength(0);
    const sent = await changeOrderStatus(db, siteId, o.id, "fulfilled", userId);
    expect(sent.message).toMatch(/trukket med Vipps/);
    const [capture] = world.find("POST", "/capture");
    expect(capture.headers["Idempotency-Key"]).toBe(`capture-${o.id}`);
    expect(capture.body).toEqual({ modificationAmount: { currency: "NOK", value: o.totalOre } });
    expect((await orderRow(o.id)).status).toBe("fulfilled");
    expect((await audits("payment.captured"))[0].detail).toMatchObject({ amountOre: o.totalOre, provider: "vipps" });

    const refunded = await changeOrderStatus(db, siteId, o.id, "refunded", userId);
    expect(refunded.message).toMatch(/refundert/);
    const [refund] = world.find("POST", "/refund");
    expect(refund.body).toEqual({ modificationAmount: { currency: "NOK", value: o.totalOre } });
    expect(world.vipps.payments.get(reference)).toMatchObject({ captured: o.totalOre, refunded: o.totalOre });
    expect((await orderRow(o.id)).status).toBe("refunded");
    expect((await audits("payment.refunded"))[0].detail).toMatchObject({ amountOre: o.totalOre });
  });

  it("feil beløp hos Vipps gjør aldri ordren betalt, og reservasjonen frigjøres", async () => {
    await connectVipps();
    const o = await order("vipps");
    await start(o);
    const reference = vippsRefOf((await orderRow(o.id)).paymentRef);
    world.approveVipps(reference, o.totalOre - 100);

    const result = await syncOrderPayment(db, o.id);
    expect(result.paid).toBe(false);
    const row = await orderRow(o.id);
    expect(row.status).toBe("cancelled");
    expect(row.paidAt).toBeNull();
    expect(await audits("payment.paid")).toHaveLength(0);
    expect((await audits("payment.amount_mismatch"))[0].detail).toMatchObject({ expectedOre: o.totalOre, authorizedOre: o.totalOre - 100 });
    expect(world.vipps.payments.get(reference)?.cancelled).toBe(o.totalOre - 100);
    expect(await stockOf(lueId)).toBe(5);
  });

  it("avbrutt i Vipps: ordren kanselleres, varene og rabattkoden frigjøres", async () => {
    await connectVipps();
    await saveDiscount(db, siteId, null, { code: "EN-GANG", kind: "percent", value: 10, usageLimit: 1 }, userId);
    const o = await order("vipps", { discountCode: "EN-GANG" });
    expect((await db.select().from(discountCodes))[0].usedCount).toBe(1);
    await start(o);
    world.setVippsState(vippsRefOf((await orderRow(o.id)).paymentRef), "ABORTED");

    await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect((await orderRow(o.id)).status).toBe("cancelled");
    expect(await stockOf(lueId)).toBe(5);
    expect((await db.select().from(discountCodes))[0].usedCount).toBe(0);
    expect((await audits("payment.cancelled"))[0].detail).toMatchObject({ reason: "aborted", provider: "vipps" });
  });

  it("kunden kan avbryte og velge en annen betalingsmåte", async () => {
    await connectVipps();
    const o = await order("vipps");
    await start(o);
    const reference = vippsRefOf((await orderRow(o.id)).paymentRef);

    const result = await handleCustomerCancel(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect(result).toEqual({ location: "/handlekurv", paidOrderId: null });
    const [cancel] = world.find("POST", "/cancel");
    expect(cancel.body).toEqual({ cancelTransactionOnly: true });
    expect(world.vipps.payments.get(reference)?.state).toBe("TERMINATED");
    expect((await orderRow(o.id)).status).toBe("cancelled");
    expect(await stockOf(lueId)).toBe(5);
  });

  it("«Marker som betalt» spør Vipps i stedet for å stole på butikken", async () => {
    await connectVipps();
    const o = await order("vipps");
    await start(o);
    await expect(changeOrderStatus(db, siteId, o.id, "paid", userId)).rejects.toThrow(/ikke bekreftet betalingen/);
    expect((await orderRow(o.id)).status).toBe("pending_payment");

    world.approveVipps(vippsRefOf((await orderRow(o.id)).paymentRef));
    const change = await changeOrderStatus(db, siteId, o.id, "paid", userId);
    expect(change).toMatchObject({ paid: true, online: true });
    expect((await orderRow(o.id)).status).toBe("paid");
  });

  it("kansellering av betalt Vipps-ordre før sending frigjør reservasjonen", async () => {
    await connectVipps();
    const o = await order("vipps");
    await start(o);
    const reference = vippsRefOf((await orderRow(o.id)).paymentRef);
    world.approveVipps(reference);
    await syncOrderPayment(db, o.id);

    await changeOrderStatus(db, siteId, o.id, "cancelled", userId);
    expect(world.vipps.payments.get(reference)).toMatchObject({ cancelled: o.totalOre, captured: 0 });
    expect(world.find("POST", "/cancel")[0].body).toEqual({ cancelTransactionOnly: false });
    expect((await orderRow(o.id)).status).toBe("cancelled");
    expect((await audits("payment.released"))[0].detail).toMatchObject({ amountOre: o.totalOre });
    expect(await stockOf(lueId)).toBe(5);
  });

  it("retur og bakgrunnsjobb samtidig gir bare én «betalt»", async () => {
    await connectVipps();
    const o = await order("vipps");
    await start(o);
    world.approveVipps(vippsRefOf((await orderRow(o.id)).paymentRef));

    const notified: string[] = [];
    const [a, b, sweep] = await Promise.all([
      syncOrderPayment(db, o.id),
      handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" }),
      sweepPayments(db, { onPaid: async (id) => void notified.push(id) }),
    ]);
    const paidCount = [a.paid, b?.paidOrderId === o.id, sweep.paid === 1].filter(Boolean).length;
    expect(paidCount).toBe(1);
    expect(await audits("payment.paid")).toHaveLength(1);
    expect((await orderRow(o.id)).status).toBe("paid");
  });

  it("Klarna hele veien: økt, betalingsside, ordre fra authorization_token, trekk og refusjon", async () => {
    expect((await connectKlarna()).ok).toBe(true);
    const test = world.find("GET", "/payments/v1/sessions/")[0];
    expect(test.headers.Authorization).toBe(`Basic ${Buffer.from(`${KLARNA.username}:${KLARNA.password}`).toString("base64")}`);
    expect(test.url.origin).toBe("https://api.playground.klarna.com");

    // To MVA-satser, rabatt og frakt, så linjene må fordeles riktig.
    await saveDiscount(db, siteId, null, { code: "TIPROSENT", kind: "percent", value: 10 }, userId);
    const o = await order("klarna", {
      lines: [
        { variantId: lueId, quantity: 1 },
        { variantId: kaffeId, quantity: 3 },
      ],
      discountCode: "TIPROSENT",
    });
    const redirect = await start(o);
    expect(redirect).toMatch(/^https:\/\/pay\.playground\.klarna\.com\/eu\/hpp\/payments\/hpp-/);

    const [session] = world.find("POST", "/payments/v1/sessions");
    const body = session.body as unknown as ReturnType<typeof klarnaOrderBody> & { intent: string };
    expect(body).toMatchObject({ purchase_country: "NO", purchase_currency: "NOK", locale: "nb-NO", intent: "buy", order_amount: o.totalOre, merchant_reference1: String(o.number) });
    expect(body.order_lines.reduce((s, l) => s + l.total_amount, 0)).toBe(o.totalOre);
    expect(body.order_lines.reduce((s, l) => s + l.total_tax_amount, 0)).toBe(body.order_tax_amount);
    for (const l of body.order_lines) expect(l.total_amount).toBe(l.quantity * l.unit_price - l.total_discount_amount);
    expect(body.order_lines.filter((l) => l.type === "shipping_fee").map((l) => l.tax_rate)).toEqual([2500, 1500]);
    expect(body.order_lines.filter((l) => l.type === "physical").reduce((s, l) => s + l.total_discount_amount, 0)).toBe(o.discountOre);

    const [hpp] = world.find("POST", "/hpp/v1/sessions");
    const returnTo = `https://ullstua.no/api/betaling/retur?ordre=${o.id}&t=${o.accessToken}`;
    expect(hpp.body).toMatchObject({
      payment_session_url: expect.stringMatching(/^https:\/\/api\.playground\.klarna\.com\/payments\/v1\/sessions\/kp-/),
      merchant_urls: { success: returnTo, cancel: returnTo, back: returnTo, failure: returnTo, error: returnTo },
      options: { place_order_mode: "NONE" },
    });
    const hppId = (await orderRow(o.id)).paymentRef!.split(":")[3];
    expect((await orderRow(o.id)).paymentRef).toBe(`klarna:test:hpp:${hppId}`);

    // Kunden trykket tilbake: økten er åpen, ordren venter.
    world.klarna.hpp.get(hppId)!.status = "BACK";
    await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect((await orderRow(o.id)).status).toBe("pending_payment");

    world.completeKlarna(hppId);
    const back = await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect(back?.paidOrderId).toBe(o.id);
    const [placed] = world.find("POST", "/payments/v1/authorizations/");
    expect(placed.url.pathname).toBe(`/payments/v1/authorizations/auth-${hppId}/order`);
    expect(placed.headers["Klarna-Idempotency-Key"]).toBe(await idempotencyUuid(`klarna-order:${o.id}`));
    expect(placed.headers["Klarna-Idempotency-Key"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const paid = await orderRow(o.id);
    expect(paid.status).toBe("paid");
    const klarnaOrderId = paid.paymentRef!.split(":")[3];
    expect(paid.paymentRef).toBe(`klarna:test:order:${klarnaOrderId}`);
    expect((await audits("payment.paid"))[0].detail).toMatchObject({ provider: "klarna", reference: klarnaOrderId, amountOre: o.totalOre });

    // Ingen ny ordre hos Klarna når bakgrunnsjobben eller kunden sjekker igjen.
    await sweepPayments(db);
    await handlePaymentReturn(db, { orderId: o.id, token: o.accessToken, host: "ullstua.no" });
    expect(world.find("POST", "/payments/v1/authorizations/")).toHaveLength(1);
    expect(world.klarna.orders.size).toBe(1);

    await setTracking(db, siteId, o.id, { carrier: "posten", number: "RR123456785NO" }, userId);
    await changeOrderStatus(db, siteId, o.id, "fulfilled", userId);
    const [capture] = world.find("POST", "/captures");
    expect(capture.body).toMatchObject({
      captured_amount: o.totalOre,
      shipping_info: [{ shipping_company: "Posten / Bring", tracking_number: "RR123456785NO", tracking_uri: "https://sporing.posten.no/sporing/RR123456785NO" }],
    });
    expect(capture.headers["Klarna-Idempotency-Key"]).toBe(await idempotencyUuid(`capture:${o.id}`));
    expect(world.klarna.orders.get(klarnaOrderId)).toMatchObject({ captured: o.totalOre, status: "CAPTURED" });

    await changeOrderStatus(db, siteId, o.id, "refunded", userId);
    expect(world.find("POST", "/refunds")[0].body).toEqual({ refunded_amount: o.totalOre });
    expect((await orderRow(o.id)).status).toBe("refunded");
    expect((await audits("payment.captured"))[0].detail).toMatchObject({ provider: "klarna", amountOre: o.totalOre });
    expect((await audits("payment.refunded"))[0].detail).toMatchObject({ provider: "klarna", amountOre: o.totalOre });
  });

  it("Klarna-ordre med feil beløp blir aldri betalt", async () => {
    await connectKlarna();
    const o = await order("klarna");
    await start(o);
    const hppId = (await orderRow(o.id)).paymentRef!.split(":")[3];
    world.completeKlarna(hppId);
    // Klarna oppgir et annet beløp enn ordren (etterligner en endret ordre hos Klarna).
    const original = world.fetchMock.getMockImplementation()!;
    world.fetchMock.mockImplementation(async (input, init) => {
      const res = await original(input, init);
      if (String(input).includes("/ordermanagement/v1/orders/") && (init?.method ?? "GET") === "GET") {
        const body = await res.json();
        return json(200, { ...body, order_amount: body.order_amount + 500, original_order_amount: body.order_amount + 500 });
      }
      return res;
    });

    const result = await syncOrderPayment(db, o.id);
    expect(result.paid).toBe(false);
    expect((await orderRow(o.id)).status).toBe("cancelled");
    expect(await audits("payment.amount_mismatch")).toHaveLength(1);
    expect(await audits("payment.paid")).toHaveLength(0);
    expect([...world.klarna.orders.values()][0].status).toBe("CANCELLED");
  });

  it("bakgrunnsjobben fanger opp betalinger og rydder bort de som ble avbrutt eller gikk ut på tid", async () => {
    await connectVipps();
    await connectKlarna();
    const paidLater = await order("vipps", { lines: [{ variantId: kaffeId, quantity: 1 }] });
    await start(paidLater);
    const expired = await order("vipps", { lines: [{ variantId: lueId, quantity: 1 }] });
    await start(expired);
    const abandoned = await order("klarna", { lines: [{ variantId: lueId, quantity: 2 }] });
    await start(abandoned);
    expect(await stockOf(lueId)).toBe(2);

    world.approveVipps(vippsRefOf((await orderRow(paidLater.id)).paymentRef));
    world.setVippsState(vippsRefOf((await orderRow(expired.id)).paymentRef), "EXPIRED");

    const notified: string[] = [];
    const first = await sweepPayments(db, { onPaid: async (id) => void notified.push(id) });
    expect(first).toEqual({ checked: 3, paid: 1, cancelled: 1, waiting: 1, failed: 0 });
    expect(notified).toEqual([paidLater.id]);
    expect((await orderRow(paidLater.id)).status).toBe("paid");
    expect((await orderRow(expired.id)).status).toBe("cancelled");
    expect((await orderRow(abandoned.id)).status).toBe("pending_payment");

    // En time senere er Klarnas betalingsside fortsatt ikke fullført. Den stenges, og varene legges tilbake.
    const later = await sweepPayments(db, { now: new Date(Date.now() + 2 * 60 * 60_000) });
    expect(later).toMatchObject({ checked: 1, cancelled: 1 });
    expect(world.find("DELETE", "/hpp/v1/sessions/")).toHaveLength(1);
    expect((await orderRow(abandoned.id)).status).toBe("cancelled");
    expect(await stockOf(lueId)).toBe(5);
  });

  it("bakgrunnsjobben krever nøkkelen, og returen sender kunden til kvitteringen", async () => {
    await connectVipps();
    const o = await order("vipps");
    await start(o);

    const denied = await cronPost(new Request("https://intern/api/cron/betaling", { method: "POST", headers: { "x-cron-key": "feil" } }));
    expect(denied.status).toBe(403);
    const key = await cronKey(process.env.SESSION_SECRET!.trim());
    const ok = await cronPost(new Request("https://intern/api/cron/betaling", { method: "POST", headers: { "x-cron-key": key } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ checked: 1, paid: 0, cancelled: 0, waiting: 1, failed: 0 });

    // Via plattformens adresse (/vis/<slug>) havner kunden på kvitteringen der.
    const viaPlatform = await returnGet(new Request(`http://localhost:3000/api/betaling/retur?ordre=${o.id}&t=${o.accessToken}`, { headers: { host: "localhost:3000" } }));
    expect(viaPlatform.status).toBe(303);
    expect(viaPlatform.headers.get("location")).toBe(`/vis/ullstua/ordre/${o.id}?t=${o.accessToken}`);
    const wrongToken = await returnGet(new Request(`https://ullstua.no/api/betaling/retur?ordre=${o.id}&t=${"a".repeat(48)}`));
    expect(wrongToken.status).toBe(404);
  });
});
