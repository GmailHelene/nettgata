import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { creditNotes, orderLines, orders, productVariants, products } from "@/db/schema";
import { csvKroner, toCsv } from "@/lib/csv";
import { addDays, osloDate, parseOsloDate } from "@/lib/oslo-time";
import { creditNotesBetween } from "./credit-notes";
import { allocateDiscount } from "./discounts";
import { vatBreakdown } from "./orders";

/** Ordre som teller som salg. Kansellerte og refunderte er ikke salg. */
export const salesStatuses = ["pending_payment", "paid", "fulfilled"] as const;

export type Period = { ore: number; orders: number };
export type DailySales = Period & { date: string };

const empty = (): Period => ({ ore: 0, orders: 0 });

/**
 * Salg i dag, siste 7 og 30 dager, og de 30 dagene før det til sammenligning.
 * Dagene følger norsk tid. Ordrene summeres her og ikke i SQL, fordi tidssonedata
 * ikke finnes i alle Postgres-utgaver vi kjører på (PGlite lokalt).
 */
export async function salesOverview(db: Db, siteId: string, now = new Date()) {
  const today = osloDate(now);
  const from = parseOsloDate(addDays(today, -59))!;
  const rows = await db
    .select({ createdAt: orders.createdAt, totalOre: orders.totalOre, refundedOre: orders.refundedOre })
    .from(orders)
    .where(and(eq(orders.siteId, siteId), gte(orders.createdAt, from), inArray(orders.status, [...salesStatuses])));

  const byDay = new Map<string, Period>();
  for (const r of rows) {
    const day = osloDate(r.createdAt);
    const p = byDay.get(day) ?? empty();
    // Delvise refusjoner trekkes fra salget på dagen ordren kom. MVA-rapporten fører dem på kreditnotaens dato.
    p.ore += r.totalOre - r.refundedOre;
    p.orders += 1;
    byDay.set(day, p);
  }
  const range = (fromOffset: number, days: number) => Array.from({ length: days }, (_, i) => addDays(today, fromOffset + i));
  const sum = (dates: string[]) =>
    dates.reduce((acc, d) => {
      const p = byDay.get(d);
      return p ? { ore: acc.ore + p.ore, orders: acc.orders + p.orders } : acc;
    }, empty());

  const month = range(-29, 30);
  return {
    today: sum([today]),
    week: sum(month.slice(-7)),
    month: sum(month),
    previousMonth: sum(range(-59, 30)),
    daily: month.map((date): DailySales => ({ date, ...(byDay.get(date) ?? empty()) })),
  };
}

/** Prosentvis endring, eller null når forrige periode var tom og sammenligningen ikke gir mening. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function topProducts(db: Db, siteId: string, now = new Date(), limit = 5) {
  const from = parseOsloDate(addDays(osloDate(now), -29))!;
  const rows = await db
    .select({
      productId: orderLines.productId,
      name: sql<string>`max(${orderLines.name})`,
      quantity: sql<number>`cast(sum(${orderLines.quantity}) as integer)`,
      ore: sql<number>`cast(sum(${orderLines.totalOre}) as integer)`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(and(eq(orders.siteId, siteId), gte(orders.createdAt, from), inArray(orders.status, [...salesStatuses])))
    .groupBy(orderLines.productId)
    .orderBy(desc(sql`sum(${orderLines.totalOre})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, quantity: Number(r.quantity), ore: Number(r.ore) }));
}

/** Varianter av aktive varer med lager under grensen, de tommeste først. */
export async function lowStock(db: Db, siteId: string, threshold: number, limit = 8) {
  return db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      name: products.name,
      optionValues: productVariants.optionValues,
      sku: productVariants.sku,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(products.siteId, siteId), eq(products.status, "active"), isNotNull(productVariants.stock), lte(productVariants.stock, threshold)))
    .orderBy(asc(productVariants.stock), asc(products.name))
    .limit(limit);
}

export async function orderCounts(db: Db, siteId: string) {
  const rows = await db.select({ status: orders.status, n: count() }).from(orders).where(eq(orders.siteId, siteId)).groupBy(orders.status);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = Number(r.n);
  return counts;
}

// ---------- Periode-rapport: salg og MVA ----------

type Query = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pad = (n: number) => String(n).padStart(2, "0");
const monthName = (m: number) => new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString("nb-NO", { timeZone: "UTC", month: "long" });

export type ReportPeriod = { key: string; label: string; from: string; to: string };

