import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoTheme } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { auditLog, creditNotes, orderLines, orders, organizations, sites, users } from "@/db/schema";
import { listOrders, ordersCsv, parseOrderQuery } from "@/lib/shop/admin";
import { createCreditNote, creditAmounts, creditNoteForOrder, creditNotesForOrders, needsCreditNote, retryCreditNote } from "@/lib/shop/credit-notes";
import { setOrderStatus } from "@/lib/shop/orders";
import { periodReport, reportCsv } from "@/lib/shop/reports";

let db: Db;
let siteId: string;
let userId: string;
let nextNumber = 1001;

type LineInput = { name: string; quantity: number; unitPriceOre: number; vatRate: number };

/** En ordre lagt rett i databasen, med linjer, rabatt og frakt. Totalen og MVA regnes som i kassen. */
async function order(input: { lines: LineInput[]; discountOre?: number; shippingOre?: number; createdAt?: Date; status?: "paid" | "fulfilled" | "pending_payment"; site?: string }) {
  const lines = input.lines.map((l) => ({ ...l, totalOre: l.quantity * l.unitPriceOre }));
  const subtotalOre = lines.reduce((s, l) => s + l.totalOre, 0);
  const discountOre = input.discountOre ?? 0;
  const shippingOre = input.shippingOre ?? 0;
  const vat = creditAmounts({ subtotalOre, discountOre, shippingOre, totalOre: 0 }, lines.map((l) => ({ ...l, variantLabel: null, sku: null }))).vatOre;
  const status = input.status ?? "paid";
  const createdAt = input.createdAt ?? new Date("2026-10-10T10:00:00Z");
  const [row] = await db
    .insert(orders)
    .values({
      siteId: input.site ?? siteId,
      number: nextNumber++,
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
      paidAt: status === "pending_payment" ? null : createdAt,
      accessToken: "x".repeat(48),
      createdAt,
    })
    .returning();
  await db.insert(orderLines).values(lines.map((l) => ({ orderId: row.id, name: l.name, quantity: l.quantity, unitPriceOre: l.unitPriceOre, vatRate: l.vatRate, totalOre: l.totalOre })));
  return row;
}

const mixed = { lines: [{ name: "Lue", quantity: 2, unitPriceOre: 29900, vatRate: 25 }, { name: "Honning", quantity: 3, unitPriceOre: 12900, vatRate: 15 }], discountOre: 5000, shippingOre: 9900 };

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  nextNumber = 1001;
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
  const [site] = await db.insert(sites).values({ orgId: org.id, name: "Butikk", slug: "butikk", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
  siteId = site.id;
});

