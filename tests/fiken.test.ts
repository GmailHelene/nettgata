import { and, eq, max, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, orderLines, orders, organizations, productVariants, sites, users } from "@/db/schema";
import {
  chooseFikenCompanyAction,
  disconnectFikenAction,
  saveFikenSettingsAction,
  sendOrdersToFikenAction,
  startFikenConnectAction,
  testFikenAction,
} from "@/app/studio/nettsted/[siteId]/betaling/fiken-actions";
import { chooseFikenCompany, fikenAccessToken, readFikenTokens, reconnectMessage, removeFiken, saveFikenSettings, testFikenConnection } from "@/lib/fiken/config";
import { fikenCallback, fikenNotConfiguredMessage, startFikenConnect } from "@/lib/fiken/connect";
import { consumeFikenState, createFikenState, fikenAvailableTo, STATE_TTL_MS, verifyFikenState } from "@/lib/fiken/oauth";
import { saleFromOrder, type FikenSaleLine, type SaleOptions } from "@/lib/fiken/mapping";
import { describeSendResult, fikenOverview, fikenPeriods, sendOrdersToFiken } from "@/lib/fiken/send";
import { fikenClosedMessage, fikenView, readStoredFiken, type FikenMethod } from "@/lib/fiken/state";
import { osloDate } from "@/lib/oslo-time";
import { updateShopSettings } from "@/lib/payments/config";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { createProduct } from "@/lib/shop/catalog";
import { saveDiscount } from "@/lib/shop/discounts";
import { createOrder, setOrderStatus, totalVat } from "@/lib/shop/orders";
import { periodReport } from "@/lib/shop/reports";
import { readShopSettings } from "@/lib/shop/settings";