/** Faste perioder. En termin er to måneder (januar og februar er termin 1 osv.), slik MVA-meldingen vanligvis deles. */
export function reportPresets(now = new Date()): ReportPeriod[] {
  const today = osloDate(now);
  const [y, m] = today.split("-").map(Number);
  const start = (yy: number, mm: number) => `${yy}-${pad(mm)}-01`;
  const end = (yy: number, mm: number) => addDays(mm === 12 ? start(yy + 1, 1) : start(yy, mm + 1), -1);
  const [pm, py] = m === 1 ? [12, y - 1] : [m - 1, y];
  const termStart = m % 2 === 0 ? m - 1 : m;
  const [ptStart, pty] = termStart === 1 ? [11, y - 1] : [termStart - 2, y];
  return [
    { key: "maned", label: "Denne måneden", from: start(y, m), to: today },
    { key: "forrige-maned", label: `Forrige måned (${monthName(pm)})`, from: start(py, pm), to: end(py, pm) },
    { key: "termin", label: `Denne terminen (${monthName(termStart)} og ${monthName(termStart + 1)})`, from: start(y, termStart), to: today },
    { key: "forrige-termin", label: `Forrige termin (${monthName(ptStart)} og ${monthName(ptStart + 1)})`, from: start(pty, ptStart), to: end(pty, ptStart + 1) },
    { key: "ar", label: `I år (${y})`, from: `${y}-01-01`, to: today },
    { key: "i-fjor", label: `I fjor (${y - 1})`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ];
}

/** Egen periode med ?fra= og ?til= (begge dager tas med), ellers en fast periode, ellers denne måneden. */
export function parseReportQuery(q: Query, now = new Date()): ReportPeriod & { error?: string } {
  const presets = reportPresets(now);
  const from = first(q.fra);
  const to = first(q.til);
  if (from || to) {
    const start = parseOsloDate(from);
    const stop = parseOsloDate(to);
    if (!start || !stop) return { ...presets[0], error: "Ugyldig dato. Viser denne måneden." };
    if (stop < start) return { ...presets[0], error: "Til-datoen er før fra-datoen. Viser denne måneden." };
    if (stop.getTime() - start.getTime() > 400 * 86_400_000) return { ...presets[0], error: "Velg en periode på maks ett år. Viser denne måneden." };
    return { key: "egen", label: `${from} til ${to}`, from, to };
  }
  return presets.find((p) => p.key === first(q.periode)) ?? presets[0];
}

export type PeriodReport = Awaited<ReturnType<typeof periodReport>>;

/**
 * Salg og MVA for ordre bestilt i perioden. Ordre som venter på betaling er med og vises for seg.
 * MVA per sats regnes fra ordrelinjene med rabatt og frakt fordelt likt som i kassen.
 *
 * En betalt ordre som senere er kansellert eller refundert, er salg i perioden den ble bestilt, og kreditnotaen
 * trekker det fra i perioden kreditnotaen ble laget. Ordre som er kansellert uten kreditnota (aldri betalt, eller
 * refundert før kreditnotaer fantes), er ikke med, som før.
 */
export async function periodReport(db: Db, siteId: string, from: string, to: string) {
  const start = parseOsloDate(from)!;
  const end = parseOsloDate(addDays(to, 1))!;
  const credited = db.select({ orderId: creditNotes.orderId }).from(creditNotes).where(eq(creditNotes.siteId, siteId));
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.siteId, siteId),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
        or(inArray(orders.status, [...salesStatuses]), inArray(orders.id, credited)),
      ),
    )
    .orderBy(asc(orders.createdAt));
  const lines = rows.length ? await db.select().from(orderLines).where(inArray(orderLines.orderId, rows.map((o) => o.id))) : [];
  const linesByOrder = new Map<string, (typeof lines)[number][]>();
  for (const l of lines) linesByOrder.set(l.orderId, [...(linesByOrder.get(l.orderId) ?? []), l]);

  const vat = new Map<number, { rate: number; grossOre: number; vatOre: number }>();
  const payments = new Map<string, { method: string; orders: number; ore: number }>();
  const months = new Map<string, { month: string; orders: number; ore: number }>();
  const sum = { orders: 0, totalOre: 0, subtotalOre: 0, discountOre: 0, shippingOre: 0, unpaidOrders: 0, unpaidOre: 0 };

  for (const o of rows) {
    const ls = linesByOrder.get(o.id) ?? [];
    const shares = allocateDiscount(ls.map((l) => l.totalOre), o.discountOre);
    const breakdown = vatBreakdown(ls.map((l, i) => ({ totalOre: l.totalOre - shares[i], vatRate: l.vatRate })), o.shippingOre);
    for (const r of breakdown) {
      const row = vat.get(r.rate) ?? { rate: r.rate, grossOre: 0, vatOre: 0 };
      row.grossOre += r.amountOre;
      row.vatOre += r.vatOre;
      vat.set(r.rate, row);
    }
    const pay = payments.get(o.paymentMethod) ?? { method: o.paymentMethod, orders: 0, ore: 0 };
    pay.orders++;
    pay.ore += o.totalOre;
    payments.set(o.paymentMethod, pay);
    const month = osloDate(o.createdAt).slice(0, 7);
    const mo = months.get(month) ?? { month, orders: 0, ore: 0 };
    mo.orders++;
    mo.ore += o.totalOre;
    months.set(month, mo);

    sum.orders++;
    sum.totalOre += o.totalOre;
    sum.subtotalOre += o.subtotalOre;
    sum.discountOre += o.discountOre;
    sum.shippingOre += o.shippingOre;
    if (o.status === "pending_payment") {
      sum.unpaidOrders++;
      sum.unpaidOre += o.totalOre;
    }
  }

  // Kreditnotaer laget i perioden trekkes fra, med MVA per sats slik den sto på ordren.
  const credits = await creditNotesBetween(db, siteId, start, end);
  const sumCredits = { creditNotes: credits.length, creditOre: 0 };
  for (const { note } of credits) {
    for (const r of note.vat) {
      const row = vat.get(r.rate) ?? { rate: r.rate, grossOre: 0, vatOre: 0 };
      row.grossOre += r.amountOre;
      row.vatOre += r.vatOre;
      vat.set(r.rate, row);
    }
    const pay = payments.get(note.paymentMethod) ?? { method: note.paymentMethod, orders: 0, ore: 0 };
    pay.ore += note.totalOre;
    payments.set(note.paymentMethod, pay);
    const month = osloDate(note.createdAt).slice(0, 7);
    const mo = months.get(month) ?? { month, orders: 0, ore: 0 };
    mo.ore += note.totalOre;
    months.set(month, mo);
    sum.totalOre += note.totalOre;
    sum.subtotalOre += note.subtotalOre;
    sum.discountOre += note.discountOre;
    sum.shippingOre += note.shippingOre;
    sumCredits.creditOre += note.totalOre;
  }

  const vatRows = [...vat.values()].sort((a, b) => b.rate - a.rate).map((r) => ({ ...r, netOre: r.grossOre - r.vatOre }));
  const vatOre = vatRows.reduce((s, r) => s + r.vatOre, 0);
  return {
    from,
    to,
    ...sum,
    ...sumCredits,
    credits: credits.map(({ note, orderNumber }) => ({
      id: note.id,
      orderId: note.orderId,
      number: note.number,
      orderNumber,
      date: osloDate(note.createdAt),
      totalOre: note.totalOre,
      vatOre: note.vatOre,
    })),
    vatOre,
    netOre: sum.totalOre - vatOre,
    vat: vatRows,
    payments: [...payments.values()].sort((a, b) => b.ore - a.ore),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function reportCsv(report: PeriodReport, paymentLabel: (method: string) => string): string {
  return toCsv(
    ["Del", "Navn", "Ordre", "Eks. MVA (kr)", "MVA (kr)", "Inkl. MVA (kr)"],
    [
      ...report.vat.map((r) => ["MVA-sats", `${r.rate} %`, "", csvKroner(r.netOre), csvKroner(r.vatOre), csvKroner(r.grossOre)]),
      ["Totalt", `${report.from} til ${report.to}`, report.orders, csvKroner(report.netOre), csvKroner(report.vatOre), csvKroner(report.totalOre)],
      ...report.payments.map((p) => ["Betalingsmåte", paymentLabel(p.method), p.orders, "", "", csvKroner(p.ore)]),
      ["Herav ikke betalt", "", report.unpaidOrders, "", "", csvKroner(report.unpaidOre)],
      ...report.credits.map((c) => [
        "Kreditnota",
        `Nr. ${c.number}, ${c.date}, til ordre ${c.orderNumber}`,
        "",
        csvKroner(c.totalOre - c.vatOre),
        csvKroner(c.vatOre),
        csvKroner(c.totalOre),
      ]),
    ],
  );
}