describe("kreditnota", () => {
  it("lages når en betalt ordre refunderes, med negative beløp og MVA per sats", async () => {
    const o = await order(mixed);
    await setOrderStatus(db, siteId, o.id, "refunded", userId);
    const note = await creditNoteForOrder(db, siteId, o.id);
    expect(note).toMatchObject({ number: 1, reason: "refundert", totalOre: -o.totalOre, vatOre: -o.vatOre, shippingOre: -9900, discountOre: -5000, subtotalOre: -o.subtotalOre });
    expect(note!.lines.map((l) => l.totalOre).sort((a, b) => a - b)).toEqual([-59800, -38700]);
    expect(note!.vat.map((v) => v.rate)).toEqual([25, 15]);
    expect(note!.vat.reduce((s, v) => s + v.amountOre, 0)).toBe(-o.totalOre);
    expect(note!.vat.every((v) => v.vatOre < 0 && v.amountOre < 0)).toBe(true);
  });

  it("lages også ved kansellering av en betalt ordre, men ikke for en ordre som aldri ble betalt", async () => {
    const paid = await order({ ...mixed, status: "fulfilled" });
    await setOrderStatus(db, siteId, paid.id, "refunded", userId);
    expect((await creditNoteForOrder(db, siteId, paid.id))?.reason).toBe("refundert");
    const paid2 = await order(mixed);
    await setOrderStatus(db, siteId, paid2.id, "cancelled", userId);
    expect((await creditNoteForOrder(db, siteId, paid2.id))?.reason).toBe("kansellert");
    const unpaid = await order({ ...mixed, status: "pending_payment" });
    await setOrderStatus(db, siteId, unpaid.id, "cancelled", userId);
    expect(await creditNoteForOrder(db, siteId, unpaid.id)).toBeNull();
    await expect(createCreditNote(db, siteId, unpaid.id, "kansellert", userId)).rejects.toThrow(/ikke betalt/);
  });

  it("nummereres fortløpende per nettsted uten hull, også når mange lages samtidig", async () => {
    const list = [];
    for (let i = 0; i < 8; i++) list.push(await order(mixed));
    const created = await Promise.all(list.map((o) => createCreditNote(db, siteId, o.id, "refundert", userId)));
    expect(created.map((c) => c!.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Et annet nettsted har sin egen serie, som starter på 1.
    const [org] = await db.insert(organizations).values({ name: "Org 2" }).returning();
    const [other] = await db.insert(sites).values({ orgId: org.id, name: "Annen", slug: "annen", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
    const o = await order({ ...mixed, site: other.id });
    expect((await createCreditNote(db, other.id, o.id, "refundert", userId))!.number).toBe(1);
  });

  it("samme ordre får aldri to kreditnotaer, heller ikke ved dobbeltklikk", async () => {
    const o = await order(mixed);
    const [a, b, c] = await Promise.all([
      createCreditNote(db, siteId, o.id, "refundert", userId),
      createCreditNote(db, siteId, o.id, "refundert", userId),
      createCreditNote(db, siteId, o.id, "refundert", userId),
    ]);
    expect(new Set([a!.id, b!.id, c!.id]).size).toBe(1);
    expect(await db.select().from(creditNotes)).toHaveLength(1);
  });

  it("kan ikke endres etter at den er laget", async () => {
    const o = await order(mixed);
    const note = await createCreditNote(db, siteId, o.id, "refundert", userId);
    await expect(db.update(creditNotes).set({ totalOre: 0 }).where(eq(creditNotes.id, note!.id))).rejects.toThrow();
    await expect(db.execute(sql`update credit_notes set number = 99`)).rejects.toThrow();
    // Ordren kan ikke slettes mens kreditnotaen finnes.
    await expect(db.delete(orders).where(eq(orders.id, o.id))).rejects.toThrow();
    expect((await creditNoteForOrder(db, siteId, o.id))?.totalOre).toBe(-o.totalOre);
  });
});

describe("kreditnota i salgs- og MVA-rapporten", () => {
  it("salg og kreditnota i samme periode går i null, også per MVA-sats", async () => {
    const keep = await order({ lines: [{ name: "Skjerf", quantity: 1, unitPriceOre: 50000, vatRate: 25 }] });
    const o = await order(mixed);
    await setOrderStatus(db, siteId, o.id, "refunded", userId);
    const report = await periodReport(db, siteId, "2026-10-01", "2026-12-31");
    expect(report.totalOre).toBe(keep.totalOre);
    expect(report.vatOre).toBe(keep.vatOre);
    expect(report.vat.find((r) => r.rate === 15)).toMatchObject({ grossOre: 0, vatOre: 0 });
    expect(report.vat.find((r) => r.rate === 25)?.grossOre).toBe(keep.totalOre);
    expect(report.creditNotes).toBe(1);
    expect(report.creditOre).toBe(-o.totalOre);
  });

  it("kreditnotaen trekker fra i perioden den ble laget, ikke da ordren ble bestilt", async () => {
    const o = await order({ ...mixed, createdAt: new Date("2026-10-30T10:00:00Z") });
    await setOrderStatus(db, siteId, o.id, "refunded", userId);
    // Kreditnotaen er laget i november (norsk tid).
    await db.execute(sql`alter table credit_notes disable trigger credit_notes_no_update`);
    await db.update(creditNotes).set({ createdAt: new Date("2026-10-31T23:30:00Z") });
    await db.execute(sql`alter table credit_notes enable trigger credit_notes_no_update`);

    const october = await periodReport(db, siteId, "2026-10-01", "2026-10-31");
    expect(october).toMatchObject({ orders: 1, totalOre: o.totalOre, vatOre: o.vatOre, creditNotes: 0 });
    const november = await periodReport(db, siteId, "2026-11-01", "2026-11-30");
    expect(november).toMatchObject({ orders: 0, totalOre: -o.totalOre, vatOre: -o.vatOre, creditNotes: 1 });
    expect(november.payments[0]).toMatchObject({ method: "ved-henting", ore: -o.totalOre });

    const csv = reportCsv(november, (m) => m);
    expect(csv).toContain("Kreditnota;Nr. 1, 2026-11-01, til ordre 1001");
  });

  it("refunderte ordre uten kreditnota (fra før) er fortsatt ikke med", async () => {
    const o = await order(mixed);
    await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, o.id));
    const report = await periodReport(db, siteId, "2026-10-01", "2026-10-31");
    expect(report).toMatchObject({ orders: 0, totalOre: 0, creditNotes: 0 });
  });
});

describe("kreditnota som mangler", () => {
  it("«Lag kreditnota» lager den som feilet, og bare én, uansett hvor mange ganger det trykkes", async () => {
    const o = await order(mixed);
    // Som om kreditnotaen feilet: ordren er refundert, men ingen kreditnota ble laget.
    await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, o.id));
    expect(needsCreditNote({ status: "refunded", paidAt: o.paidAt })).toBe(true);
    expect(await creditNoteForOrder(db, siteId, o.id)).toBeNull();

    const [a, b] = await Promise.all([retryCreditNote(db, siteId, o.id, userId), retryCreditNote(db, siteId, o.id, userId)]);
    expect(a.id).toBe(b.id);
    expect(a).toMatchObject({ number: 1, reason: "refundert", totalOre: -o.totalOre });
    expect((await retryCreditNote(db, siteId, o.id, userId)).id).toBe(a.id);
    expect(await db.select().from(creditNotes)).toHaveLength(1);
    const actions = (await db.select().from(auditLog)).map((r) => r.action);
    expect(actions.filter((x) => x === "creditnote.created")).toHaveLength(1);
    expect(actions).toContain("creditnote.retry");
  });

  it("kansellert ordre får grunnen «kansellert», og ubetalte eller aktive ordre får ingen", async () => {
    const o = await order(mixed);
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o.id));
    expect((await retryCreditNote(db, siteId, o.id, userId)).reason).toBe("kansellert");

    const unpaid = await order({ ...mixed, status: "pending_payment" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, unpaid.id));
    await expect(retryCreditNote(db, siteId, unpaid.id, userId)).rejects.toThrow(/trenger ingen kreditnota/);
    const active = await order(mixed);
    await expect(retryCreditNote(db, siteId, active.id, userId)).rejects.toThrow(/trenger ingen kreditnota/);
    expect(needsCreditNote({ status: "paid", paidAt: new Date() })).toBe(false);
  });
});

