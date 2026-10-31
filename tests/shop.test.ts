import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { orderLines, organizations, productVariants, sites, users, variantPriceHistory } from "@/db/schema";
import { createProduct, listCatalog, ShopError, updateProduct, type ProductInput } from "@/lib/shop/catalog";
import { formatNok, parseNok, vatOf } from "@/lib/shop/money";
import { createOrder, setOrderStatus, totalVat, type CheckoutInput } from "@/lib/shop/orders";
import { beforePrice } from "@/lib/shop/pricing";
import { readShopSettings } from "@/lib/shop/settings";

const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.UTC(2026, 9, 31) - daysAgo * DAY);

describe("penger", () => {
  it("formaterer og leser kroner", () => {
    expect(formatNok(129900).replace(/\s/g, " ")).toBe("1 299 kr");
    expect(formatNok(12950)).toBe("129,50 kr");
    expect(parseNok("1 299,50 kr")).toBe(129950);
    expect(parseNok("abc")).toBeNull();
  });

  it("regner MVA av beløp inkludert MVA", () => {
    expect(vatOf(12500, 25)).toBe(2500);
    expect(vatOf(11500, 15)).toBe(1500);
    // 100 kr vare med 25 % og 100 kr mat med 15 %, 50 kr frakt fordelt likt.
    expect(totalVat([{ totalOre: 10000, vatRate: 25 }, { totalOre: 10000, vatRate: 15 }], 5000)).toBe(2000 + 1304 + 500 + 326);
  });
});

describe("førpris", () => {
  const now = at(0);
  it("viser laveste pris siste 30 dager før nedsettelsen", () => {
    expect(beforePrice([{ priceOre: 50000, createdAt: at(60) }, { priceOre: 40000, createdAt: at(1) }], now)).toBe(50000);
  });
  it("bruker laveste pris, også en tidligere nedsettelse i perioden", () => {
    const h = [
      { priceOre: 50000, createdAt: at(60) },
      { priceOre: 45000, createdAt: at(20) },
      { priceOre: 40000, createdAt: at(1) },
    ];
    expect(beforePrice(h, now)).toBe(45000);
  });
  it("viser ingenting ved prisøkning, første pris eller etter 30 dager", () => {
    expect(beforePrice([{ priceOre: 40000, createdAt: at(60) }, { priceOre: 50000, createdAt: at(1) }], now)).toBeNull();
    expect(beforePrice([{ priceOre: 40000, createdAt: at(1) }], now)).toBeNull();
    expect(beforePrice([{ priceOre: 50000, createdAt: at(90) }, { priceOre: 40000, createdAt: at(31) }], now)).toBeNull();
  });
});

