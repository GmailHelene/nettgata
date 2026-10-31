import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { customers, orders, organizations, productCategories, productVariants, products, sites, users, variantPriceHistory } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { productsCsv } from "@/lib/shop/admin";
import { createProduct, type ProductInput } from "@/lib/shop/catalog";
import { getCustomer, listCustomers, parseCustomerQuery } from "@/lib/shop/customers";
import { saveDiscount } from "@/lib/shop/discounts";
import { applyImport, planImport } from "@/lib/shop/import";
import { createOrder, setOrderStatus, vatBreakdown, type CheckoutInput } from "@/lib/shop/orders";
import { parseReportQuery, periodReport, reportPresets } from "@/lib/shop/reports";
import { readShopSettings } from "@/lib/shop/settings";

describe("CSV inn", () => {
  it("leser semikolon og komma, sitater med linjeskift, BOM og formelvern", () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'Navn;Pris\r\n"Lue; blå";199\r\n')).toEqual([["Navn", "Pris"], ["Lue; blå", "199"]]);
    expect(parseCsv('a,b\n"linje 1\nlinje 2","sier ""hei"""\n\n')).toEqual([["a", "b"], ["linje 1\nlinje 2", 'sier "hei"']]);
    expect(parseCsv("Navn\n'=SUM(A1)\n")).toEqual([["Navn"], ["=SUM(A1)"]]);
  });
});

describe("MVA per sats", () => {
  it("fordeler frakten øre for øre, så radene summerer til varer pluss frakt", () => {
    const rows = vatBreakdown([{ totalOre: 10001, vatRate: 25 }, { totalOre: 9999, vatRate: 15 }, { totalOre: 1, vatRate: 25 }], 4999);
    expect(rows.reduce((s, r) => s + r.amountOre, 0)).toBe(10001 + 9999 + 1 + 4999);
    expect(rows.map((r) => r.rate)).toEqual([25, 15]);
  });
});

describe("perioder", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  it("kjenner måned, termin og år", () => {
    const p = Object.fromEntries(reportPresets(now).map((x) => [x.key, `${x.from}..${x.to}`]));
    expect(p).toEqual({
      maned: "2026-10-01..2026-10-31",
      "forrige-maned": "2026-09-01..2026-09-30",
      termin: "2026-09-01..2026-10-31",
      "forrige-termin": "2026-07-01..2026-08-31",
      ar: "2026-01-01..2026-10-31",
      "i-fjor": "2025-01-01..2025-12-31",
    });
    expect(reportPresets(new Date("2026-01-15T12:00:00Z")).find((x) => x.key === "forrige-termin")).toMatchObject({ from: "2025-11-01", to: "2025-12-31" });
  });
  it("avviser ugyldige og for lange perioder", () => {
    expect(parseReportQuery({ fra: "2026-10-10", til: "2026-10-01" }, now).error).toMatch(/før/);
    expect(parseReportQuery({ fra: "2024-01-01", til: "2026-01-01" }, now).error).toMatch(/ett år/);
    expect(parseReportQuery({ fra: "2026-10-01", til: "2026-10-15" }, now)).toMatchObject({ key: "egen", from: "2026-10-01", to: "2026-10-15" });
  });
});

