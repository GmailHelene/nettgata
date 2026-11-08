import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Innlogging i studioet: informasjonskapslene ligger i et kart, så serverhandlingene kan kjøres som eier eller ansatt.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: string | { name: string }) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { setDbForTests, type Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, memberships, orders, organizations, productVariants, sites, users } from "@/db/schema";
import { getCheckoutData, getPickupPoints } from "@/app/actions/shop";
import { createBringLabelAction } from "@/app/studio/nettsted/[siteId]/ordre/[orderId]/bring-actions";
import { GET as labelGet } from "@/app/studio/nettsted/[siteId]/ordre/[orderId]/etikett/route";
import { bulkCreateLabelsAction, bulkPrintLabelsAction } from "@/app/studio/nettsted/[siteId]/ordre/bulk-actions";
import { GET as labelsGet } from "@/app/studio/nettsted/[siteId]/ordre/etiketter/route";
import {
  removeBringKeysAction,
  saveBringKeysAction,
  saveBringShippingAction,
  testBringConnectionAction,
} from "@/app/studio/nettsted/[siteId]/innstillinger/frakt/actions";
import { bookBringShipment, bringLabelPdf, readBringBooking, readOrderBring } from "@/lib/bring/booking";
import { bulkBookLabels, labelBadge, MAX_BULK_LABELS } from "@/lib/bring/bulk";
import { bookingRequest, readShippingGuideResponse, shippingGuideRequest } from "@/lib/bring/client";
import { bringSetupView, loadBringAccess, removeBringKeys, saveBringKeys, saveBringShipping, testBringConnection } from "@/lib/bring/config";
import { clearPickupPointCache } from "@/lib/bring/pickup";
import { clearBringQuoteCache } from "@/lib/bring/quote";
import { readBringAccount } from "@/lib/bring/state";
import { cartWeight } from "@/lib/bring/weight";
import { saveShopSettingsAction } from "@/app/studio/shop-actions";
import { updateShopSettings } from "@/lib/payments/config";
import { createSession } from "@/lib/session";
import { createProduct, updateProduct } from "@/lib/shop/catalog";
import { createOrder, priceLines, setOrderStatus, type CheckoutInput } from "@/lib/shop/orders";
import { readShopSettings } from "@/lib/shop/settings";
import { setMediaStoreForTests, type MediaStore } from "@/lib/storage";

// Åpenbart falske verdier. «5» er Bring sitt offentlige testkundenummer for pakker i Norge (developer.bring.com/api/testing).
const UID = "bring-testbruker@ullstua.no";
const API_KEY = "falsk-bring-api-nokkel-0000";
const LABEL_TOKEN = "falsk-etikett-token-1234";
const SECRETS = [UID, API_KEY, LABEL_TOKEN];
/** En ekte PDF med én side, så sammenslåingen kan lese den. */
const PDF = await (async () => {
  const doc = await PDFDocument.create();
  doc.addPage([283, 425]);
  return doc.save();
})();

const json = (status: number, body?: unknown) =>
  body === undefined ? new Response(null, { status }) : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Kroner per tjeneste i den falske prislisten, pluss 10 kr per påbegynte kilo og 37 øre, så avrundingen testes. */
const base: Record<string, number> = { "3584": 69, "5800": 89, "5600": 149 };
const bringPrice = (product: string, grams: number) => base[product] + 10 * Math.ceil(grams / 1000) + 0.37;
/** Det kassen skal vise: prisen fra Bring med MVA, rundet opp til hele kroner, i øre. */
const expectedOre = (product: string, grams: number) => Math.ceil(bringPrice(product, grams)) * 100;

type Call = { method: string; url: URL; headers: Record<string, string>; body: Record<string, unknown> | undefined };

/** Bring slik testene ser det: Shipping Guide, Booking og etikett-PDF bak fetch. Ingen nettverk. */
function bringWorld() {
  const calls: Call[] = [];
  const world = { quotes: "ok" as "ok" | "500" | "nett", pickup: "ok" as "ok" | "500" | "nett" | "tom", extra: 0, booked: 0, bookingError: null as unknown, failFor: null as string | null };

  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = { ...((init.headers ?? {}) as Record<string, string>) };
    const body = typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const method = init.method ?? "GET";
    calls.push({ method, url, headers, body });
    const authed = headers["X-Mybring-API-Uid"] === UID && headers["X-Mybring-API-Key"] === API_KEY;

    if (url.href === "https://api.bring.com/shippingguide/api/v2/products" && method === "POST") {
      if (world.quotes === "nett") throw new TypeError("fetch failed");
      if (world.quotes === "500") return json(500, { fieldErrors: [{ code: "INTERNAL_ERROR", message: "Internal error", field: "" }] });
      if (!authed) return json(401, { fieldErrors: [{ code: "UNAUTHORIZED", message: "Unauthorized", field: "" }] });
      const consignment = (body!.consignments as Record<string, unknown>[])[0];
      const grams = (consignment.packages as { grossWeight: number }[])[0].grossWeight;
      const products = consignment.products as { id: string; customerNumber: string }[];
      return json(200, {
        consignments: [
          {
            consignmentId: "1",
            products: products.map((p) => {
              const amount = (bringPrice(p.id, grams) + world.extra).toFixed(2);
              const price = { currencyCode: "NOK", priceWithoutAdditionalServices: { amountWithoutVAT: "0.00", vat: "0.00", amountWithVAT: amount } };
              return {
                id: p.id,
                productionCode: p.id,
                price: { listPrice: { ...price, priceWithoutAdditionalServices: { ...price.priceWithoutAdditionalServices, amountWithVAT: "999.00" } }, netPrice: price },
                expectedDelivery: { workingDays: "2", formattedExpectedDeliveryDate: "04.11.2026" },
              };
            }),
          },
        ],
      });
    }

    if (url.origin + url.pathname === "https://api.bring.com/pickuppoint/api/pickuppoint/NO/postalCode/0150" && method === "GET") {
      if (world.pickup === "nett") throw new TypeError("fetch failed");
      if (world.pickup === "500") return json(500, { fieldErrors: [{ code: "INTERNAL_ERROR", message: "Internal error", field: "" }] });
      if (!authed) return json(401, {});
      if (world.pickup === "tom") return json(200, { pickupPoint: [] });
      return json(200, {
        pickupPoint: [
          { id: "108625", unitId: "1", name: "Rema 1000 Storgata", address: "Storgata 10", postalCode: "0155", city: "OSLO", distanceInKm: 0.4 },
          { id: 3011, name: "Kiwi Grensen", address: "Grensen 4", postalCode: "0159", city: "OSLO", distanceInKm: 1.25 },
          { id: "../ugyldig", name: "Skal hoppes over", address: "X", postalCode: "0150", city: "OSLO" },
        ],
      });
    }

    if (url.href === "https://api.bring.com/booking/api/create" && method === "POST") {
      if (!authed) return json(401, {});
      if (world.bookingError) return json(400, { consignments: [{ errors: [world.bookingError] }] });
      if (world.failFor && String(init.body ?? "").includes(world.failFor)) {
        return json(400, { consignments: [{ errors: [{ uniqueId: "x2", code: "BOOK-INPUT-021", messages: [{ lang: "no", message: "Ugyldig adresse" }] }] }] });
      }
      const n = ++world.booked;
      const consignmentNumber = `7043810126379${7400 + n}`;
      return json(200, {
        consignments: [
          {
            confirmation: {
              consignmentNumber,
              links: { labels: `https://www.mybring.com/booking/labels/${n}?auth-token=${LABEL_TOKEN}`, tracking: `https://sporing.posten.no/sporing/${consignmentNumber}` },
              packages: [{ packageNumber: `37072476000000${n}` }],
            },
          },
        ],
      });
    }

    if (url.hostname === "www.mybring.com" && url.pathname.startsWith("/booking/labels/")) {
      return url.searchParams.get("auth-token") === LABEL_TOKEN ? new Response(PDF as BodyInit, { status: 200, headers: { "content-type": "application/pdf" } }) : json(403, {});
    }
    return json(404, {});
  });

  return {
    calls,
    world,
    fetchMock,
    find: (pathPart: string) => calls.filter((c) => c.url.pathname.includes(pathPart)),
  };
}