describe("kreditnota i ordreeksporten", () => {
  it("har kolonnene Kreditnota og Kreditert dato, fylt ut bare for krediterte ordre", async () => {
    const keep = await order(mixed);
    const o = await order(mixed);
    await setOrderStatus(db, siteId, o.id, "refunded", userId);
    const note = (await creditNoteForOrder(db, siteId, o.id))!;
    const rows = await listOrders(db, siteId, parseOrderQuery({}));
    const credits = await creditNotesForOrders(db, siteId, rows.map((r) => r.id));
    expect(credits.size).toBe(1);

    const lines = ordersCsv(rows, credits).replace(/^﻿/, "").trim().split("\r\n").map((l) => l.split(";"));
    const header = lines[0];
    expect(header.slice(-2)).toEqual(["Kreditnota", "Kreditert dato"]);
    const byNumber = new Map(lines.slice(1).map((l) => [l[0], l]));
    const date = note.createdAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
    expect(byNumber.get(String(o.number))!.slice(-2)).toEqual(["1", date]);
    expect(byNumber.get(String(keep.number))!.slice(-2)).toEqual(["", ""]);
    // Uten kreditnotaer er kolonnene der, men tomme.
    expect(ordersCsv(rows).split("\r\n")[0]).toContain("Kreditnota;Kreditert dato");
  });
});
