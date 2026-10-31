import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { discountCodes, orders, organizations, productVariants, products, sites, users } from "@/db/schema";
import { toCsv } from "@/lib/csv";
import { addDays, osloDate, osloMidnight, parseOsloDate } from "@/lib/oslo-time";
import { listOrders, ordersCsv, parseOrderQuery } from "@/lib/shop/admin";
import { bulkUpdateProducts, createProduct, updateVariants, type ProductInput } from "@/lib/shop/catalog";
import { allocateDiscount, assertUsable, discountStatus, saveDiscount, type Discount } from "@/lib/shop/discounts";
import { cartTotals, createOrder, setOrderStatus, setTracking, type CheckoutInput } from "@/lib/shop/orders";
import { lowStock, salesOverview, topProducts } from "@/lib/shop/reports";
import { readShopSettings } from "@/lib/shop/settings";
import { trackingUrl } from "@/lib/shop/tracking";

describe("norsk tid", () => {
  it("finner midnatt også på dagene med sommertidsskifte", () => {
    expect(osloMidnight(2026, 10, 25).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(osloMidnight(2026, 10, 26).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(osloMidnight(2026, 3, 29).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(osloMidnight(2026, 3, 30).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });

  it("legger et kjøp klokka 00:30 norsk tid på riktig dag", () => {
    expect(osloDate(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
    expect(osloDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("avviser datoer som ikke finnes", () => {
    expect(parseOsloDate("2026-02-31")).toBeNull();
    expect(parseOsloDate("31.12.2026")).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("CSV", () => {
  it("bruker semikolon, BOM og hindrer formler i Excel", () => {
    const csv = toCsv(["Navn", "Beløp"], [["=HYPERLINK(\"x\")", "1299,00"], ["Ola; Nordmann", 5]]);
    expect(csv.charCodeAt(0) === 0xfeff).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")";1299,00`);
    expect(csv).toContain(`"Ola; Nordmann";5`);
  });
});

describe("rabatt og MVA", () => {
  const settings = readShopSettings({ freeShippingOverOre: 50000 });
  const lines = [
    { totalOre: 30000, vatRate: 25 },
    { totalOre: 10000, vatRate: 15 },
  ];

  it("fordeler rabatten øre for øre uten å miste noe", () => {
    expect(allocateDiscount([33333, 33333, 33334], 10000)).toEqual([3333, 3333, 3334]);
    const shares = allocateDiscount([999, 1, 1], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocateDiscount([100], 0)).toEqual([0]);
  });

  it("trekker MVA av beløpet etter rabatt, fordelt på satsene", () => {
    const t = cartTotals(settings, lines, "post", { kind: "percent", value: 10 });
    expect(t).toMatchObject({ subtotalOre: 40000, discountOre: 4000, shippingOre: 9900, totalOre: 45900 });
    // Varer: 27 000 med 25 % og 9 000 med 15 %. Frakt 9 900 fordelt 3:1.
    expect(t.vatOre).toBe(5400 + 1174 + 1485 + 323);
  });

  it("gratis frakt regnes av beløpet etter rabatt, og fri-frakt-koder gir 0 i frakt", () => {
    const big = [{ totalOre: 52000, vatRate: 25 }];
    expect(cartTotals(settings, big, "post").shippingOre).toBe(0);
    expect(cartTotals(settings, big, "post", { kind: "amount", value: 5000 }).shippingOre).toBe(9900);
    expect(cartTotals(settings, lines, "post", { kind: "free_shipping", value: 0 })).toMatchObject({ discountOre: 0, shippingOre: 0 });
  });

  it("rabatt kan aldri bli større enn varene", () => {
    expect(cartTotals(settings, [{ totalOre: 3000, vatRate: 25 }], "hent", { kind: "amount", value: 10000 })).toMatchObject({ discountOre: 3000, totalOre: 0, vatOre: 0 });
  });

  it("forklarer kunden hvorfor koden ikke virker", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const base: Discount = {
      id: "x",
      siteId: "s",
      code: "HOST",
      kind: "percent",
      value: 10,
      minSubtotalOre: null,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usedCount: 0,
      active: true,
      createdAt: now,
    };
    expect(() => assertUsable(undefined, 1000, now)).toThrow("ikke gyldig");
    expect(() => assertUsable({ ...base, active: false }, 1000, now)).toThrow("ikke gyldig");
    expect(() => assertUsable({ ...base, startsAt: parseOsloDate("2026-12-01") }, 1000, now)).toThrow("gjelder fra 1. desember");
    expect(() => assertUsable({ ...base, endsAt: parseOsloDate("2026-10-31") }, 1000, now)).toThrow("utløpt");
    expect(() => assertUsable({ ...base, usageLimit: 5, usedCount: 5 }, 1000, now)).toThrow("brukt opp");
    expect(() => assertUsable({ ...base, minSubtotalOre: 50000 }, 1000, now)).toThrow("minst 500 kr");
    expect(discountStatus({ ...base, startsAt: parseOsloDate("2026-12-01") }, now)).toBe("planlagt");
  });
});

describe("admin med database", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  const settings = readShopSettings({ paymentMethods: ["ved-henting"] });

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

  const vare = (name: string, stock: number | null = 10, priceOre = 20000): ProductInput => ({
    name,
    vatRate: 25,
    status: "active",
    variants: [{ optionValues: [], priceOre, stock, sku: name.toUpperCase().slice(0, 4) }],
  });

  async function variantOf(productId: string) {
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    return v;
  }

  const checkout = (variantId: string, overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
    lines: [{ variantId, quantity: 1 }],
    name: "Kari Nordmann",
    email: "kari@test.no",
    shippingCode: "hent",
    paymentMethod: "ved-henting",
    acceptedTerms: true,
    ...overrides,
  });

  it("lagrer koden med store bokstaver og stopper duplikater", async () => {
    await saveDiscount(db, siteId, null, { code: " vinter 10 ", kind: "percent", value: 10, endDate: "2026-11-30" }, userId);
    const [d] = await db.select().from(discountCodes);
    expect(d.code).toBe("VINTER10");
    // Koden gjelder hele sluttdagen, til midnatt norsk tid.
    expect(d.endsAt?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    await expect(saveDiscount(db, siteId, null, { code: "Vinter10", kind: "amount", value: 5000 }, userId)).rejects.toThrow("finnes allerede");
    await expect(saveDiscount(db, siteId, null, { code: "AB", kind: "percent", value: 10 }, userId)).rejects.toThrow("3-30 tegn");
    await expect(saveDiscount(db, siteId, null, { code: "MYE", kind: "percent", value: 150 }, userId)).rejects.toThrow("mellom 1 og 100");
  });

  it("ordre med rabattkode lagrer rabatten og teller bruken", async () => {
    const p = await createProduct(db, siteId, vare("Genser", 10, 100000), userId);
    const v = await variantOf(p.id);
    await saveDiscount(db, siteId, null, { code: "EN-GANG", kind: "amount", value: 10000, usageLimit: 1 }, userId);

    const order = await createOrder(db, siteId, settings, checkout(v.id, { discountCode: "en-gang" }));
    expect(order).toMatchObject({ subtotalOre: 100000, discountOre: 10000, totalOre: 90000, vatOre: 18000, discountCode: "EN-GANG" });
    const [d] = await db.select().from(discountCodes);
    expect(d.usedCount).toBe(1);

    // Grensen er nådd: neste ordre stoppes, og lageret som ble trukket, legges tilbake.
    await expect(createOrder(db, siteId, settings, checkout(v.id, { discountCode: "EN-GANG" }))).rejects.toThrow("brukt opp");
    expect((await variantOf(p.id)).stock).toBe(9);
  });

  it("søker i ordre på nummer, navn og e-post, og filtrerer på status", async () => {
    const p = await createProduct(db, siteId, vare("Lue"), userId);
    const v = await variantOf(p.id);
    const a = await createOrder(db, siteId, settings, checkout(v.id));
    await createOrder(db, siteId, settings, checkout(v.id, { name: "Ola 50% Hansen", email: "ola@firma.no" }));
    await setOrderStatus(db, siteId, a.id, "paid", userId);

    const find = async (q: Record<string, string>) => (await listOrders(db, siteId, parseOrderQuery(q))).map((o) => o.number);
    expect(await find({ q: "#1001" })).toEqual([1001]);
    expect(await find({ q: "firma" })).toEqual([1002]);
    expect(await find({ q: "50%" })).toEqual([1002]);
    expect(await find({ q: "%" })).toEqual([1002]);
    expect(await find({ status: "klar" })).toEqual([1001]);
    expect(await find({ status: "tull" })).toHaveLength(2);
    expect(ordersCsv(await listOrders(db, siteId, parseOrderQuery({})))).toContain("1002;");
  });

  it("lagrer sporing og lager riktig lenke", async () => {
    const p = await createProduct(db, siteId, vare("Lue"), userId);
    const order = await createOrder(db, siteId, settings, checkout((await variantOf(p.id)).id));
    await expect(setTracking(db, siteId, order.id, { carrier: "posten", number: "<script>" }, userId)).rejects.toThrow("Sporingsnummeret");
    await setTracking(db, siteId, order.id, { carrier: "posten", number: "RR123456785NO" }, userId);
    const [saved] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(trackingUrl(saved.trackingCarrier, saved.trackingNumber)).toBe("https://sporing.posten.no/sporing/RR123456785NO");
  });

  it("oversikten teller salg per norsk dag og hopper over kansellerte ordre", async () => {
    const p = await createProduct(db, siteId, vare("Lue", null), userId);
    const v = await variantOf(p.id);
    const now = new Date("2026-10-31T12:00:00Z");
    const a = await createOrder(db, siteId, settings, checkout(v.id));
    const b = await createOrder(db, siteId, settings, checkout(v.id));
    const c = await createOrder(db, siteId, settings, checkout(v.id));
    await db.update(orders).set({ createdAt: new Date("2026-10-30T23:30:00Z") }).where(eq(orders.id, a.id)); // 31. okt. norsk tid
    await db.update(orders).set({ createdAt: new Date("2026-10-27T10:00:00Z") }).where(eq(orders.id, b.id));
    await db.update(orders).set({ createdAt: new Date("2026-10-31T08:00:00Z") }).where(eq(orders.id, c.id));
    await setOrderStatus(db, siteId, c.id, "cancelled", userId);

    const s = await salesOverview(db, siteId, now);
    expect(s.today).toEqual({ ore: 20000, orders: 1 });
    expect(s.week).toEqual({ ore: 40000, orders: 2 });
    expect(s.daily).toHaveLength(30);
    expect(s.daily.at(-1)).toMatchObject({ date: "2026-10-31", orders: 1 });
    expect(await topProducts(db, siteId, now)).toEqual([expect.objectContaining({ name: "Lue", quantity: 2, ore: 40000 })]);
  });

  it("pris og lager i bulk avviser lager som har endret seg siden siden ble åpnet", async () => {
    const p = await createProduct(db, siteId, vare("Skjerf", 5), userId);
    const v = await variantOf(p.id);
    // Noen kjøper én før endringen lagres.
    await createOrder(db, siteId, settings, checkout(v.id));
    const result = await updateVariants(db, siteId, [{ variantId: v.id, stock: 20, expectedStock: 5, priceOre: 25000 }], userId);
    expect(result.conflicts).toEqual(["Skjerf"]);
    expect(await variantOf(p.id)).toMatchObject({ stock: 4, priceOre: 25000 });
    await updateVariants(db, siteId, [{ variantId: v.id, stock: 20, expectedStock: 4 }], userId);
    expect((await variantOf(p.id)).stock).toBe(20);
    expect(await lowStock(db, siteId, 3)).toEqual([]);
  });

  it("endrer status på mange varer, men bare i egen butikk", async () => {
    const a = await createProduct(db, siteId, vare("A"), userId);
    const b = await createProduct(db, siteId, vare("B"), userId);
    expect(await bulkUpdateProducts(db, siteId, [a.id, b.id], { status: "draft" }, userId)).toBe(2);
    const [org] = await db.insert(organizations).values({ name: "Annen" }).returning();
    const [other] = await db.insert(sites).values({ orgId: org.id, name: "Annen", slug: "annen", industryPack: "nettbutikk", theme: demoTheme }).returning();
    expect(await bulkUpdateProducts(db, other.id, [a.id], { status: "archived" }, userId)).toBe(0);
    const rows = await db.select().from(products);
    expect(rows.map((r) => r.status)).toEqual(["draft", "draft"]);
  });
});