function memoryStore(): MediaStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async put(key, data) {
      files.set(key, data);
    },
    async get(key) {
      const data = files.get(key);
      return data ? { body: data, contentType: "application/pdf", size: data.byteLength } : null;
    },
    async delete(key) {
      files.delete(key);
    },
    async list(prefix) {
      return [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

describe("frakt med Bring", () => {
  let db: Db;
  let siteId: string;
  let ownerId: string;
  let editorId: string;
  let strangerId: string;
  let lueId: string;
  let teppeGraId: string;
  let teppeBlaId: string;
  let kaffeId: string;
  let bring: ReturnType<typeof bringWorld>;
  let store: ReturnType<typeof memoryStore>;
  let logged: string[];

  beforeEach(async () => {
    db = await createPgliteDb();
    setDbForTests(db);
    clearBringQuoteCache();
    clearPickupPointCache();
    jar.clear();
    const [owner, editor, stranger] = await db
      .insert(users)
      .values([
        { email: "eier@ullstua.no", passwordHash: "x" },
        { email: "ansatt@ullstua.no", passwordHash: "y" },
        { email: "fremmed@annen.no", passwordHash: "z" },
      ])
      .returning();
    [ownerId, editorId, strangerId] = [owner.id, editor.id, stranger.id];
    const [org] = await db.insert(organizations).values({ name: "Ullstua AS" }).returning();
    await db.insert(memberships).values([
      { orgId: org.id, userId: ownerId, role: "owner" },
      { orgId: org.id, userId: editorId, role: "editor" },
    ]);
    const [site] = await db
      .insert(sites)
      .values({
        orgId: org.id,
        name: "Ullstua",
        slug: "ullstua",
        kind: "nettbutikk",
        industryPack: "nettbutikk",
        theme: demoTheme,
        info: { email: "post@ullstua.no", phone: "32 00 00 00" },
        shop: { paymentMethods: ["ved-henting", "test"] },
      })
      .returning();
    siteId = site.id;

    // Lue: 300 g på varen. Teppe: 1,5 kg på varen, den blå varianten veier 1,7 kg. Kaffe: uten vekt.
    const lue = await createProduct(db, siteId, { name: "Strikket lue", vatRate: 25, status: "active", weightGrams: 300, variants: [{ optionValues: [], priceOre: 39900, stock: 20 }] }, ownerId);
    const teppe = await createProduct(
      db,
      siteId,
      {
        name: "Ullteppe",
        vatRate: 25,
        status: "active",
        weightGrams: 1500,
        options: [{ name: "Farge", values: ["Grå", "Blå"] }],
        variants: [
          { optionValues: ["Grå"], priceOre: 129900, stock: 10 },
          { optionValues: ["Blå"], priceOre: 129900, stock: 10, weightGrams: 1700 },
        ],
      },
      ownerId,
    );
    const kaffe = await createProduct(db, siteId, { name: "Kaffe", vatRate: 15, status: "active", variants: [{ optionValues: [], priceOre: 12900, stock: null }] }, ownerId);
    const variantsOf = async (productId: string) => db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(productVariants.position);
    lueId = (await variantsOf(lue.id))[0].id;
    [teppeGraId, teppeBlaId] = (await variantsOf(teppe.id)).map((v) => v.id);
    kaffeId = (await variantsOf(kaffe.id))[0].id;

    bring = bringWorld();
    vi.stubGlobal("fetch", bring.fetchMock);
    store = memoryStore();
    setMediaStoreForTests(store);
    logged = [];
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(async () => {
    // Nøklene og etikettlenken skal aldri havne i loggen eller i revisjonsloggen, uansett hva testen gjorde.
    const audit = JSON.stringify(await db.select().from(auditLog));
    for (const secret of SECRETS) {
      expect(logged.join("\n")).not.toContain(secret);
      expect(audit).not.toContain(secret);
    }
    setMediaStoreForTests(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function site() {
    const [row] = await db.select().from(sites).where(eq(sites.id, siteId));
    return row;
  }

  const shippingSettings = {
    products: [
      { id: "3584", fallbackOre: 7900 },
      { id: "5800", fallbackOre: 14900 },
      { id: "5600", fallbackOre: 19900 },
    ],
    sender: { name: "Ullstua AS", street: "Testveien 1", postalCode: "3340", city: "Åmot" },
    packageCm: { length: 30, width: 20, height: 10 },
    atPostOffice: true,
  };

  async function connect(overrides: Record<string, string> = {}) {
    await saveBringKeys(db, siteId, { environment: "test", uid: UID, apiKey: API_KEY, customerNumber: "5", ...overrides }, ownerId);
    await saveBringShipping(db, siteId, shippingSettings, ownerId);
    return testBringConnection(db, siteId, ownerId);
  }

  function input(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
    return {
      lines: [{ variantId: lueId, quantity: 2 }],
      name: "Kari Nordmann",
      email: "kari@test.no",
      phone: "912 34 567",
      shippingCode: "bring-5800",
      address: { street: "Storgata 1", postalCode: "0150", city: "Oslo" },
      paymentMethod: "test",
      acceptedTerms: true,
      ...overrides,
    };
  }

  async function order(overrides: Partial<CheckoutInput> = {}) {
    return createOrder(db, siteId, readShopSettings((await site()).shop), input(overrides));
  }

  async function paidOrder(overrides: Partial<CheckoutInput> = {}) {
    const o = await order(overrides);
    await setOrderStatus(db, siteId, o.id, "paid", null);
    return o;
  }

  async function orderRow(id: string) {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row;
  }

  async function loginAs(userId: string) {
    jar.clear();
    await createSession(userId);
  }

  it("summerer vekten av handlekurven, med variantens egen vekt foran varens", async () => {
    expect(cartWeight([{ weightGrams: 300, quantity: 2 }, { weightGrams: 1700, quantity: 1 }])).toBe(2300);
    expect(cartWeight([{ weightGrams: 300, quantity: 2 }, { weightGrams: null, quantity: 1 }])).toBeNull();
    expect(cartWeight([])).toBeNull();
    expect(cartWeight([{ weightGrams: 0, quantity: 3 }])).toBeNull();

    const lines = await priceLines(db, siteId, [
      { variantId: lueId, quantity: 2 },
      { variantId: teppeGraId, quantity: 1 },
      { variantId: teppeBlaId, quantity: 1 },
    ]);
    expect(Object.fromEntries(lines.map((l) => [l.variantId, l.weightGrams]))).toEqual({ [lueId]: 300, [teppeGraId]: 1500, [teppeBlaId]: 1700 });
    expect(cartWeight(lines)).toBe(600 + 1500 + 1700);
    // Varer uten vekt kan fortsatt selges, men totalen er ukjent.
    const withCoffee = await priceLines(db, siteId, [{ variantId: lueId, quantity: 1 }, { variantId: kaffeId, quantity: 1 }]);
    expect(withCoffee).toHaveLength(2);
    expect(cartWeight(withCoffee)).toBeNull();

    // Lagres varen uten vekt i skjemaet (for eksempel fra et eldre skjema), beholdes vekten den har.
    const [teppe] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, teppeBlaId));
    await updateProduct(
      db,
      siteId,
      teppe.productId,
      {
        name: "Ullteppe",
        vatRate: 25,
        status: "active",
        options: [{ name: "Farge", values: ["Grå", "Blå"] }],
        variants: [
          { id: teppeGraId, optionValues: ["Grå"], priceOre: 129900, stock: 10 },
          { id: teppeBlaId, optionValues: ["Blå"], priceOre: 129900, stock: 10 },
        ],
      },
      ownerId,
    );
    expect(cartWeight(await priceLines(db, siteId, [{ variantId: teppeBlaId, quantity: 1 }]))).toBe(1700);
  });

  it("leser prisen fra Shipping Guide: butikkens avtalepris med MVA, rundet opp til hele kroner", () => {
    const body = {
      consignments: [
        {
          products: [
            {
              id: "5800",
              price: {
                listPrice: { priceWithoutAdditionalServices: { amountWithVAT: "181.25" } },
                netPrice: { priceWithoutAdditionalServices: { amountWithoutVAT: "118.42", vat: "29.61", amountWithVAT: "148.03" } },
              },
              expectedDelivery: { workingDays: "2" },
            },
            { id: "5600", price: { listPrice: { priceWithAdditionalServices: { amountWithVAT: "239.00" } } } },
            { id: "3584", errors: [{ code: "INVALID_MEASUREMENTS", errorCode: "PACKAGE_TOO_BIG", description: "Package too big" }] },
          ],
        },
      ],
    };
    expect(readShippingGuideResponse(body)).toEqual({
      "5800": { priceOre: 14900, deliveryDays: 2, error: null },
      "5600": { priceOre: 23900, deliveryDays: null, error: null },
      "3584": { priceOre: null, deliveryDays: null, error: { code: "PACKAGE_TOO_BIG", message: "Package too big" } },
    });
    expect(readShippingGuideResponse({ fieldErrors: [] })).toEqual({});

    // Forespørselen: vekt i gram, mål i centimeter, kundenummeret på hver tjeneste.
    expect(
      shippingGuideRequest({
        fromPostalCode: "3340",
        toPostalCode: "0150",
        weightGrams: 1234,
        packageCm: { length: 30, width: 20, height: 10 },
        products: ["5800", "5600"],
        customerNumber: "5",
        atPostOffice: false,
      }),
    ).toMatchObject({
      withPrice: true,
      edi: true,
      postingAtPostoffice: false,
      consignments: [
        {
          fromCountryCode: "NO",
          fromPostalCode: "3340",
          toCountryCode: "NO",
          toPostalCode: "0150",
          packages: [{ grossWeight: 1234, length: 30, width: 20, height: 10 }],
          products: [
            { id: "5800", customerNumber: "5" },
            { id: "5600", customerNumber: "5" },
          ],
        },
      ],
    });
  });

  it("kassen viser Bring-prisen for vekten og postnummeret, og butikkens regler gjelder fortsatt", async () => {
    expect((await connect()).ok).toBe(true);
    const lines = [{ variantId: lueId, quantity: 2 }];

    // Uten postnummer: ingen pris ennå, og Bring blir ikke spurt.
    const before = bring.find("/shippingguide").length;
    const noPostal = await getCheckoutData(siteId, lines, "bring-5800");
    expect(noPostal?.shippingOptions.map((o) => o.code)).toEqual(["hent", "post", "bring-3584", "bring-5800", "bring-5600"]);
    expect(noPostal?.shippingOptions.find((o) => o.code === "bring-5800")).toMatchObject({ pricePending: true, requiresAddress: true, name: "Pakke til hentested (Bring)" });
    expect(noPostal).toMatchObject({ shippingCode: "bring-5800", shippingPending: true, shippingOre: 0, totalOre: 79800 });
    expect(bring.find("/shippingguide")).toHaveLength(before);

    const data = await getCheckoutData(siteId, lines, "bring-5800", undefined, "0150");
    expect(data?.shippingOptions.filter((o) => o.code.startsWith("bring-")).map((o) => [o.code, o.priceOre, o.pricePending, o.deliveryDays])).toEqual([
      ["bring-3584", expectedOre("3584", 600), false, 2],
      ["bring-5800", expectedOre("5800", 600), false, 2],
      ["bring-5600", expectedOre("5600", 600), false, 2],
    ]);
    expect(data).toMatchObject({ shippingPending: false, shippingOre: expectedOre("5800", 600), totalOre: 79800 + expectedOre("5800", 600) });

    const [quote] = bring.find("/shippingguide").slice(-1);
    expect(quote.headers).toMatchObject({ "X-Mybring-API-Uid": UID, "X-Mybring-API-Key": API_KEY, "X-Bring-Client-URL": "http://localhost:3000", Accept: "application/json" });
    expect(quote.body).toMatchObject({
      postingAtPostoffice: true,
      consignments: [
        {
          fromPostalCode: "3340",
          toPostalCode: "0150",
          packages: [{ grossWeight: 600, length: 30, width: 20, height: 10 }],
          products: [
            { id: "3584", customerNumber: "5" },
            { id: "5600", customerNumber: "5" },
            { id: "5800", customerNumber: "5" },
          ],
        },
      ],
    });

    // Samme kurv og postnummer gir samme pris uten et nytt kall, også når ordren lages.
    const calls = bring.find("/shippingguide").length;
    await getCheckoutData(siteId, lines, "bring-5600", undefined, "0150");
    const o = await order({ seenShippingOre: expectedOre("5800", 600) });
    expect(bring.find("/shippingguide")).toHaveLength(calls);
    expect(o.shippingOre).toBe(expectedOre("5800", 600));

    // For tungt for Pakke i postkassen (maks 5 kg): valget vises ikke, og ordren avvises.
    const heavy = await getCheckoutData(siteId, [{ variantId: teppeBlaId, quantity: 3 }], "bring-3584", undefined, "0150");
    expect(heavy?.shippingOptions.map((o) => o.code)).not.toContain("bring-3584");
    expect(heavy?.shippingCode).toBe("hent");
    await expect(order({ lines: [{ variantId: teppeBlaId, quantity: 3 }], shippingCode: "bring-3584" })).rejects.toThrow(/for tung for Pakke i postkassen/);

    // Gratis frakt over et beløp gjelder også Bring, og da spørres ikke Bring.
    await updateShopSettings(db, siteId, { ...readShopSettings((await site()).shop), freeShippingOverOre: 50000 });
    const callsBeforeFree = bring.find("/shippingguide").length;
    const free = await getCheckoutData(siteId, lines, "bring-5800", undefined, "0151");
    expect(free).toMatchObject({ shippingOre: 0, shippingPending: false });
    expect(free?.shippingOptions.find((o) => o.code === "bring-5800")?.priceOre).toBe(0);
    const freeOrder = await order({ address: { street: "Storgata 1", postalCode: "0151", city: "Oslo" } });
    expect(freeOrder.shippingOre).toBe(0);
    expect(readOrderBring(freeOrder.shipping)).toMatchObject({ price: "gratis", product: "5800", weightGrams: 600 });
    expect(bring.find("/shippingguide")).toHaveLength(callsBeforeFree);
  });

  it("bruker reserveprisen når Bring feiler eller vekten mangler, og kassen stopper ikke", async () => {
    await connect();

    bring.world.quotes = "500";
    const failed = await getCheckoutData(siteId, [{ variantId: lueId, quantity: 1 }], "bring-5800", undefined, "5003");
    expect(failed?.shippingOptions.filter((o) => o.code.startsWith("bring-")).map((o) => o.priceOre)).toEqual([7900, 14900, 19900]);
    const viaReserve = await order({ lines: [{ variantId: lueId, quantity: 1 }], address: { street: "Kaigata 2", postalCode: "5003", city: "Bergen" } });
    expect(viaReserve.shippingOre).toBe(14900);
    expect(viaReserve.totalOre).toBe(39900 + 14900);
    expect(readOrderBring(viaReserve.shipping)).toMatchObject({ price: "reserve", reason: "bring", weightGrams: 300, toPostalCode: "5003" });

    bring.world.quotes = "nett";
    const offline = await order({ lines: [{ variantId: lueId, quantity: 1 }], shippingCode: "bring-5600", address: { street: "Kaigata 2", postalCode: "5004", city: "Bergen" } });
    expect(offline.shippingOre).toBe(19900);
    expect(logged.join("\n")).toMatch(/Bring ga ikke pris/);

    // Kaffen mangler vekt: reserveprisen, uten å spørre Bring.
    bring.world.quotes = "ok";
    const calls = bring.find("/shippingguide").length;
    const noWeight = await order({ lines: [{ variantId: kaffeId, quantity: 2 }], address: { street: "Kaigata 2", postalCode: "5005", city: "Bergen" } });
    expect(noWeight.shippingOre).toBe(14900);
    expect(readOrderBring(noWeight.shipping)).toMatchObject({ price: "reserve", reason: "vekt", weightGrams: null });
    expect(bring.find("/shippingguide")).toHaveLength(calls);
  });

  it("låser prisen på serveren, og en pris fra nettleseren brukes aldri", async () => {
    await connect();
    const price = expectedOre("5800", 600);
    // Felt nettleseren kan finne på å sende, blir ignorert. Prisen kommer fra Bring.
    const tampered = { ...input(), shippingPriceOre: 0, priceOre: 0, shippingOre: 0, totalOre: 100, shipping: { priceOre: 0 } } as unknown as CheckoutInput;
    const o = await createOrder(db, siteId, readShopSettings((await site()).shop), tampered);
    const row = await orderRow(o.id);
    expect(row.shippingOre).toBe(price);
    expect(row.shipping).toMatchObject({ code: "bring-5800", name: "Pakke til hentested (Bring)", priceOre: price });
    expect(row.totalOre).toBe(2 * 39900 + price);
    expect(readOrderBring(row.shipping)).toEqual({ product: "5800", weightGrams: 600, toPostalCode: "0150", price: "bring", reason: null });

    // Viste kassen en annen frakt enn serveren regner ut, stoppes bestillingen i stedet for at kunden betaler noe annet.
    await expect(order({ seenShippingOre: 0 })).rejects.toThrow(/Fraktprisen er nå/);
    expect(await order({ seenShippingOre: price })).toMatchObject({ shippingOre: price });

    // Endrer Bring prisen senere, står ordren med prisen den fikk.
    clearBringQuoteCache();
    bring.world.extra = 50;
    await order();
    expect((await orderRow(o.id)).shippingOre).toBe(price);
  });

  it("bestiller hos Bring med riktig form, lagrer sporingsnummeret og etiketten", async () => {
    // Navn og adresser kortes til grensene i Bring sitt API-skjema, og telefonnummer får landskode.
    const request = bookingRequest({
      orderNumber: 1001,
      recipient: { name: "Kari ".repeat(10), street: "Storgata 1", postalCode: "0150", city: "Oslo", email: "kari@test.no", phone: "0047 912 34 567" },
      sender: { name: "Ullstua AS", street: "Testveien 1", postalCode: "3340", city: "Åmot" },
      product: "5600",
      customerNumber: "5",
      weightGrams: 1234,
      packageCm: null,
      shippingDateTime: new Date("2026-11-02T08:30:00.000Z"),
    });
    const [consignment] = request.consignments;
    expect(consignment.parties.recipient.name.length).toBeLessThanOrEqual(35);
    expect(consignment.parties.recipient.contact.phoneNumber).toBe("+4791234567");
    expect(consignment.parties.sender).not.toHaveProperty("contact");
    expect(consignment.packages).toEqual([{ correlationId: "ordre-1001-1", weightInKg: 1.234 }]);

    await connect();
    const unpaid = await order();
    await expect(bookBringShipment(db, siteId, unpaid.id, { product: "5800", weightGrams: 600 }, ownerId)).rejects.toThrow(/når ordren er betalt/);

    const o = await paidOrder();
    const now = new Date("2026-11-02T08:30:00.000Z");
    const outcome = await bookBringShipment(db, siteId, o.id, { product: "5800", weightGrams: 650 }, ownerId, now);
    expect(outcome).toMatchObject({ labelError: null, trackingSaved: true, booking: { consignmentNumber: "70438101263797401", test: true, product: "5800", weightGrams: 650, hasLabel: true } });

    const [call] = bring.find("/booking/api/create");
    expect(call.headers).toMatchObject({
      "X-Mybring-API-Uid": UID,
      "X-Mybring-API-Key": API_KEY,
      "X-Bring-Client-URL": "http://localhost:3000",
      "X-Bring-Test-Indicator": "true",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(call.body).toEqual({
      consignments: [
        {
          correlationId: `ordre-${o.number}`,
          shippingDateTime: "2026-11-02T08:30:00.000Z",
          parties: {
            sender: {
              name: "Ullstua AS",
              addressLine: "Testveien 1",
              postalCode: "3340",
              city: "Åmot",
              countryCode: "NO",
              contact: { name: "Ullstua AS", email: "post@ullstua.no", phoneNumber: "+4732000000" },
            },
            recipient: {
              name: "Kari Nordmann",
              addressLine: "Storgata 1",
              postalCode: "0150",
              city: "Oslo",
              countryCode: "NO",
              reference: `Ordre ${o.number}`,
              contact: { name: "Kari Nordmann", email: "kari@test.no", phoneNumber: "+4791234567" },
            },
          },
          product: { id: "5800", customerNumber: "5" },
          packages: [{ correlationId: `ordre-${o.number}-1`, weightInKg: 0.65, dimensions: { lengthInCm: 30, widthInCm: 20, heightInCm: 10 } }],
        },
      ],
    });
    // Testmodus settes bare med hodet. Bring har sluttet å støtte testIndicator i selve bestillingen.
    expect(JSON.stringify(call.body)).not.toContain("testIndicator");

    // Sporingsnummeret er sendingsnummeret, lagret med den vanlige sporingen.
    const row = await orderRow(o.id);
    expect(row).toMatchObject({ trackingCarrier: "posten", trackingNumber: "70438101263797401", status: "paid" });
    const booking = readBringBooking(row.shipping)!;
    expect(booking).toMatchObject({ labelKey: `fraktetiketter/${siteId}/${o.id}.pdf`, labelRef: null, packageNumbers: ["370724760000001"] });
    // Etiketten er hentet med nøklene fra Bring sin egen adresse, og lenken med tilgangsnøkkel lagres ikke.
    expect(bring.find("/booking/labels/")[0].headers["X-Mybring-API-Key"]).toBe(API_KEY);
    expect(JSON.stringify(row)).not.toContain(LABEL_TOKEN);
    const label = await bringLabelPdf(db, siteId, o.id);
    expect(label?.filename).toBe(`fraktetikett-ordre-${o.number}.pdf`);
    expect(new TextDecoder().decode(label!.body as Uint8Array)).toMatch(/^%PDF/);

    // Samme ordre bestilles aldri to ganger.
    await expect(bookBringShipment(db, siteId, o.id, { product: "5800", weightGrams: 650 }, ownerId)).rejects.toThrow(/allerede laget/);
    expect(bring.find("/booking/api/create")).toHaveLength(1);

    // Avviser Bring bestillingen, vises meldingen, og ordren kan prøves igjen.
    const second = await paidOrder();
    bring.world.bookingError = { uniqueId: "x1", code: "BOOK-INPUT-021", messages: [{ lang: "en", message: "Invalid customer number" }, { lang: "no", message: "Ugyldig kundenummer" }] };
    await expect(bookBringShipment(db, siteId, second.id, { product: "5800", weightGrams: 600 }, ownerId)).rejects.toThrow("Bring avviste bestillingen: Ugyldig kundenummer (BOOK-INPUT-021)");
    expect((await orderRow(second.id)).shipping).not.toHaveProperty("bringBooking");
    bring.world.bookingError = null;
    expect((await bookBringShipment(db, siteId, second.id, { product: "3584", weightGrams: 600 }, ownerId)).booking.product).toBe("3584");

    // Pakke i postkassen kan veie maks 5 kg.
    const third = await paidOrder();
    await expect(bookBringShipment(db, siteId, third.id, { product: "3584", weightGrams: 5001 }, ownerId)).rejects.toThrow(/maks 5 kg/);

    // I produksjon sendes ikke testhodet.
    await connect({ environment: "production" });
    await bookBringShipment(db, siteId, third.id, { product: "5800", weightGrams: 900 }, ownerId);
    expect(bring.find("/booking/api/create").slice(-1)[0].headers).not.toHaveProperty("X-Bring-Test-Indicator");
    expect(readBringBooking((await orderRow(third.id)).shipping)?.test).toBe(false);
  });

  it("hentesteder: kunden velger, valget lagres på ordren og sendes med i bookingen", async () => {
    expect((await connect()).ok).toBe(true);

    // Listen kommer fra Pickup Point API med samme nøkler, nærmest først. Poster med ugyldig id hoppes over, tall-id blir tekst.
    const points = await getPickupPoints(siteId, "0150");
    expect(points).toEqual([
      { id: "108625", name: "Rema 1000 Storgata", address: "Storgata 10", postalCode: "0155", city: "OSLO", distanceKm: 0.4 },
      { id: "3011", name: "Kiwi Grensen", address: "Grensen 4", postalCode: "0159", city: "OSLO", distanceKm: 1.25 },
    ]);
    const [call] = bring.find("/pickuppoint/");
    expect(call.method).toBe("GET");
    expect(call.url.searchParams.get("numberOfResponses")).toBe("6");
    expect(call.headers).toMatchObject({ "X-Mybring-API-Uid": UID, "X-Mybring-API-Key": API_KEY, Accept: "application/json" });
    // Samme postnummer gir samme liste uten nytt kall. Ugyldig postnummer spør ikke Bring.
    await getPickupPoints(siteId, "0150");
    expect(await getPickupPoints(siteId, "01")).toEqual([]);
    expect(await getPickupPoints(siteId, "0150; drop")).toEqual([]);
    expect(bring.find("/pickuppoint/")).toHaveLength(1);

    // Valget lagres på ordren, og sendes med til Bring som parties.pickupPoint.
    const chosen = await paidOrder({ pickupPointId: "3011" });
    expect(readOrderBring(chosen.shipping)).toMatchObject({
      product: "5800",
      pickupPoint: { id: "3011", name: "Kiwi Grensen", address: "Grensen 4", postalCode: "0159", city: "OSLO" },
    });
    await bookBringShipment(db, siteId, chosen.id, { product: "5800", weightGrams: 650 }, ownerId);
    const [booked] = bring.find("/booking/api/create");
    const parties = (booked.body!.consignments as { parties: Record<string, unknown> }[])[0].parties;
    expect(parties.pickupPoint).toEqual({ countryCode: "NO", id: "3011" });

    // En id som ikke finnes for postnummeret, ignoreres: ingen hentested lagres, og Bring velger nærmeste.
    const forged = await paidOrder({ pickupPointId: "999999" });
    expect(readOrderBring(forged.shipping)?.pickupPoint).toBeUndefined();
    await bookBringShipment(db, siteId, forged.id, { product: "5800", weightGrams: 650 }, ownerId);
    const lastParties = (bring.find("/booking/api/create").slice(-1)[0].body!.consignments as { parties: Record<string, unknown> }[])[0].parties;
    expect(lastParties).not.toHaveProperty("pickupPoint");

    // Hentested hører bare til Pakke til hentested.
    const home = await paidOrder({ pickupPointId: "3011", shippingCode: "bring-5600" });
    expect(readOrderBring(home.shipping)?.pickupPoint).toBeUndefined();
    // Bestilles en annen tjeneste enn 5800, sendes ikke hentested selv om ordren har ett.
    const other = await paidOrder({ pickupPointId: "108625" });
    expect(readOrderBring(other.shipping)?.pickupPoint?.id).toBe("108625");
    await bookBringShipment(db, siteId, other.id, { product: "3584", weightGrams: 650 }, ownerId);
    expect(bring.find("/booking/api/create").slice(-1)[0].body).not.toHaveProperty("consignments.0.parties.pickupPoint");
  });

  it("hentesteder: uten svar fra Bring finnes ingen velger, og bestillingen går som før", async () => {
    expect((await connect()).ok).toBe(true);

    for (const mode of ["500", "nett", "tom"] as const) {
      clearPickupPointCache();
      bring.world.pickup = mode;
      expect(await getPickupPoints(siteId, "0150")).toEqual([]);
      const o = await paidOrder({ pickupPointId: "3011" });
      expect(readOrderBring(o.shipping)).toMatchObject({ product: "5800", toPostalCode: "0150" });
      expect(readOrderBring(o.shipping)?.pickupPoint).toBeUndefined();
      await bookBringShipment(db, siteId, o.id, { product: "5800", weightGrams: 650 }, ownerId);
      expect(bring.find("/booking/api/create").slice(-1)[0].body).not.toHaveProperty("consignments.0.parties.pickupPoint");
    }
    expect(logged.join("\n")).toMatch(/Bring ga ikke hentesteder/);

    // Tomme svar og feil huskes ikke: kommer Bring tilbake, vises listen med en gang.
    bring.world.pickup = "ok";
    expect(await getPickupPoints(siteId, "0150")).toHaveLength(2);

    // Uten at butikken har slått på Pakke til hentested, spørres ikke Bring.
    await saveBringShipping(db, siteId, { ...shippingSettings, products: [{ id: "5600", fallbackOre: 19900 }] }, ownerId);
    clearPickupPointCache();
    const calls = bring.find("/pickuppoint/").length;
    expect(await getPickupPoints(siteId, "0150")).toEqual([]);
    expect(bring.find("/pickuppoint/")).toHaveLength(calls);
  });

  it("varesiden viser Bring-valgene butikken har slått på, med reserveprisen som «fra»-pris", async () => {
    expect((await connect()).ok).toBe(true);
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ProductPage } = await import("@/components/shop/pages");
    const product = { id: "p", slug: "lue", name: "Strikket lue", description: "", images: [], options: [], vatRate: 25, variants: [{ id: lueId, optionValues: [], label: "", priceOre: 39900, stock: 20 }] } as never;
    const render = async () =>
      renderToStaticMarkup(
        createElement(ProductPage, { siteId, siteName: "Ullstua", product, basePath: "", settings: readShopSettings((await site()).shop), origin: "http://localhost:3000" }),
      );

    const html = await render();
    expect(html).toContain("Pakke i postkassen (Bring)");
    expect(html).toContain("Pakke til hentested (Bring)");
    expect(html).toContain("Pakke levert hjem (Bring)");
    expect(html).toMatch(/fra[^<]*79[^<]*kr/);
    expect(html).toMatch(/fra[^<]*149[^<]*kr/);
    expect(html).toMatch(/fra[^<]*199[^<]*kr/);
    // De faste fraktvalgene står der de gjorde.
    expect(html).toContain("Hent selv");

    // Slår butikken av en tjeneste, forsvinner den fra listen.
    await saveBringShipping(db, siteId, { ...shippingSettings, products: [{ id: "5600", fallbackOre: 19900 }] }, ownerId);
    const fewer = await render();
    expect(fewer).toContain("Pakke levert hjem (Bring)");
    expect(fewer).not.toContain("Pakke til hentested (Bring)");
  });

  it("lagrer nøklene kryptert, og verken kassen eller studioet får dem", async () => {
    expect((await connect()).ok).toBe(true);
    const shop = (await site()).shop;
    const raw = JSON.stringify(shop);
    for (const secret of SECRETS) expect(raw).not.toContain(secret);
    const account = readBringAccount(shop)!;
    expect(account.secret).toMatch(/^v1:/);
    expect(account).toMatchObject({ environment: "test", hint: "b…@ullstua.no", customerNumber: "5" });
    expect(account.testedAt).not.toBeNull();
    expect((await loadBringAccess({ id: siteId, shop }))?.credentials).toEqual({ uid: UID, apiKey: API_KEY });
    // Krypteringen er bundet til butikken: kopiert til en annen butikk kan nøklene ikke leses.
    expect(await loadBringAccess({ id: crypto.randomUUID(), shop })).toBeNull();

    // Det nettleseren og studioet får, har ingen nøkler, verken i klartekst eller kryptert.
    const visible = [readShopSettings(shop), bringSetupView(shop), await getCheckoutData(siteId, [{ variantId: lueId, quantity: 1 }], "bring-5800", undefined, "0150")];
    for (const v of visible) {
      const text = JSON.stringify(v);
      for (const secret of SECRETS) expect(text).not.toContain(secret);
      expect(text).not.toContain("v1:");
    }

    // Lagring av butikkinnstillingene mister ikke Bring-oppsettet, og Bring vises fortsatt i kassen.
    await updateShopSettings(db, siteId, { ...readShopSettings(shop), freeShippingOverOre: 90000 });
    const after = (await site()).shop;
    expect(readBringAccount(after)?.secret).toBe(account.secret);
    expect(readShopSettings(after)).toMatchObject({ freeShippingOverOre: 90000, bringShipping: { environment: "test" } });
    expect(after).not.toHaveProperty("bringShipping");

    // Nye nøkler må testes før Bring vises i kassen. «Fjern» tar nøklene og lar fraktvalgene stå.
    await saveBringKeys(db, siteId, { environment: "test", uid: UID, apiKey: API_KEY, customerNumber: "5" }, ownerId);
    expect(readShopSettings((await site()).shop).bringShipping).toBeNull();
    await removeBringKeys(db, siteId, ownerId);
    expect(readBringAccount((await site()).shop)).toBeNull();
    expect(bringSetupView((await site()).shop).shipping?.products).toHaveLength(3);
  });

  it("«Lagre butikkinnstillinger» i studioet sletter ikke Bring-koblingen", async () => {
    expect((await connect()).ok).toBe(true);
    const before = readBringAccount((await site()).shop);
    expect(before?.testedAt).not.toBeNull();

    // Slik skjemaet under Innstillinger sender dem: bare de faste feltene, uten noe om Bring.
    await loginAs(ownerId);
    const settings = readShopSettings((await site()).shop);
    const result = await saveShopSettingsAction(siteId, {
      shippingOptions: settings.shippingOptions,
      freeShippingOverOre: 75000,
      paymentMethods: ["ved-henting", "test"],
      termsPath: settings.termsPath,
      lowStockAt: 3,
    });
    expect(result).toEqual({ ok: true, message: "Butikkinnstillingene er lagret" });

    const after = (await site()).shop;
    expect(readShopSettings(after).freeShippingOverOre).toBe(75000);
    expect(readBringAccount(after)).toEqual(before);
    expect(bringSetupView(after).shipping).toEqual(shippingSettings);
    const checkout = await getCheckoutData(siteId, [{ variantId: lueId, quantity: 1 }], "bring-5800", undefined, "0150");
    expect(checkout?.shippingOptions.map((o) => o.code)).toEqual(["hent", "post", "bring-3584", "bring-5800", "bring-5600"]);
  });

  it("bare eieren kan endre nøklene, og bare de med tilgang kan hente etiketten", async () => {
    const keys = { environment: "test", uid: UID, apiKey: API_KEY, customerNumber: "5" };

    await loginAs(editorId);
    expect(await saveBringKeysAction(siteId, keys)).toEqual({ ok: false, message: "Bare eieren av butikken kan endre Bring-oppsettet.", saved: false });
    for (const result of [await saveBringShippingAction(siteId, shippingSettings), await testBringConnectionAction(siteId), await removeBringKeysAction(siteId)]) {
      expect(result).toEqual({ ok: false, message: "Bare eieren av butikken kan endre Bring-oppsettet." });
    }
    expect((await site()).shop).not.toHaveProperty("bring");
    expect(bring.calls).toHaveLength(0);

    // Uten innlogging sendes brukeren til innloggingen, og ingenting lagres.
    jar.clear();
    await expect(saveBringKeysAction(siteId, keys)).rejects.toThrow();
    expect((await site()).shop).not.toHaveProperty("bring");

    await loginAs(ownerId);
    const saved = await saveBringKeysAction(siteId, keys);
    expect(saved).toMatchObject({ ok: true, saved: true });
    expect(saved.message).toMatch(/Tilkoblingen til Bring virker/);
    expect(await saveBringShippingAction(siteId, shippingSettings)).toEqual({ ok: true, message: "Fraktvalgene er lagret." });
    expect(readBringAccount((await site()).shop)?.testedAt).not.toBeNull();

    // Å lage etiketten er vanlig arbeid, så den ansatte kan gjøre det.
    const o = await paidOrder();
    await loginAs(editorId);
    expect(await createBringLabelAction(siteId, o.id, { product: "5800", weightGrams: 600 })).toMatchObject({
      ok: true,
      message: expect.stringMatching(/^Testbestillingen er sendt til Bring\. .*Sendingsnummeret 70438101263797401 er lagt inn som sporing\.$/),
    });

    const get = () => labelGet(new Request(`http://localhost:3000/studio/nettsted/${siteId}/ordre/${o.id}/etikett`), { params: Promise.resolve({ siteId, orderId: o.id }) });
    const ok = await get();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf");
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(new TextDecoder().decode(new Uint8Array(await ok.arrayBuffer()))).toMatch(/^%PDF/);

    await loginAs(strangerId);
    expect((await get()).status).toBe(403);
    jar.clear();
    expect((await get()).status).toBe(403);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, "bring.booked")))).toHaveLength(1);
  });

  // ---------- Bulk ----------

  const bookingCalls = () => bring.find("/booking/api/create").length;
  const pageCount = async (res: Response) => (await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))).getPageCount();
  const etiketter = (ids: string[]) =>
    labelsGet(new Request(`http://localhost:3000/studio/nettsted/${siteId}/ordre/etiketter?ids=${ids.join(",")}`), { params: Promise.resolve({ siteId }) });

  it("lager etiketter for en blanding av ordre: booker, hopper over med forklaring, og én feil stopper ikke de andre", async () => {
    await connect();
    const a = await paidOrder({ name: "Anne Ok" });
    const b = await paidOrder({ name: "Bjørn Ok", shippingCode: "bring-3584" });
    const hent = await paidOrder({ shippingCode: "hent", address: undefined });
    const post = await paidOrder({ shippingCode: "post" });
    const venter = await order();
    const feil = await paidOrder({ name: "Feil Person" });
    const uvekt = await paidOrder({ lines: [{ variantId: kaffeId, quantity: 1 }] });
    const fraFor = await paidOrder({ name: "Fra Før" });
    await loginAs(editorId);
    expect(await bookBringShipment(db, siteId, fraFor.id, { product: "5800", weightGrams: 600 }, editorId)).toBeTruthy();
    const before = bookingCalls();

    bring.world.failFor = "Feil Person";
    const result = await bulkCreateLabelsAction(siteId, [a.id, b.id, hent.id, post.id, venter.id, feil.id, uvekt.id, fraFor.id]);
    expect(bookingCalls() - before).toBe(3);
    expect(result).toMatchObject({ booked: 2, skipped: 5, failed: 1, ok: false });
    expect(result.message).toBe("2 etiketter ble booket, 5 ordre ble hoppet over og 1 feilet.");
    const why = Object.fromEntries(result.problems.map((p) => [p.number, `${p.status}: ${p.reason}`]));
    expect(why[hent.number]).toBe("skipped: Hentes i butikken, så den trenger ingen etikett");
    expect(why[post.number]).toMatch(/^skipped: Kunden valgte ikke Bring i kassen/);
    expect(why[venter.number]).toBe("skipped: Ikke betalt ennå");
    expect(why[uvekt.number]).toMatch(/^skipped: Vekten mangler/);
    expect(why[fraFor.number]).toBe("skipped: Har etikett fra før");
    expect(why[feil.number]).toBe("failed: Bring avviste bestillingen: Ugyldig adresse (BOOK-INPUT-021)");
    expect(why[a.number]).toBeUndefined();

    // De to første har etikett og sporing. Den som feilet, ble sluppet og kan prøves på nytt.
    for (const o of [a, b]) {
      const row = await orderRow(o.id);
      expect(readBringBooking(row.shipping)).toMatchObject({ test: true, labelKey: `fraktetiketter/${siteId}/${o.id}.pdf` });
      expect(row.trackingCarrier).toBe("posten");
      expect(row.trackingNumber).toBe(readBringBooking(row.shipping)!.consignmentNumber);
    }
    expect((await orderRow(feil.id)).shipping).not.toHaveProperty("bringBooking");
    bring.world.failFor = null;
    expect(await bulkCreateLabelsAction(siteId, [feil.id])).toMatchObject({ booked: 1, skipped: 0, failed: 0, ok: true });
  });

  it("booker aldri det samme to ganger, heller ikke når valget har dubletter eller kjøres på nytt", async () => {
    await connect();
    const a = await paidOrder();
    const b = await paidOrder();
    await loginAs(editorId);

    expect(await bulkCreateLabelsAction(siteId, [a.id, a.id, b.id, a.id])).toMatchObject({ booked: 2, skipped: 0, failed: 0 });
    expect(bookingCalls()).toBe(2);

    const again = await bulkCreateLabelsAction(siteId, [a.id, b.id]);
    expect(again).toMatchObject({ booked: 0, skipped: 2, failed: 0 });
    expect(again.problems.map((p) => p.reason)).toEqual(["Har etikett fra før", "Har etikett fra før"]);
    expect(bookingCalls()).toBe(2);

    // To samtidige kjøringer for samme ordre gir én bestilling.
    const c = await paidOrder();
    const results = await Promise.all([bulkBookLabels(db, siteId, [c.id], editorId), bulkBookLabels(db, siteId, [c.id], editorId)]);
    expect(results.reduce((n, r) => n + r.booked, 0)).toBe(1);
    expect(results.reduce((n, r) => n + r.failed + r.skipped, 0)).toBe(1);
    expect(bookingCalls()).toBe(3);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, "bring.booked")))).toHaveLength(3);
  });

  it("tar maks 25 ordre per gang og avviser flere uten å bestille noe", async () => {
    await connect();
    const a = await paidOrder();
    await loginAs(editorId);
    expect(MAX_BULK_LABELS).toBe(25);

    const tooMany = [a.id, ...Array.from({ length: 25 }, () => crypto.randomUUID())];
    expect(tooMany).toHaveLength(26);
    expect(await bulkCreateLabelsAction(siteId, tooMany)).toMatchObject({ ok: false, message: "Du kan velge maks 25 ordre om gangen. Du valgte 26.", booked: 0 });
    expect(await bulkPrintLabelsAction(siteId, tooMany)).toMatchObject({ ok: false, url: null });
    expect((await etiketter(tooMany)).status).toBe(400);
    expect(bookingCalls()).toBe(0);
    expect((await orderRow(a.id)).shipping).not.toHaveProperty("bringBooking");

    // Dubletter telles én gang, og nøyaktig 25 er innenfor.
    const exactly = [a.id, ...Array.from({ length: 24 }, () => crypto.randomUUID())];
    expect(await bulkCreateLabelsAction(siteId, [...exactly, a.id])).toMatchObject({ booked: 1, skipped: 24, failed: 0 });
    expect(bookingCalls()).toBe(1);

    expect(await bulkCreateLabelsAction(siteId, [])).toMatchObject({ ok: false, message: "Velg minst én ordre." });
    expect(await bulkCreateLabelsAction(siteId, ["ikke-en-id"])).toMatchObject({ ok: false, message: expect.stringMatching(/ugyldig/) });
  });

  it("sier fra én gang når Bring ikke er koblet til, og bestiller ikke noe", async () => {
    await loginAs(ownerId);
    const o = await paidOrder({ shippingCode: "post" });
    expect(await bulkCreateLabelsAction(siteId, [o.id])).toMatchObject({ ok: false, message: expect.stringMatching(/^Bring er ikke koblet til/), booked: 0, failed: 0 });
    expect(bookingCalls()).toBe(0);
  });

  it("slår etikettene sammen til én PDF, og faller tilbake til lenker når det ikke går", async () => {
    await connect();
    const a = await paidOrder();
    const b = await paidOrder();
    const c = await paidOrder();
    const ikke = await paidOrder();
    await loginAs(editorId);
    await bulkCreateLabelsAction(siteId, [a.id, b.id, c.id]);

    // Handlingen sier hvilke som har etikett, og gir lenken. Ordren uten etikett hoppes over med forklaring.
    const print = await bulkPrintLabelsAction(siteId, [a.id, ikke.id, b.id, c.id]);
    expect(print).toMatchObject({ ok: true, count: 3, url: `/studio/nettsted/${siteId}/ordre/etiketter?ids=${a.id},${b.id},${c.id}` });
    expect(print.skipped).toEqual([{ number: ikke.number, reason: "Ingen etikett laget ennå" }]);
    expect(print.message).toBe("3 etiketter er klare til utskrift. 1 ordre hoppet over.");
    expect(await bulkPrintLabelsAction(siteId, [ikke.id])).toMatchObject({ ok: false, url: null, count: 0 });

    const callsBefore = bring.calls.length;
    const merged = await etiketter([a.id, b.id, c.id]);
    expect(merged.status).toBe(200);
    expect(merged.headers.get("content-type")).toBe("application/pdf");
    expect(merged.headers.get("cache-control")).toBe("private, no-store");
    expect(merged.headers.get("content-disposition")).toContain("fraktetiketter-samlet.pdf");
    expect(await pageCount(merged)).toBe(3);
    // Etikettene ligger i lageret, så Bring spørres ikke på nytt.
    expect(bring.calls.length).toBe(callsBefore);

    // Sammenslåing som feiler: en etikett som ikke er en gyldig PDF. Da kommer lenker til hver etikett, ikke en tom PDF.
    store.files.set(`fraktetiketter/${siteId}/${b.id}.pdf`, new TextEncoder().encode("%PDF-1.4 ødelagt"));
    const fallback = await etiketter([a.id, b.id, c.id]);
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get("content-type")).toMatch(/^text\/html/);
    expect(fallback.headers.get("cache-control")).toBe("private, no-store");
    const html = await fallback.text();
    expect(html).toContain("kunne ikke slås sammen");
    for (const o of [a, b, c]) expect(html).toContain(`/studio/nettsted/${siteId}/ordre/${o.id}/etikett`);

    // Ingen etiketter blant de valgte: 404. Ugyldige id-er avvises.
    expect((await etiketter([ikke.id])).status).toBe(404);
    expect((await etiketter(["../x"])).status).toBe(400);
    expect((await etiketter([])).status).toBe(400);
  });

  it("samme tilgang som enkelt-etiketten: ansatte kan, andre og utloggede får ikke noe", async () => {
    await connect();
    const o = await paidOrder();
    await loginAs(editorId);
    expect(await bulkCreateLabelsAction(siteId, [o.id])).toMatchObject({ booked: 1 });

    await loginAs(strangerId);
    await expect(bulkCreateLabelsAction(siteId, [o.id])).rejects.toThrow();
    await expect(bulkPrintLabelsAction(siteId, [o.id])).rejects.toThrow();
    expect((await etiketter([o.id])).status).toBe(403);
    jar.clear();
    await expect(bulkCreateLabelsAction(siteId, [o.id])).rejects.toThrow();
    expect((await etiketter([o.id])).status).toBe(403);
    expect(bookingCalls()).toBe(1);

    // Ordre fra en annen butikk kan ikke hentes gjennom en butikk man har tilgang til.
    const [org2] = await db.insert(organizations).values({ name: "Annen AS" }).returning();
    await db.insert(memberships).values({ orgId: org2.id, userId: strangerId, role: "owner" });
    const [other] = await db.insert(sites).values({ orgId: org2.id, name: "Annen", slug: "annen", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme, info: {}, shop: {} }).returning();
    await loginAs(strangerId);
    expect(await bulkPrintLabelsAction(other.id, [o.id])).toMatchObject({ ok: false, url: null });
    expect((await labelsGet(new Request("http://localhost:3000/x?ids=" + o.id), { params: Promise.resolve({ siteId: other.id }) })).status).toBe(404);
  });

  it("viser «Etikett laget» med sporingsnummer eller «Ikke booket» i ordrelista", async () => {
    await connect();
    const booked = await paidOrder();
    const unbooked = await paidOrder();
    const pickup = await paidOrder({ shippingCode: "hent", address: undefined });
    const pending = await order();
    await loginAs(editorId);
    await bulkCreateLabelsAction(siteId, [booked.id]);
    const [b, u, h, p] = await Promise.all([booked, unbooked, pickup, pending].map((o) => orderRow(o.id)));
    const consignmentNumber = readBringBooking(b.shipping)!.consignmentNumber;
    expect(labelBadge(b, true)).toEqual({ state: "booked", consignmentNumber });
    expect(labelBadge(u, true)).toEqual({ state: "none" });
    expect(labelBadge(u, false)).toBeNull();
    expect(labelBadge(h, true)).toBeNull();
    expect(labelBadge(p, true)).toBeNull();
  });
});