describe("varer og ordre", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  const settings = readShopSettings({ paymentMethods: ["ved-henting", "test", "vipps"], freeShippingOverOre: 100000 });

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Butikk", slug: "butikk", industryPack: "nettbutikk", theme: demoTheme })
      .returning();
    siteId = site.id;
    userId = user.id;
  });

  const lue = (overrides: Partial<ProductInput> = {}): ProductInput => ({
    name: "Strikket lue",
    vatRate: 25,
    status: "active",
    options: [{ name: "Farge", values: ["Blå", "Rød"] }],
    variants: [
      { optionValues: ["Blå"], priceOre: 39900, stock: 3 },
      { optionValues: ["Rød"], priceOre: 39900, stock: 0 },
    ],
    ...overrides,
  });

  const checkout = (lines: CheckoutInput["lines"], overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
    lines,
    name: "Kari Test",
    email: "kari@test.no",
    shippingCode: "hent",
    paymentMethod: "ved-henting",
    acceptedTerms: true,
    ...overrides,
  });

  async function variantsOf(productId: string) {
    return db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(productVariants.position);
  }

  it("lager vare med varianter og adresse fra navnet", async () => {
    const p = await createProduct(db, siteId, lue(), userId);
    expect(p.slug).toBe("strikket-lue");
    expect((await createProduct(db, siteId, lue(), userId)).slug).toBe("strikket-lue-2");
    const [catalog] = await listCatalog(db, siteId, { slug: "strikket-lue" });
    expect(catalog.fromPriceOre).toBe(39900);
    expect(catalog.inStock).toBe(true);
  });

  it("avviser varianter som ikke stemmer med valgene", async () => {
    await expect(createProduct(db, siteId, lue({ variants: [{ optionValues: ["Grønn"], priceOre: 100, stock: 1 }] }), userId)).rejects.toThrow(/Grønn/);
    await expect(
      createProduct(db, siteId, lue({ variants: [{ optionValues: ["Blå"], priceOre: 100, stock: 1 }, { optionValues: ["Blå"], priceOre: 100, stock: 1 }] }), userId),
    ).rejects.toThrow(/to ganger/);
    await expect(createProduct(db, siteId, lue({ variants: [] }), userId)).rejects.toBeInstanceOf(ShopError);
  });

  it("logger pris bare når den endres, og viser førpris etter nedsettelse", async () => {
    const p = await createProduct(db, siteId, lue(), userId);
    const [blue, red] = await variantsOf(p.id);
    // Flytt opprettelsen 40 dager tilbake, så nedsettelsen i dag får en referansepris.
    await db.update(variantPriceHistory).set({ createdAt: new Date(Date.now() - 40 * DAY) });
    await updateProduct(db, siteId, p.id, lue({ variants: [{ id: blue.id, optionValues: ["Blå"], priceOre: 29900, stock: 3 }, { id: red.id, optionValues: ["Rød"], priceOre: 39900, stock: 0 }] }), userId);
    expect((await db.select().from(variantPriceHistory).where(eq(variantPriceHistory.variantId, blue.id))).length).toBe(2);
    expect((await db.select().from(variantPriceHistory).where(eq(variantPriceHistory.variantId, red.id))).length).toBe(1);
    const [catalog] = await listCatalog(db, siteId);
    expect(catalog.variants[0]).toMatchObject({ priceOre: 29900, beforePriceOre: 39900 });
    expect(catalog.variants[1].beforePriceOre).toBeNull();
  });

  it("ordre bruker prisen fra databasen, trekker lager og nummererer fra 1001", async () => {
    const p = await createProduct(db, siteId, lue(), userId);
    const [blue] = await variantsOf(p.id);
    const first = await createOrder(db, siteId, settings, checkout([{ variantId: blue.id, quantity: 2 }]));
    expect(first).toMatchObject({ number: 1001, subtotalOre: 79800, shippingOre: 0, totalOre: 79800, vatOre: 15960, status: "pending_payment" });
    expect((await variantsOf(p.id))[0].stock).toBe(1);
    const second = await createOrder(db, siteId, settings, checkout([{ variantId: blue.id, quantity: 1 }]));
    expect(second.number).toBe(1002);
    expect((await db.select().from(orderLines).where(eq(orderLines.orderId, first.id)))[0]).toMatchObject({ name: "Strikket lue", variantLabel: "Blå", quantity: 2 });
  });

  it("stopper ved for lite lager og legger tilbake det som allerede var trukket", async () => {
    const a = await createProduct(db, siteId, lue(), userId);
    const b = await createProduct(db, siteId, lue({ name: "Skjerf", variants: [{ optionValues: ["Blå"], priceOre: 50000, stock: 1 }] }), userId);
    const [blueLue] = await variantsOf(a.id);
    const [skjerf] = await variantsOf(b.id);
    await expect(
      createOrder(db, siteId, settings, checkout([{ variantId: blueLue.id, quantity: 2 }, { variantId: skjerf.id, quantity: 5 }])),
    ).rejects.toThrow(/bare 1 igjen av Skjerf/);
    expect((await variantsOf(a.id))[0].stock).toBe(3);
    const [, red] = await variantsOf(a.id);
    await expect(createOrder(db, siteId, settings, checkout([{ variantId: red.id, quantity: 1 }]))).rejects.toThrow(/utsolgt/);
  });

  it("krever adresse ved sending, gir gratis frakt over grensen og stenger utilgjengelig betaling", async () => {
    const p = await createProduct(db, siteId, lue({ variants: [{ optionValues: ["Blå"], priceOre: 60000, stock: null }, { optionValues: ["Rød"], priceOre: 60000, stock: null }] }), userId);
    const [v] = await variantsOf(p.id);
    await expect(createOrder(db, siteId, settings, checkout([{ variantId: v.id, quantity: 1 }], { shippingCode: "post" }))).rejects.toThrow(/adresse/);
    const order = await createOrder(
      db,
      siteId,
      settings,
      checkout([{ variantId: v.id, quantity: 2 }], { shippingCode: "post", address: { street: "Storgata 1", postalCode: "3340", city: "Åmot" } }),
    );
    expect(order.shippingOre).toBe(0);
    await expect(createOrder(db, siteId, settings, checkout([{ variantId: v.id, quantity: 1 }], { paymentMethod: "vipps" }))).rejects.toThrow(/Betalingsmåten/);
    await expect(createOrder(db, siteId, settings, checkout([{ variantId: v.id, quantity: 1 }], { acceptedTerms: false as true }))).rejects.toThrow(/kjøpsvilkårene/);
  });

  it("følger faste statusregler, og kansellering legger varene tilbake", async () => {
    const p = await createProduct(db, siteId, lue(), userId);
    const [blue] = await variantsOf(p.id);
    const order = await createOrder(db, siteId, settings, checkout([{ variantId: blue.id, quantity: 2 }]));
    await expect(setOrderStatus(db, siteId, order.id, "fulfilled", userId)).rejects.toThrow(/Kan ikke/);
    await setOrderStatus(db, siteId, order.id, "paid", userId);
    await setOrderStatus(db, siteId, order.id, "cancelled", userId);
    expect((await variantsOf(p.id))[0].stock).toBe(3);
    await expect(setOrderStatus(db, siteId, order.id, "paid", userId)).rejects.toThrow(/Kan ikke/);
  });
});