describe("kunder, rapport og import med database", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  const settings = readShopSettings({ paymentMethods: ["ved-henting"] });

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db.insert(sites).values({ orgId: org.id, name: "Butikk", slug: "butikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
    siteId = site.id;
    userId = user.id;
  });

  const vare = (overrides: Partial<ProductInput> = {}): ProductInput => ({
    name: "Lue",
    vatRate: 25,
    status: "active",
    options: [{ name: "Farge", values: ["Blå", "Rød"] }],
    variants: [
      { optionValues: ["Blå"], priceOre: 20000, stock: 10, sku: "LUE-B" },
      { optionValues: ["Rød"], priceOre: 20000, stock: 5, sku: "LUE-R" },
    ],
    ...overrides,
  });
  const checkout = (variantId: string, overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
    lines: [{ variantId, quantity: 1 }],
    name: "Kari Nordmann",
    email: "kari@test.no",
    shippingCode: "post",
    address: { street: "Gata 1", postalCode: "3340", city: "Åmot" },
    paymentMethod: "ved-henting",
    acceptedTerms: true,
    ...overrides,
  });
  const variantsOf = (productId: string) =>
    db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(productVariants.position);

  it("samler ordre på samme e-post uansett store bokstaver, og teller ikke kansellerte som salg", async () => {
    const p = await createProduct(db, siteId, vare(), userId);
    const [blue] = await variantsOf(p.id);
    await createOrder(db, siteId, settings, checkout(blue.id));
    const second = await createOrder(db, siteId, settings, checkout(blue.id, { email: "KARI@test.no", name: "Kari N. Nordmann", phone: "900 00 000" }));
    const third = await createOrder(db, siteId, settings, checkout(blue.id));
    await setOrderStatus(db, siteId, third.id, "cancelled", userId);

    const all = await db.select().from(customers);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ email: "kari@test.no", phone: "900 00 000" });
    const [row] = await listCustomers(db, siteId, parseCustomerQuery({ q: "kari" }));
    expect(row).toMatchObject({ orderCount: 2, spentOre: 2 * (20000 + 9900) });
    const detail = await getCustomer(db, siteId, all[0].id);
    expect(detail?.orders.map((o) => o.number)).toEqual([third.number, second.number, 1001]);
    expect(await listCustomers(db, siteId, parseCustomerQuery({ q: "ola" }))).toEqual([]);
  });

  it("rapporten fordeler MVA per sats og viser ubetalte ordre for seg", async () => {
    const lue = await createProduct(db, siteId, vare(), userId);
    const mat = await createProduct(db, siteId, vare({ name: "Syltetøy", vatRate: 15, options: [], variants: [{ optionValues: [], priceOre: 10000, stock: null }] }), userId);
    const [blue] = await variantsOf(lue.id);
    const [jam] = await variantsOf(mat.id);
    await saveDiscount(db, siteId, null, { code: "TIPROSENT", kind: "percent", value: 10 }, userId);
    const a = await createOrder(db, siteId, settings, checkout(blue.id, { lines: [{ variantId: blue.id, quantity: 1 }, { variantId: jam.id, quantity: 1 }], discountCode: "TIPROSENT" }));
    const b = await createOrder(db, siteId, settings, checkout(jam.id, { shippingCode: "hent", address: null }));
    await setOrderStatus(db, siteId, a.id, "paid", userId);
    const c = await createOrder(db, siteId, settings, checkout(blue.id));
    await setOrderStatus(db, siteId, c.id, "cancelled", userId);
    for (const id of [a.id, b.id, c.id]) await db.update(orders).set({ createdAt: new Date("2026-10-15T10:00:00Z") }).where(eq(orders.id, id));

    const r = await periodReport(db, siteId, "2026-10-01", "2026-10-31");
    expect(r.orders).toBe(2);
    expect(r.totalOre).toBe(a.totalOre + b.totalOre);
    expect(r.vatOre).toBe(a.vatOre + b.vatOre);
    expect(r.vat.reduce((s, x) => s + x.grossOre, 0)).toBe(r.totalOre);
    expect(r.vat.map((x) => x.rate)).toEqual([25, 15]);
    expect(r).toMatchObject({ unpaidOrders: 1, unpaidOre: b.totalOre, discountOre: 3000 });
    expect((await periodReport(db, siteId, "2026-11-01", "2026-11-30")).orders).toBe(0);
  });

  it("eksport kan endres og importeres igjen, med prishistorikk", async () => {
    const p = await createProduct(db, siteId, vare(), userId);
    const csv = (await productsCsv(db, siteId)).replace("LUE-B;200,00;10", "LUE-B;179,00;12");
    const plan = await planImport(db, siteId, csv);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([{ name: "Lue", changes: ["Blå: pris 200 kr til 179 kr", "Blå: lager 10 til 12"] }]);
    await applyImport(db, siteId, csv, userId);
    const [blue, red] = await variantsOf(p.id);
    expect(blue).toMatchObject({ priceOre: 17900, stock: 12 });
    expect(red).toMatchObject({ priceOre: 20000, stock: 5 });
    expect(await db.select().from(variantPriceHistory).where(eq(variantPriceHistory.variantId, blue.id))).toHaveLength(2);
  });

  it("lager nye varer med valg og kategori, som kladd hvis ikke annet står", async () => {
    const csv = [
      "Varenavn;Kategori;Valg;Variant;Varenummer;Pris (kr);Lager;MVA-sats",
      "Genser;Strikk;Størrelse / Farge;S / Grå;G-S;899;3;25",
      "Genser;Strikk;Størrelse / Farge;M / Grå;G-M;899;;25",
      "Sokker;;;;;149;Følges ikke;",
    ].join("\n");
    const plan = await planImport(db, siteId, csv);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual([
      { name: "Genser", variants: 2, status: "Kladd" },
      { name: "Sokker", variants: 1, status: "Kladd" },
    ]);
    expect(plan.newCategories).toEqual(["Strikk"]);
    await applyImport(db, siteId, csv, userId);
    const [genser] = await db.select().from(products).where(eq(products.name, "Genser"));
    expect(genser.options).toEqual([
      { name: "Størrelse", values: ["S", "M"] },
      { name: "Farge", values: ["Grå"] },
    ]);
    expect((await variantsOf(genser.id)).map((v) => v.stock)).toEqual([3, null]);
    expect(await db.select().from(productCategories)).toHaveLength(1);
  });

  it("lagrer ingenting når filen har feil", async () => {
    await createProduct(db, siteId, vare(), userId);
    const csv = [
      "Varenavn;Status;Variant;Pris (kr)",
      "Lue;Utsolgt;Blå;100",
      "Lue;;Grønn;100",
      "Skjerf;;;",
      "Votter;;;ti kroner",
    ].join("\n");
    const plan = await planImport(db, siteId, csv);
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(plan.errors[0].message).toMatch(/Ukjent status/);
    expect(plan.errors[1].message).toMatch(/Fant ikke varianten «Grønn»/);
    expect(plan.errors[2].message).toMatch(/Pris mangler/);
    await expect(applyImport(db, siteId, csv, userId)).rejects.toThrow("Filen har feil");
    expect(await db.select().from(products)).toHaveLength(1);
  });
});