// Studiohandlingene sjekker hvem som er logget inn. Her bestemmer testen rollen, og revalidatePath gjør ingenting.
vi.mock("@/lib/session", () => ({ requireSiteAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Åpenbart falske nøkler. Ingen av dem skal havne i loggen, i revisjonsloggen eller i klartekst i sites.shop.
const TOKEN = "fiken-test-tilgang-ikke-ekte-a1b2c3d4e5f6";
const NEW_TOKEN = "fiken-test-fornyet-tilgang-ikke-ekte-777";
const REFRESH = "fiken-test-fornyelse-ikke-ekte-b7c8d9";
const NEW_REFRESH = "fiken-test-ny-fornyelse-ikke-ekte-e1f2";
const CLIENT_ID = "nettgata-test-klient";
const CLIENT_SECRET = "fiken-test-klienthemmelighet-ikke-ekte-42";
const SECRETS = [TOKEN, NEW_TOKEN, REFRESH, NEW_REFRESH, CLIENT_SECRET];

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Call = { method: string; url: URL; headers: Record<string, string>; body: Record<string, unknown> | undefined };
type FakeSale = { saleId: number; slug: string; body: Record<string, unknown> };

const json = (status: number, body?: unknown) =>
  body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fiken slik testene ser det: et lite, tilstandsfullt etterlignet API bak fetch. Ingen kall går ut på nettet. */
function fikenWorld() {
  const calls: Call[] = [];
  const state = {
    validToken: TOKEN,
    companies: [{ name: "Ullstua AS", slug: "ullstua-as", organizationNumber: "999888777", vatType: "bi-monthly", hasApiAccess: true, testCompany: false }] as Record<
      string,
      unknown
    >[],
    bankAccounts: [
      { bankAccountId: 1, name: "Driftskonto", accountCode: "1920:10001", bankAccountNumber: "12345678903", type: "normal", inactive: false },
      { bankAccountId: 2, name: "Vipps", accountCode: "1920:10002", bankAccountNumber: "123456", type: "normal", inactive: false },
      { bankAccountId: 3, name: "Klarna", accountCode: "1920:10003", bankAccountNumber: "654321", type: "normal", inactive: false },
    ],
    accounts: [
      { code: "1920", name: "Bankinnskudd" },
      { code: "3000", name: "Salgsinntekt, avgiftspliktig" },
      { code: "3100", name: "Salgsinntekt, avgiftsfri" },
    ],
    sales: [] as FakeSale[],
    /** Salgsnumre Fiken avviser med 400. */
    rejectSaleNumbers: new Set<string>(),
    /** Salgsnumre der Fiken lagrer salget, men svaret aldri kommer fram (tidsavbrudd). */
    loseResponseFor: new Set<string>(),
    /** Svarer alt med denne statusen, for å prøve feilmeldingene. */
    forceStatus: null as number | null,
    /** OAuth2: kodene Fiken har gitt ut, med code_challenge fra innloggingen. Hver kode virker én gang. */
    codes: new Map<string, string>(),
    refreshToken: REFRESH,
    /** Fornyelsesnøkler som er brukt eller trukket tilbake. */
    deadRefresh: new Set<string>(),
    expiresIn: 86157,
    revoked: 0,
    tokenCalls: [] as URLSearchParams[],
  };
  let nextSaleId = 7001;

  const saleView = (s: FakeSale) => {
    const lines = s.body.lines as FikenSaleLine[];
    return {
      saleId: s.saleId,
      saleNumber: s.body.saleNumber,
      date: s.body.date,
      kind: s.body.kind,
      netAmount: lines.reduce((sum, l) => sum + l.netPrice, 0),
      vatAmount: lines.reduce((sum, l) => sum + l.vat, 0),
      lines,
    };
  };

  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = { ...((init.headers ?? {}) as Record<string, string>) };
    const isApi = url.origin === "https://api.fiken.no";
    const body = isApi && typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const method = init.method ?? "GET";
    calls.push({ method, url, headers, body });
    if (url.origin === "https://fiken.no") return oauthEndpoint(url, method, headers, String(init.body ?? ""));
    if (url.origin !== "https://api.fiken.no" || !url.pathname.startsWith("/api/v2/")) return json(404, {});
    if (state.forceStatus) return json(state.forceStatus, { message: "Tvunget feil i testen" });
    if (headers.Authorization !== `Bearer ${state.validToken}`) return json(401, { error: "unauthorized", error_description: "Invalid token" });

    const path = url.pathname.slice("/api/v2".length);
    if (path === "/companies" && method === "GET") return json(200, state.companies);
    const m = /^\/companies\/([^/]+)(\/.*)?$/.exec(path);
    const company = m ? state.companies.find((c) => c.slug === decodeURIComponent(m[1])) : undefined;
    if (!m || !company) return json(404, { message: "Not found" });
    const rest = m[2] ?? "";
    if (rest === "" && method === "GET") return json(200, company);
    if (rest === "/bankAccounts" && method === "GET") return json(200, state.bankAccounts);
    if (rest === "/accounts" && method === "GET") {
      const from = Number(url.searchParams.get("fromAccount") ?? 0);
      const to = Number(url.searchParams.get("toAccount") ?? 9999);
      return json(
        200,
        state.accounts.filter((a) => Number(a.code) >= from && Number(a.code) <= to),
      );
    }
    if (rest === "/sales" && method === "GET") {
      const wanted = url.searchParams.get("saleNumber");
      return json(200, state.sales.filter((s) => s.slug === company.slug && (!wanted || s.body.saleNumber === wanted)).map(saleView));
    }
    if (rest === "/sales" && method === "POST") {
      if (headers["Content-Type"] !== "application/json") return json(415, {});
      const number = String(body?.saleNumber);
      if (state.rejectSaleNumbers.has(number)) return json(400, { message: `Kontoen 1920:10009 finnes ikke (salg ${number})` });
      const sale = { saleId: nextSaleId++, slug: String(company.slug), body: body! };
      state.sales.push(sale);
      if (state.loseResponseFor.delete(number)) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return new Response(null, { status: 201, headers: { Location: `https://api.fiken.no/api/v2/companies/${company.slug}/sales/${sale.saleId}` } });
    }
    return json(404, {});
  });


  /** fiken.no/oauth/token og /oauth/revoke, slik dokumentasjonen beskriver dem. */
  async function oauthEndpoint(url: URL, method: string, headers: Record<string, string>, rawBody: string): Promise<Response> {
    if (method !== "POST") return json(405, {});
    if (url.pathname === "/oauth/revoke") {
      if (headers.Authorization !== `Bearer ${state.validToken}`) return json(401, {});
      state.revoked++;
      state.deadRefresh.add(state.refreshToken);
      state.validToken = "trukket-tilbake";
      return json(200, {});
    }
    if (url.pathname !== "/oauth/token") return json(404, {});
    // Tokenendepunktet krever Basic-innlogging med client id og client secret.
    if (headers.Authorization !== `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`) return json(401, { error: "invalid_client" });
    if (headers["Content-Type"] !== "application/x-www-form-urlencoded") return json(415, {});
    const form = new URLSearchParams(rawBody);
    state.tokenCalls.push(form);
    const grant = form.get("grant_type");
    if (grant === "authorization_code") {
      const code = form.get("code") ?? "";
      const challenge = state.codes.get(code);
      state.codes.delete(code);
      const verifier = form.get("code_verifier") ?? "";
      const hashed = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      if (!challenge || hashed !== challenge || form.get("redirect_uri") !== "https://nettgata.no/studio/fiken/callback" || !form.get("state")) {
        return json(400, { error: "invalid_grant", error_description: "The authorization code is invalid or expired." });
      }
      state.validToken = TOKEN;
      state.refreshToken = REFRESH;
      return json(200, { access_token: TOKEN, refresh_token: REFRESH, token_type: "bearer", expires_in: state.expiresIn });
    }
    if (grant === "refresh_token") {
      const sent = form.get("refresh_token") ?? "";
      if (sent !== state.refreshToken || state.deadRefresh.has(sent)) return json(400, { error: "invalid_grant", error_description: "Invalid refresh token" });
      state.deadRefresh.add(sent);
      state.validToken = NEW_TOKEN;
      state.refreshToken = NEW_REFRESH;
      return json(200, { access_token: NEW_TOKEN, refresh_token: NEW_REFRESH, token_type: "bearer", expires_in: state.expiresIn });
    }
    return json(400, { error: "unsupported_grant_type" });
  }

  return { calls, state, fetchMock, posts: () => calls.filter((c) => c.method === "POST" && c.url.origin === "https://api.fiken.no") };
}

describe("Fiken-koblingen", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let world: ReturnType<typeof fikenWorld>;
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

    world = fikenWorld();
    vi.stubGlobal("fetch", world.fetchMock);
    vi.stubEnv("FIKEN_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("FIKEN_CLIENT_SECRET", CLIENT_SECRET);
    logged = [];
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(async () => {
    // Nøkkelen skal aldri havne i loggen, i revisjonsloggen eller i klartekst i databasen, uansett hva testen gjorde.
    const audit = JSON.stringify(await db.select().from(auditLog));
    const shop = JSON.stringify((await siteRow()).shop);
    for (const secret of SECRETS) {
      expect(logged.join("\n")).not.toContain(secret);
      expect(audit).not.toContain(secret);
      expect(shop).not.toContain(secret);
    }
    // Alle kall gikk til Fiken, og nøklene sto bare i hodene eller i skjemaet til tokenendepunktet.
    for (const c of world.calls) {
      expect(["https://api.fiken.no", "https://fiken.no"]).toContain(c.url.origin);
      expect(c.url.search).not.toMatch(/token|secret/i);
      for (const secret of SECRETS) expect(JSON.stringify(c.body ?? {})).not.toContain(secret);
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function siteRow() {
    const [row] = await db.select().from(sites).where(eq(sites.id, siteId));
    return row;
  }

  async function audits(action: string) {
    return db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, action)));
  }

  const owner = () => ({ id: userId, isPlatformAdmin: false });
  const isOwner = async () => true;

  /** Eieren trykker «Koble til Fiken», logger inn hos Fiken og godtar. Fiken sender en kode tilbake til callback. */
  async function authorize(code = `kode-${crypto.randomUUID()}`) {
    const url = new URL(await startFikenConnect(siteId, userId));
    world.state.codes.set(code, url.searchParams.get("code_challenge")!);
    return { url, code, state: url.searchParams.get("state")! };
  }

  /** Hele tilkoblingen. Har brukeren flere selskaper, velges companySlug (eller det første). */
  async function connect(companySlug?: string) {
    const { code, state } = await authorize();
    const done = await fikenCallback(db, { code, state, error: null }, owner(), isOwner);
    if (done.result === "velg") await chooseFikenCompany(db, siteId, companySlug ?? world.state.companies[0].slug, userId);
    else expect(done).toEqual({ siteId, result: "koblet" });
    return done;
  }


  async function enable(paymentAccounts: Partial<Record<FikenMethod, string>>) {
    const stored = readStoredFiken((await siteRow()).shop)!;
    await saveFikenSettings(db, siteId, { ...stored.settings, paymentAccounts }, userId);
  }

  const send = () => sendOrdersToFiken(db, siteId, "maned", userId, { pauseMs: 0 });

  /** Ordre rett i databasen, med tall som går opp. Én varelinje på 399 kr med 25 % MVA hvis ikke annet er sagt. */
  async function insertOrder(opts: { status: "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded"; paymentMethod: string; paymentRef?: string }) {
    const lines = [{ totalOre: 39900, vatRate: 25 }];
    const subtotalOre = lines.reduce((s, l) => s + l.totalOre, 0);
    const [{ last }] = await db.select({ last: max(orders.number) }).from(orders).where(eq(orders.siteId, siteId));
    const [order] = await db
      .insert(orders)
      .values({
        siteId,
        number: (last ?? 1000) + 1,
        status: opts.status,
        customerName: "Kari Nordmann",
        customerEmail: "kari@test.no",
        shipping: { code: "hent", name: "Hent selv", priceOre: 0 },
        subtotalOre,
        shippingOre: 0,
        totalOre: subtotalOre,
        vatOre: totalVat(lines, 0),
        paymentMethod: opts.paymentMethod,
        paymentRef: opts.paymentRef ?? null,
        paidAt: opts.status === "pending_payment" || opts.status === "cancelled" ? null : new Date(),
        accessToken: "a".repeat(48),
      })
      .returning();
    await db.insert(orderLines).values(lines.map((l) => ({ orderId: order.id, name: "Strikket lue", quantity: 1, unitPriceOre: l.totalOre, vatRate: l.vatRate, totalOre: l.totalOre })));
    return order;
  }

  it("kobler til med OAuth2 og lagrer nøklene kryptert, aldri i klartekst og aldri i nettleseren", async () => {
    world.state.companies.push({ name: "Ullstua Test", slug: "ullstua-test", organizationNumber: null, vatType: "bi-monthly", hasApiAccess: true, testCompany: true });

    // Adressen eieren sendes til: authorize-endepunktet med kode, klient, callback, state og PKCE.
    const { url, code, state } = await authorize();
    expect(url.origin + url.pathname).toBe("https://fiken.no/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: "https://nettgata.no/studio/fiken/callback",
      state,
      code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      code_challenge_method: "S256",
    });
    expect(url.href).not.toContain(CLIENT_SECRET);

    // To selskaper: nøklene lagres, men eieren må velge selskap før noe kan sendes.
    expect(await fikenCallback(db, { code, state, error: null }, owner(), isOwner)).toEqual({ siteId, result: "velg" });
    const [exchange] = world.state.tokenCalls;
    expect(Object.fromEntries(exchange)).toEqual({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://nettgata.no/studio/fiken/callback",
      state,
      code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    const pending = fikenView((await siteRow()).shop)!;
    expect(pending).toMatchObject({ companySlug: null, needsReconnect: false });
    expect(pending.companyChoices.map((c) => c.slug)).toEqual(["ullstua-as", "ullstua-test"]);
    await expect(sendOrdersToFiken(db, siteId, "maned", userId, { pauseMs: 0 })).rejects.toThrow(/Velg først hvilket selskap/);
    await expect(chooseFikenCompany(db, siteId, "finnes-ikke", userId)).rejects.toThrow(/Fant ikke selskapet/);

    const companiesCall = world.calls.find((c) => c.url.pathname === "/api/v2/companies")!;
    expect(companiesCall.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, Accept: "application/json" });
    expect(companiesCall.headers["X-Request-ID"]).toMatch(/^[0-9a-f-]{36}$/);

    expect(await chooseFikenCompany(db, siteId, "ullstua-as", userId)).toMatchObject({ slug: "ullstua-as" });
    const shop = (await siteRow()).shop;
    for (const secret of SECRETS) expect(JSON.stringify(shop)).not.toContain(secret);
    const stored = readStoredFiken(shop)!;
    expect(stored.secret).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(stored).toMatchObject({ auth: "oauth", companySlug: "ullstua-as", companyChoices: [], companyName: "Ullstua AS", vatRegistered: true, testCompany: false, lastError: null });
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 86_000_000);
    // Forslaget: Vipps og Klarna til bankkontoene med samme navn. Faktura og betaling ved henting er av.
    expect(stored.settings).toEqual({ paymentAccounts: { vipps: "1920:10002", klarna: "1920:10003" }, incomeAccount: "3000", zeroVatIncomeAccount: "3100" });
    expect((await audits("fiken.connected"))[0].detail).toEqual({ companies: 2 });
    expect((await audits("fiken.company_chosen"))[0].detail).toEqual({ companySlug: "ullstua-as", testCompany: false });

    // Bare serveren kan lese nøklene, og bare for denne butikken.
    expect(await readFikenTokens(stored, siteId)).toEqual({ accessToken: TOKEN, refreshToken: REFRESH });
    expect(await readFikenTokens(stored, crypto.randomUUID())).toBeNull();

    // Det studioet og kassen får, har ingen nøkler, verken i klartekst eller kryptert.
    for (const visible of [fikenView(shop), readShopSettings(shop)]) {
      const text = JSON.stringify(visible);
      for (const secret of SECRETS) expect(text).not.toContain(secret);
      expect(text).not.toContain("v1:");
      expect(text).not.toContain(stored.connectionId);
    }
    expect(fikenView(shop)).not.toHaveProperty("secret");
    expect(readShopSettings(shop)).not.toHaveProperty("fiken");
  });

  it("lagring av butikkinnstillingene mister ikke Fiken-koblingen", async () => {
    await connect();
    const before = readShopSettings((await siteRow()).shop);
    await updateShopSettings(db, siteId, { ...before, freeShippingOverOre: 50000 });
    const after = (await siteRow()).shop;
    expect(readShopSettings(after).freeShippingOverOre).toBe(50000);
    expect(readStoredFiken(after)).toMatchObject({ companySlug: "ullstua-as" });
    expect(await readFikenTokens(readStoredFiken(after)!, siteId)).toEqual({ accessToken: TOKEN, refreshToken: REFRESH });
  });

  it("lager én linje per MVA-sats, med rabatt og frakt fordelt som i kassen", () => {
    const opts: SaleOptions = { paymentAccount: "1920:10001", incomeAccount: "3000", zeroVatIncomeAccount: "3100", vatRegistered: true };
    // 23.30 UTC 31. oktober er 00.30 1. november i Norge. Salget hører til datoen i Norge.
    const order = { number: 1001, createdAt: new Date("2026-10-31T23:30:00Z"), paidAt: new Date("2026-11-01T08:00:00Z"), totalOre: 103050, shippingOre: 9900, discountOre: 10350 };
    const lines = [
      { totalOre: 39900, vatRate: 25 },
      { totalOre: 38700, vatRate: 15 },
      { totalOre: 24900, vatRate: 0 },
    ];
    expect(saleFromOrder(order, lines, opts)).toEqual({
      date: "2026-11-01",
      kind: "cash_sale",
      saleNumber: "1001",
      currency: "NOK",
      totalPaid: 103050,
      paymentAccount: "1920:10001",
      paymentDate: "2026-11-01",
      lines: [
        { description: "Ordre 1001 fra nettbutikken, varer og frakt med 25 % MVA", netPrice: 31781, vat: 7945, vatType: "HIGH", account: "3000" },
        { description: "Ordre 1001 fra nettbutikken, varer og frakt med 15 % MVA", netPrice: 33506, vat: 5026, vatType: "MEDIUM", account: "3000" },
        { description: "Ordre 1001 fra nettbutikken, varer og frakt med 0 % MVA", netPrice: 24792, vat: 0, vatType: "EXEMPT", account: "3100" },
      ],
    });

    const base = { ...order, shippingOre: 0, discountOre: 0 };
    expect(saleFromOrder({ ...base, totalOre: 11200 }, [{ totalOre: 11200, vatRate: 12 }], opts).lines).toEqual([
      { description: "Ordre 1001 fra nettbutikken, varer med 12 % MVA", netPrice: 10000, vat: 1200, vatType: "LOW", account: "3000" },
    ]);
    // Selskap uten MVA-registrering: 0 % føres uten MVA-behandling, og ordre med MVA stoppes før de sendes.
    const unregistered = { ...opts, vatRegistered: false };
    expect(saleFromOrder({ ...base, totalOre: 24900 }, [{ totalOre: 24900, vatRate: 0 }], unregistered).lines[0]).toMatchObject({ vatType: "NONE", vat: 0, netPrice: 24900 });
    expect(() => saleFromOrder({ ...base, totalOre: 39900 }, [{ totalOre: 39900, vatRate: 25 }], unregistered)).toThrow(/ikke MVA-registrert i Fiken/);
    // Går ikke beløpene opp mot totalen, sendes ingenting.
    expect(() => saleFromOrder({ ...base, totalOre: 40000 }, [{ totalOre: 39900, vatRate: 25 }], opts)).toThrow(/går ikke opp/);
    expect(() => saleFromOrder({ ...base, totalOre: 11111 }, [{ totalOre: 11111, vatRate: 11 }], opts)).toThrow(/MVA-sats/);
  });

  it("sender ordren som et betalt salg med de samme tallene som kassen og MVA-rapporten", async () => {
    const product = async (name: string, vatRate: number, priceOre: number) => {
      const p = await createProduct(db, siteId, { name, vatRate, status: "active", variants: [{ optionValues: [], priceOre, stock: null }] }, userId);
      return (await db.select().from(productVariants).where(eq(productVariants.productId, p.id)))[0].id;
    };
    const lue = await product("Strikket lue", 25, 39900);
    const kaffe = await product("Kaffe", 15, 12900);
    const bok = await product("Strikkebok", 0, 24900);
    await saveDiscount(db, siteId, null, { code: "TIPROSENT", kind: "percent", value: 10 }, userId);
    const order = await createOrder(db, siteId, readShopSettings((await siteRow()).shop), {
      lines: [
        { variantId: lue, quantity: 1 },
        { variantId: kaffe, quantity: 3 },
        { variantId: bok, quantity: 1 },
      ],
      name: "Kari Nordmann",
      email: "kari@test.no",
      shippingCode: "post",
      address: { street: "Storgata 1", postalCode: "3340", city: "Åmot" },
      paymentMethod: "ved-henting",
      acceptedTerms: true,
      discountCode: "TIPROSENT",
    });
    expect(order).toMatchObject({ totalOre: 103050, vatOre: 12971, discountOre: 10350, shippingOre: 9900 });
    await setOrderStatus(db, siteId, order.id, "paid", userId);

    await connect();
    await enable({ "ved-henting": "1920:10001" });
    const result = await send();
    expect(result.sent).toEqual([{ orderId: order.id, number: order.number, saleId: "7001" }]);
    expect(describeSendResult(result)).toEqual({ ok: true, message: "1 ordre er sendt til Fiken." });

    const [post] = world.posts();
    expect(post.url.href).toBe("https://api.fiken.no/api/v2/companies/ullstua-as/sales");
    expect(post.headers["Content-Type"]).toBe("application/json");
    expect(post.body).toMatchObject({
      kind: "cash_sale",
      saleNumber: String(order.number),
      currency: "NOK",
      totalPaid: 103050,
      paymentAccount: "1920:10001",
      date: osloDate(order.createdAt),
    });
    const lines = post.body!.lines as FikenSaleLine[];
    expect(lines.map((l) => [l.vatType, l.netPrice, l.vat])).toEqual([
      ["HIGH", 31781, 7945],
      ["MEDIUM", 33506, 5026],
      ["EXEMPT", 24792, 0],
    ]);
    expect(lines.reduce((s, l) => s + l.netPrice + l.vat, 0)).toBe(order.totalOre);
    expect(lines.reduce((s, l) => s + l.vat, 0)).toBe(order.vatOre);
    // Samme tall per sats som salgs- og MVA-rapporten i studioet.
    const period = fikenPeriods()[0];
    const report = await periodReport(db, siteId, period.from, period.to);
    expect(report.vat.map((r) => [r.rate, r.netOre, r.vatOre])).toEqual(lines.map((l, i) => [[25, 15, 0][i], l.netPrice, l.vat]));
    // Ingen personopplysninger går til Fiken.
    expect(JSON.stringify(post.body)).not.toMatch(/Kari|kari@test\.no|Storgata|Åmot/);

    expect((await audits("order.fiken_sent"))[0].detail).toEqual({
      orderId: order.id,
      number: order.number,
      saleId: "7001",
      companySlug: "ullstua-as",
      amountOre: 103050,
    });
  });

  it("sender ikke kansellerte, refunderte, ubetalte eller testbetalte ordre", async () => {
    await connect();
    await enable({ vipps: "1920:10002", "ved-henting": "1920:10001" });
    const paid = await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    const fulfilled = await insertOrder({ status: "fulfilled", paymentMethod: "vipps", paymentRef: "vipps:production:sendtordre1234" });
    await insertOrder({ status: "cancelled", paymentMethod: "ved-henting" });
    await insertOrder({ status: "refunded", paymentMethod: "vipps", paymentRef: "vipps:production:refundert1234" });
    await insertOrder({ status: "pending_payment", paymentMethod: "ved-henting" });
    const testPaid = await insertOrder({ status: "paid", paymentMethod: "vipps", paymentRef: "vipps:test:testbetaling12" });
    await insertOrder({ status: "paid", paymentMethod: "faktura" });
    await insertOrder({ status: "paid", paymentMethod: "test" });

    const result = await send();
    expect(result.sent.map((s) => s.number)).toEqual([paid.number, fulfilled.number]);
    expect(result.skipped).toEqual({ method: 1, test: 2, zero: 0 });
    expect(world.posts().map((p) => [p.body?.saleNumber, p.body?.paymentAccount])).toEqual([
      [String(paid.number), "1920:10001"],
      [String(fulfilled.number), "1920:10002"],
    ]);
    expect(describeSendResult(result)).toEqual({
      ok: true,
      message: "2 ordre er sendt til Fiken. 1 ble ikke sendt fordi betalingsmåten ikke er valgt. 2 var testbetalinger og ble ikke sendt.",
    });

    // Til et testselskap i Fiken går ordren som er betalt i testmiljøet hos Vipps. Ordre som er sendt før, går ikke igjen.
    world.state.companies.push({ name: "Ullstua Test", slug: "ullstua-test", organizationNumber: null, vatType: "bi-monthly", hasApiAccess: true, testCompany: true });
    await connect("ullstua-test");
    await enable({ vipps: "1920:10002", "ved-henting": "1920:10001" });
    const again = await send();
    expect(again.sent.map((s) => s.number)).toEqual([testPaid.number]);
    expect(again).toMatchObject({ alreadySent: 2, skipped: { method: 1, test: 1, zero: 0 } });
    expect(world.state.sales.map((s) => [s.slug, s.body.saleNumber])).toEqual([
      ["ullstua-as", String(paid.number)],
      ["ullstua-as", String(fulfilled.number)],
      ["ullstua-test", String(testPaid.number)],
    ]);
  });

  it("sender aldri samme ordre to ganger", async () => {
    await connect();
    await enable({ "ved-henting": "1920:10001" });
    await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    expect((await send()).sent).toHaveLength(1);
    const second = await send();
    expect(second).toMatchObject({ sent: [], failed: [], alreadySent: 1 });
    expect(describeSendResult(second)).toEqual({ ok: true, message: "Ingen nye ordre å sende for denne måneden. 1 var sendt fra før." });
    expect(world.posts()).toHaveLength(1);

    // To trykk samtidig: bare én sending kjører om gangen, og ingen ordre sendes to ganger.
    await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    const both = await Promise.allSettled([send(), send()]);
    expect(world.posts()).toHaveLength(3);
    const done = both.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(done.reduce((sum, r) => sum + r.sent.length, 0)).toBe(2);
    for (const r of both) if (r.status === "rejected") expect(String(r.reason)).toMatch(/sendes til Fiken akkurat nå/);
    expect(await audits("order.fiken_sent")).toHaveLength(3);

    // Fiken lagret salget, men svaret kom aldri fram. Neste gang spør vi Fiken i stedet for å sende det på nytt.
    const lost = await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    world.state.loseResponseFor.add(String(lost.number));
    const timedOut = await send();
    expect(timedOut.failed).toEqual([{ orderId: lost.id, number: lost.number, message: "Fikk ikke kontakt med Fiken. Prøv igjen om litt." }]);
    expect(describeSendResult(timedOut).ok).toBe(false);
    expect((await audits("order.fiken_failed"))[0].detail).toMatchObject({ orderId: lost.id, uncertain: true, status: 0 });
    const retry = await send();
    expect(retry.sent).toEqual([{ orderId: lost.id, number: lost.number, saleId: expect.stringMatching(/^\d+$/) }]);
    expect(world.state.sales.filter((s) => s.body.saleNumber === String(lost.number))).toHaveLength(1);
    expect(world.calls.filter((c) => c.method === "GET" && c.url.searchParams.get("saleNumber") === String(lost.number))).toHaveLength(1);
    expect((await audits("order.fiken_sent")).find((l) => l.detail?.orderId === lost.id)?.detail).toMatchObject({ recovered: true });

    // Kobler butikken fra og til igjen, sendes ingenting på nytt.
    await removeFiken(db, siteId, userId);
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();
    await connect();
    await enable({ "ved-henting": "1920:10001" });
    const posts = world.posts().length;
    expect(await send()).toMatchObject({ sent: [], alreadySent: 4 });
    expect(world.posts()).toHaveLength(posts);
  });

  it("en ordre som feiler, stopper ikke resten", async () => {
    await connect();
    await enable({ "ved-henting": "1920:10001" });
    const a = await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    const b = await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    const c = await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    world.state.rejectSaleNumbers.add(String(b.number));

    const result = await send();
    expect(result.sent.map((s) => s.number)).toEqual([a.number, c.number]);
    expect(result.failed).toEqual([
      { orderId: b.id, number: b.number, message: `Fiken godtok ikke opplysningene. Fiken skrev: Kontoen 1920:10009 finnes ikke (salg ${b.number})` },
    ]);
    const text = describeSendResult(result);
    expect(text.ok).toBe(false);
    expect(text.message).toBe(`2 ordre er sendt til Fiken.\nOrdre ${b.number}: Fiken godtok ikke opplysningene. Fiken skrev: Kontoen 1920:10009 finnes ikke (salg ${b.number})`);

    world.state.rejectSaleNumbers.clear();
    expect((await send()).sent.map((s) => s.number)).toEqual([b.number]);
    expect(world.posts().map((p) => p.body?.saleNumber)).toEqual([a, b, c, b].map((o) => String(o.number)));
  });

  it("gir forståelige meldinger når Fiken sier nei", async () => {
    // Tilgangen trekkes tilbake i Fiken etter at butikken er koblet til: sendingen stopper etter første forsøk, og feilen vises i studioet.
    await connect();
    await enable({ "ved-henting": "1920:10001" });
    await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    world.state.validToken = "slettet-i-fiken";
    const result = await send();
    expect(result).toMatchObject({ sent: [], failed: [], remaining: 2, stopped: expect.stringMatching(/godtok ikke tilgangen/) });
    expect(world.posts()).toHaveLength(1);
    expect(describeSendResult(result)).toEqual({
      ok: false,
      message:
        "Sendingen stoppet. Fiken godtok ikke tilgangen. Den kan være trukket tilbake i Fiken. Koble til Fiken på nytt.\n2 ordre er ikke sendt ennå.",
    });
    expect(fikenView((await siteRow()).shop)).toMatchObject({ testedAt: null, lastError: expect.stringMatching(/godtok ikke tilgangen/) });
    expect(await audits("order.fiken_sent")).toHaveLength(0);

    // 403, 404 og 429 får hver sin forklaring.
    world.state.validToken = TOKEN;
    for (const [status, text] of [
      [403, /API-modulen i Fiken \(99 kr i måneden pluss mva\)/],
      [404, /Fant ikke selskapet i Fiken/],
      [429, /for mange forespørsler/],
      [503, /Fiken svarte med en feil \(503\)/],
    ] as const) {
      world.state.forceStatus = status;
      const test = await testFikenConnection(db, siteId, userId);
      expect(test.ok).toBe(false);
      expect(test.message).toMatch(text);
    }
    world.state.forceStatus = null;
    expect(await testFikenConnection(db, siteId, userId)).toEqual({ ok: true, message: "Tilkoblingen til Fiken virker." });
    expect(fikenView((await siteRow()).shop)).toMatchObject({ lastError: null, testedAt: expect.any(String) });

    // Ingen kontakt eller tidsavbrudd.
    world.fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(await testFikenConnection(db, siteId, userId)).toEqual({ ok: false, message: "Fikk ikke kontakt med Fiken. Prøv igjen om litt." });
  });

  it("viser ordre som må rettes i Fiken etter refusjon", async () => {
    await connect();
    await enable({ "ved-henting": "1920:10001" });
    const order = await insertOrder({ status: "paid", paymentMethod: "ved-henting" });
    await send();
    expect(await fikenOverview(db, siteId)).toMatchObject({ lastBatch: { sent: 1, failed: 0 }, needsCredit: [] });
    await setOrderStatus(db, siteId, order.id, "refunded", userId);
    expect((await fikenOverview(db, siteId)).needsCredit).toEqual([{ number: order.number, status: "refunded", saleId: "7001", creditNoteNumber: 1 }]);
  });

  it("bare eieren slipper til, og kundene først når Fiken-appen er registrert", async () => {
    const site = await siteRow();
    const actAs = (role: "owner" | "editor" | "developer", isPlatformAdmin = false) =>
      vi.mocked(requireSiteAccess).mockResolvedValue({ user: { id: userId, email: "eier@ullstua.no", name: null, isPlatformAdmin, emailVerified: true }, site, role });
    const denied = { ok: false, message: "Bare eieren av butikken kan koble til Fiken og sende ordre dit." };

    for (const role of ["editor", "developer"] as const) {
      actAs(role);
      expect(await startFikenConnectAction(siteId)).toEqual(denied);
      expect(await chooseFikenCompanyAction(siteId, "ullstua-as")).toEqual(denied);
      expect(await testFikenAction(siteId)).toEqual(denied);
      expect(await saveFikenSettingsAction(siteId, { paymentAccounts: { vipps: "1920:10001" } })).toEqual(denied);
      expect(await disconnectFikenAction(siteId)).toEqual(denied);
      expect(await sendOrdersToFikenAction(siteId, "maned")).toEqual(denied);
    }

    // Uten FIKEN_CLIENT_ID og FIKEN_CLIENT_SECRET: kundene slipper ikke til, og admin får beskjed om at appen mangler.
    vi.stubEnv("FIKEN_CLIENT_SECRET", "");
    expect(fikenAvailableTo({ isPlatformAdmin: false })).toBe(false);
    expect(fikenAvailableTo({ isPlatformAdmin: true })).toBe(true);
    actAs("owner");
    const closed = { ok: false, message: fikenClosedMessage };
    expect(await startFikenConnectAction(siteId)).toEqual(closed);
    expect(await sendOrdersToFikenAction(siteId, "maned")).toEqual(closed);
    actAs("owner", true);
    expect(await startFikenConnectAction(siteId)).toEqual({ ok: false, message: fikenNotConfiguredMessage });
    expect(world.calls).toHaveLength(0);
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();

    // Med begge satt er Fiken åpent for alle eiere.
    vi.stubEnv("FIKEN_CLIENT_SECRET", CLIENT_SECRET);
    expect(fikenAvailableTo({ isPlatformAdmin: false })).toBe(true);
    actAs("owner");
    const started = await startFikenConnectAction(siteId);
    expect(started).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/fiken\.no\/oauth\/authorize\?/) });
    const startUrl = new URL(started.url!);
    world.state.codes.set("eierkode", startUrl.searchParams.get("code_challenge")!);
    expect(await fikenCallback(db, { code: "eierkode", state: startUrl.searchParams.get("state"), error: null }, owner(), isOwner)).toEqual({ siteId, result: "koblet" });
    await insertOrder({ status: "paid", paymentMethod: "vipps", paymentRef: "vipps:production:eierordre1234" });
    expect(await sendOrdersToFikenAction(siteId, "maned")).toEqual({ ok: true, message: "1 ordre er sendt til Fiken." });
    // Eksporten bruker tilgangsnøkkelen fra OAuth2.
    expect(world.posts()[0]).toMatchObject({ headers: { Authorization: `Bearer ${TOKEN}` }, body: { paymentAccount: "1920:10002" } });

    // Grensen for antall forsøk gjelder eieren også.
    for (let i = 0; i < 30; i++) await hit(db, `fiken-sending:${siteId}`, { limit: 30, windowSeconds: 3600 });
    expect(await sendOrdersToFikenAction(siteId, "maned")).toEqual({ ok: false, message: "Mange forsøk på kort tid. Vent litt og prøv igjen." });
  });

  it("state er signert, går ut etter ti minutter, gjelder én bruker og kan brukes én gang", async () => {
    const now = Date.now();
    const state = await createFikenState(siteId, userId, now);
    const payload = await verifyFikenState(state, now);
    expect(payload).toMatchObject({ siteId, userId, expiresAt: now + STATE_TTL_MS });

    // Endret innhold eller signatur, eller laget med en annen hemmelighet: avvist.
    const [body, sig] = state.split(".");
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, siteId: crypto.randomUUID() })));
    expect(await verifyFikenState(`${forged}.${sig}`, now)).toBeNull();
    expect(await verifyFikenState(`${body}.${sig.slice(0, -2)}AA`, now)).toBeNull();
    expect(await verifyFikenState(`${body}`, now)).toBeNull();
    expect(await verifyFikenState("", now)).toBeNull();
    // Utløpt.
    expect(await verifyFikenState(state, now + STATE_TTL_MS + 1)).toBeNull();

    // Én bruk.
    expect(await consumeFikenState(db, payload!)).toBe(true);
    expect(await consumeFikenState(db, payload!)).toBe(false);

    // Hele flyten: en annen bruker kan ikke bruke state, en state kan ikke brukes to ganger, og «Avbryt» i Fiken lagrer ingenting.
    const a = await authorize();
    expect(await fikenCallback(db, { code: a.code, state: a.state, error: null }, { id: crypto.randomUUID(), isPlatformAdmin: true }, isOwner)).toEqual({
      siteId: null,
      result: "ingen-tilgang",
    });
    expect(await fikenCallback(db, { code: a.code, state: a.state, error: null }, owner(), async () => false)).toEqual({ siteId, result: "ingen-tilgang" });
    expect(await fikenCallback(db, { code: null, state: a.state, error: "access_denied" }, owner(), isOwner)).toEqual({ siteId, result: "avbrutt" });
    expect(await fikenCallback(db, { code: a.code, state: a.state, error: null }, owner(), isOwner)).toEqual({ siteId, result: "utlopt" });
    expect(await fikenCallback(db, { code: a.code, state: "tull.tull", error: null }, owner(), isOwner)).toEqual({ siteId: null, result: "utlopt" });
    expect(world.state.tokenCalls).toHaveLength(0);
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();

    // Koden er ugyldig hos Fiken: ingenting lagres.
    const b = await authorize();
    world.state.codes.clear();
    expect(await fikenCallback(db, { code: b.code, state: b.state, error: null }, owner(), isOwner)).toEqual({ siteId, result: "feil" });
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();
  });

  it("fornyer tilgangsnøkkelen før den går ut, og kobler fra når Fiken sier nei", async () => {
    await connect();
    await enable({ "ved-henting": "1920:10001" });
    await insertOrder({ status: "paid", paymentMethod: "ved-henting" });

    // Like før utløp: nøkkelen fornyes, de nye nøklene lagres kryptert, og salget sendes med den nye.
    const before = readStoredFiken((await siteRow()).shop)!;
    const soon = before.expiresAt - 60_000;
    const { token } = await fikenAccessToken(db, siteId, soon);
    expect(token).toBe(NEW_TOKEN);
    expect(Object.fromEntries(world.state.tokenCalls.at(-1)!)).toEqual({ grant_type: "refresh_token", refresh_token: REFRESH });
    const after = readStoredFiken((await siteRow()).shop)!;
    expect(after.secret).not.toBe(before.secret);
    expect(after.connectionId).toBe(before.connectionId);
    expect(await readFikenTokens(after, siteId)).toEqual({ accessToken: NEW_TOKEN, refreshToken: NEW_REFRESH });
    expect(await audits("fiken.token_refreshed")).toHaveLength(1);
    expect((await send()).sent).toHaveLength(1);
    expect(world.posts().at(-1)!.headers.Authorization).toBe(`Bearer ${NEW_TOKEN}`);

    // Ikke utløpt: ingen nye kall til tokenendepunktet.
    const calls = world.state.tokenCalls.length;
    expect((await fikenAccessToken(db, siteId)).token).toBe(NEW_TOKEN);
    expect(world.state.tokenCalls).toHaveLength(calls);

    // Fiken svarer ikke på fornyelsen: forbigående, ingenting kobles fra.
    const expiring = readStoredFiken((await siteRow()).shop)!.expiresAt - 60_000;
    world.fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    await expect(fikenAccessToken(db, siteId, expiring)).rejects.toThrow("Fikk ikke kontakt med Fiken. Prøv igjen om litt.");
    expect(fikenView((await siteRow()).shop)).toMatchObject({ needsReconnect: false });

    // Tilgangen er trukket tilbake i Fiken: fornyelsen feiler, koblingen står som frakoblet, og studioet sier fra.
    world.state.deadRefresh.add(NEW_REFRESH);
    await expect(fikenAccessToken(db, siteId, expiring)).rejects.toThrow(reconnectMessage);
    expect(fikenView((await siteRow()).shop)).toMatchObject({ needsReconnect: true, testedAt: null, lastError: reconnectMessage });
    expect(await audits("fiken.needs_reconnect")).toHaveLength(1);
    await expect(sendOrdersToFiken(db, siteId, "maned", userId, { pauseMs: 0 })).rejects.toThrow(reconnectMessage);
    await expect(testFikenConnection(db, siteId, userId)).rejects.toThrow(reconnectMessage);

    // Kobler til på nytt: valgene beholdes, og ingenting sendes to ganger.
    await connect();
    expect(fikenView((await siteRow()).shop)).toMatchObject({ needsReconnect: false, lastError: null, settings: { paymentAccounts: { "ved-henting": "1920:10001" } } });
    expect(await send()).toMatchObject({ sent: [], alreadySent: 1 });
  });

  it("«Koble fra» trekker tilbake tilgangen hos Fiken og sletter nøklene", async () => {
    await connect();
    expect(await removeFiken(db, siteId, userId)).toEqual({ revoked: true });
    expect(world.state.revoked).toBe(1);
    const revoke = world.calls.find((c) => c.url.href === "https://fiken.no/oauth/revoke")!;
    expect(revoke.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();
    expect((await audits("fiken.disconnected"))[0].detail).toEqual({ revoked: true });

    // Svarer ikke Fiken, slettes nøklene hos oss likevel.
    await connect();
    world.fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await removeFiken(db, siteId, userId)).toEqual({ revoked: false });
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();
  });

  it("gamle koblinger med personlig API-nøkkel leses ikke lenger", async () => {
    await db
      .update(sites)
      .set({
        shop: sql`${JSON.stringify({ fiken: { secret: "v1:abc:def", companySlug: "ullstua-as", companyName: "Ullstua AS", vatRegistered: true, savedAt: new Date().toISOString() } })}::jsonb`,
      })
      .where(eq(sites.id, siteId));
    expect(readStoredFiken((await siteRow()).shop)).toBeNull();
    await expect(send()).rejects.toThrow(/ikke koblet til/);
  });
});
