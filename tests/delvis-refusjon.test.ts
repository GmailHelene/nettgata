import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoTheme } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { creditNotes, orderLines, orderRefunds, orders, organizations, products, productVariants, sites, users } from "@/db/schema";
import { creditAmounts, creditNotesForOrder, needsCreditNote, PARTIAL_REASON } from "@/lib/shop/credit-notes";
import { setOrderStatus, vatBreakdown } from "@/lib/shop/orders";
import { allocateDiscount } from "@/lib/shop/discounts";
import { partialAmounts, refundPart, RefundError } from "@/lib/shop/refunds";
import { periodReport, salesOverview } from "@/lib/shop/reports";
import { osloDate } from "@/lib/oslo-time";

let db: Db;
let siteId: string;
let userId: string;
let variantId: string;

/** Ordre med to MVA-satser, rabatt og frakt: den vanskeligste kombinasjonen for avrunding. */
async function order(status: "paid" | "fulfilled" = "fulfilled") {
  const lines = [
    { name: "Lue", quantity: 3, unitPriceOre: 29900, vatRate: 25, totalOre: 89700, variantId },
    { name: "Honning", quantity: 2, unitPriceOre: 12950, vatRate: 15, totalOre: 25900, variantId: null },
  ];
  const subtotalOre = 115600;
  const discountOre = 7333;
  const shippingOre = 9900;
  const vat = creditAmounts({ subtotalOre, discountOre, shippingOre, totalOre: 0 }, lines.map((l) => ({ ...l, variantLabel: null, sku: null }))).vatOre;
  const [row] = await db
    .insert(orders)
    .values({
      siteId,
      number: 1001,
      status,
      customerName: "Kari Kunde",
      customerEmail: "kari@test.no",
      shipping: { code: "post", name: "Posten", priceOre: shippingOre },
      shippingAddress: { name: "Kari Kunde", street: "Storgata 1", postalCode: "3340", city: "Åmot", country: "NO" },
      subtotalOre,
      discountOre,
      shippingOre,
      totalOre: subtotalOre - discountOre + shippingOre,
      vatOre: -vat,
      paymentMethod: "ved-henting",
      paidAt: new Date(),
      accessToken: "x".repeat(48),
    })
    .returning();
  await db.insert(orderLines).values(lines.map((l) => ({ orderId: row.id, ...l })));
  const saved = await db.select().from(orderLines).where(eq(orderLines.orderId, row.id)).orderBy(asc(orderLines.name), asc(orderLines.id));
  return { order: row, lue: saved.find((l) => l.name === "Lue")!, honning: saved.find((l) => l.name === "Honning")! };
}

const input = (lines: { lineId: string; quantity: number }[], shipping = false, restock = false) => ({ lines, shipping, notifyCustomer: false, restock });

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
  const [site] = await db.insert(sites).values({ orgId: org.id, name: "Butikk", slug: "butikk", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
  siteId = site.id;
  const [product] = await db.insert(products).values({ siteId, name: "Lue", slug: "lue", status: "active" }).returning();
  const [variant] = await db.insert(productVariants).values({ productId: product.id, priceOre: 29900, stock: 5 }).returning();
  variantId = variant.id;
});

describe("delvis refusjon", () => {
  it("lager delvis kreditnota med rabatten fordelt, og ordren står fortsatt som sendt", async () => {
    const { order: o, lue } = await order();
    const result = await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 1 }]), userId);
    expect(result.full).toBe(false);
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after.status).toBe("fulfilled");
    const notes = await creditNotesForOrder(db, siteId, o.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].reason).toBe(PARTIAL_REASON);
    // 299 kr minus en tredjedel av luenes del av rabatten.
    const share = allocateDiscount([89700, 25900], 7333)[0];
    expect(notes[0].totalOre).toBe(-(29900 - Math.round(share / 3)));
    expect(after.refundedOre).toBe(-notes[0].totalOre);
    expect(notes[0].lines[0]).toMatchObject({ lineId: lue.id, quantity: 1 });
  });

  it("alle kreditnotaene går nøyaktig i null mot ordren, også per MVA-sats", async () => {
    const { order: o, lue, honning } = await order();
    await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 1 }], true), userId);
    await refundPart(db, siteId, o.id, input([{ lineId: honning.id, quantity: 1 }, { lineId: lue.id, quantity: 1 }]), userId);
    await setOrderStatus(db, siteId, o.id, "refunded", userId);
    const notes = await creditNotesForOrder(db, siteId, o.id);
    expect(notes.map((n) => n.reason)).toEqual([PARTIAL_REASON, PARTIAL_REASON, "refundert"]);
    expect(notes.reduce((s, n) => s + n.totalOre, 0)).toBe(-o.totalOre);
    expect(notes.reduce((s, n) => s + n.vatOre, 0)).toBe(-o.vatOre);
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id));
    const shares = allocateDiscount(lines.map((l) => l.totalOre), o.discountOre);
    for (const r of vatBreakdown(lines.map((l, i) => ({ totalOre: l.totalOre - shares[i], vatRate: l.vatRate })), o.shippingOre)) {
      const credited = notes.flatMap((n) => n.vat).filter((v) => v.rate === r.rate);
      expect(credited.reduce((s, v) => s + v.amountOre, 0)).toBe(-r.amountOre);
      expect(credited.reduce((s, v) => s + v.vatOre, 0)).toBe(-r.vatOre);
    }
    // Den siste kreditnotaen har bare det som var igjen: én lue og én honning, og ingen frakt.
    const last = notes[2];
    expect(last.shippingOre).toBe(0);
    expect(last.lines.map((l) => l.quantity).sort()).toEqual([1, 1]);
  });

  it("velger eieren alt som er igjen, refunderes hele ordren på vanlig måte", async () => {
    const { order: o, lue, honning } = await order();
    await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 2 }]), userId);
    const result = await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 1 }, { lineId: honning.id, quantity: 2 }], true), userId);
    expect(result.full).toBe(true);
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after.status).toBe("refunded");
    const notes = await creditNotesForOrder(db, siteId, o.id);
    expect(notes.reduce((s, n) => s + n.totalOre, 0)).toBe(-o.totalOre);
  });

  it("stopper for mange, ordre som ikke er sendt og tomt valg", async () => {
    const { order: o, lue } = await order();
    await expect(refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 4 }]), userId)).rejects.toThrow(RefundError);
    await expect(refundPart(db, siteId, o.id, input([]), userId)).rejects.toThrow("Velg minst én vare");
    await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 2 }]), userId);
    await expect(refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 2 }]), userId)).rejects.toThrow("flere enn det som er igjen");

    await db.delete(orderRefunds);
    await db.delete(creditNotes);
    await db.delete(orderLines);
    await db.delete(orders);
    const unpaid = await order("paid");
    await expect(refundPart(db, siteId, unpaid.order.id, input([{ lineId: unpaid.lue.id, quantity: 1 }]), userId)).rejects.toThrow("ikke sendt ennå");
  });

  it("frakten kan bare refunderes én gang", async () => {
    const { order: o, lue } = await order();
    await refundPart(db, siteId, o.id, input([], true), userId);
    await expect(refundPart(db, siteId, o.id, input([], true), userId)).rejects.toThrow("Velg minst én vare");
    const notes = await creditNotesForOrder(db, siteId, o.id);
    expect(notes[0]).toMatchObject({ shippingOre: -9900, totalOre: -9900, subtotalOre: 0 });
    await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 1 }], true), userId);
    expect((await creditNotesForOrder(db, siteId, o.id))[1].shippingOre).toBe(0);
  });

  it("legger varene tilbake på lager når eieren velger det", async () => {
    const { order: o, lue } = await order();
    await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 2 }], false, true), userId);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.stock).toBe(7);
  });

  it("trekkes fra i salgsoversikten og i MVA-rapporten", async () => {
    const { order: o, lue } = await order();
    await refundPart(db, siteId, o.id, input([{ lineId: lue.id, quantity: 1 }]), userId);
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    const overview = await salesOverview(db, siteId);
    expect(overview.today.ore).toBe(o.totalOre - after.refundedOre);
    const today = osloDate(new Date());
    const report = await periodReport(db, siteId, today, today);
    expect(report.totalOre).toBe(o.totalOre - after.refundedOre);
    expect(report.creditNotes).toBe(1);
  });

  it("en ordre der delvise refusjoner dekket alt, trenger ingen ny kreditnota", () => {
    expect(needsCreditNote({ status: "refunded", paidAt: new Date(), refundedOre: 1000, totalOre: 1000 })).toBe(false);
    expect(needsCreditNote({ status: "refunded", paidAt: new Date(), refundedOre: 500, totalOre: 1000 })).toBe(true);
  });

  it("partialAmounts gir null for frakt alene uten MVA-avvik", () => {
    const lines = [{ id: "a", name: "A", variantLabel: null, sku: null, quantity: 1, unitPriceOre: 10000, vatRate: 25, totalOre: 10000 }];
    const amounts = partialAmounts({ discountOre: 0 }, lines, [], 5000);
    expect(amounts).toMatchObject({ totalOre: -5000, shippingOre: -5000, vatOre: -1000 });
  });
});

describe("e-post om refusjon", () => {
  it("sier hva som er refundert, beløpet og hvordan pengene kommer tilbake, uten tankestrek", async () => {
    const { refundEmail } = await import("@/lib/email/templates");
    const shop = { name: "Kari sin krok", email: "post@krok.no", phone: "", street: "", postalCode: "", city: "", orgnr: "" };
    const base = {
      number: 1042, status: "fulfilled", customerName: "Ola Nordmann", customerEmail: "ola@test.no", customerPhone: null, shippingName: "Posten",
      shippingAddress: null, subtotalOre: 0, discountOre: 0, discountCode: null, shippingOre: 0, totalOre: 0, vatOre: 0, note: null, trackingCarrier: null, trackingNumber: null,
    };
    const vipps = refundEmail({ shop, order: { ...base, paymentMethod: "vipps" }, orderUrl: "https://krok.no/ordre/x", amountOre: 34900, items: [{ name: "Lue", variantLabel: "Blå", quantity: 1 }], shipping: true, full: false, message: "Returen er mottatt." });
    expect(vipps.subject).toBe("Du får penger tilbake (ordre 1042)");
    expect(vipps.text).toContain("Hei Ola. Kari sin krok har refundert deler av ordre 1042");
    expect(vipps.text).toContain("1 × Lue (Blå)");
    expect(vipps.text).toContain("Frakt");
    expect(vipps.text).toContain("Returen er mottatt.");
    expect(vipps.text).toContain("Vipps");
    const manual = refundEmail({ shop, order: { ...base, paymentMethod: "faktura" }, orderUrl: "https://krok.no/ordre/x", amountOre: 1000, items: [], shipping: false, full: true, message: null });
    expect(manual.text).toContain("Kari sin krok betaler pengene tilbake til deg.");
    for (const t of [vipps.text, vipps.html, manual.text]) expect(t).not.toMatch(/[–—]| - /);
  });
});
