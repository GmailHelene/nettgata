import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, creditNotes, orderLines, orders, type CreditNoteLine, type CreditNoteVat } from "@/db/schema";
import { allocateDiscount } from "./discounts";
import { vatBreakdown } from "./orders";

/**
 * Kreditnota for nettbutikken. Lages av seg selv når en betalt ordre kanselleres eller refunderes (setOrderStatus i
 * lib/shop/orders.ts). Egen nummerserie per nettsted fra 1, uten hull: nummeret settes i samme SQL-setning som raden
 * lagres, og den unike indeksen på nettsted og nummer stopper to like nummer når to lages samtidig. Da prøves det igjen.
 *
 * Delvis refusjon (lib/shop/refunds.ts) gir én kreditnota per refusjon, med reason «delvis-refundert» og bare
 * linjene og frakten som ble refundert. Kanselleres eller refunderes resten senere, krediterer den siste
 * kreditnotaen bare det som er igjen, så summen av alle kreditnotaene alltid er nøyaktig ordren.
 *
 * En kreditnota endres aldri (bokføringsloven). Det finnes ingen funksjon for å endre den, og databasen stopper det.
 */

export type CreditNote = typeof creditNotes.$inferSelect;
export type CreditReason = "kansellert" | "refundert";
export const PARTIAL_REASON = "delvis-refundert";

export type CreditAmounts = ReturnType<typeof creditAmounts>;

export class CreditNoteError extends Error {}

type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;

/**
 * Beløpene på kreditnotaen: ordren med motsatt fortegn. MVA per sats regnes på samme måte som i salgsrapporten
 * (rabatten fordeles på linjene, frakten på satsene), så salg og kreditnota går nøyaktig i null.
 */
export function creditAmounts(order: Pick<OrderRow, "subtotalOre" | "discountOre" | "shippingOre" | "totalOre">, lines: Pick<LineRow, "name" | "variantLabel" | "sku" | "quantity" | "unitPriceOre" | "vatRate" | "totalOre">[]) {
  const shares = allocateDiscount(lines.map((l) => l.totalOre), order.discountOre);
  const breakdown = vatBreakdown(lines.map((l, i) => ({ totalOre: l.totalOre - shares[i], vatRate: l.vatRate })), order.shippingOre);
  const vat: CreditNoteVat[] = breakdown.map((r) => ({ rate: r.rate, amountOre: -r.amountOre, vatOre: -r.vatOre }));
  const creditLines: CreditNoteLine[] = lines.map((l) => ({
    name: l.name,
    variantLabel: l.variantLabel,
    sku: l.sku,
    quantity: l.quantity,
    unitPriceOre: -l.unitPriceOre,
    vatRate: l.vatRate,
    totalOre: -l.totalOre,
  }));
  return {
    lines: creditLines,
    vat,
    subtotalOre: -order.subtotalOre,
    discountOre: -order.discountOre,
    shippingOre: -order.shippingOre,
    totalOre: -order.totalOre,
    vatOre: vat.reduce((sum, r) => sum + r.vatOre, 0),
  };
}

/**
 * Det som er igjen å kreditere når ordren kanselleres eller refunderes etter én eller flere delvise refusjoner:
 * hele ordren minus de delvise kreditnotaene, linje for linje og sats for sats. Ingen ny avrunding, så summen går i null.
 */
export function remainingAmounts(full: CreditAmounts, partials: Pick<CreditNote, "lines" | "vat" | "subtotalOre" | "discountOre" | "shippingOre" | "totalOre" | "vatOre">[], lineIds: string[]): CreditAmounts {
  if (partials.length === 0) return full;
  const lines: CreditNoteLine[] = [];
  full.lines.forEach((line, i) => {
    const done = partials.flatMap((p) => p.lines).filter((l) => l.lineId === lineIds[i]);
    const quantity = line.quantity - done.reduce((s, l) => s + l.quantity, 0);
    const totalOre = line.totalOre - done.reduce((s, l) => s + l.totalOre, 0);
    if (quantity > 0 || totalOre !== 0) lines.push({ ...line, quantity, totalOre });
  });
  const vat = full.vat
    .map((r) => {
      const done = partials.flatMap((p) => p.vat).filter((v) => v.rate === r.rate);
      return { rate: r.rate, amountOre: r.amountOre - done.reduce((s, v) => s + v.amountOre, 0), vatOre: r.vatOre - done.reduce((s, v) => s + v.vatOre, 0) };
    })
    .filter((r) => r.amountOre !== 0 || r.vatOre !== 0);
  const sum = (key: "subtotalOre" | "discountOre" | "shippingOre" | "totalOre" | "vatOre") => full[key] - partials.reduce((s, p) => s + p[key], 0);
  return { lines, vat, subtotalOre: sum("subtotalOre"), discountOre: sum("discountOre"), shippingOre: sum("shippingOre"), totalOre: sum("totalOre"), vatOre: sum("vatOre") };
}

/** Kreditnotaen for resten av ordren (kansellert eller refundert). Delvise kreditnotaer hentes med creditNotesForOrder. */
export async function creditNoteForOrder(db: Db, siteId: string, orderId: string): Promise<CreditNote | null> {
  const [row] = await db
    .select()
    .from(creditNotes)
    .where(and(eq(creditNotes.siteId, siteId), eq(creditNotes.orderId, orderId), ne(creditNotes.reason, PARTIAL_REASON)))
    .limit(1);
  return row ?? null;
}

/** Alle kreditnotaene til ordren, delvise og den siste, i nummerrekkefølge. */
export async function creditNotesForOrder(db: Db, siteId: string, orderId: string): Promise<CreditNote[]> {
  return db
    .select()
    .from(creditNotes)
    .where(and(eq(creditNotes.siteId, siteId), eq(creditNotes.orderId, orderId)))
    .orderBy(asc(creditNotes.number));
}

/**
 * Lagrer en kreditnota med neste nummer i serien. Tar en annen samme nummer samtidig, prøves det igjen.
 * Gir null hvis raden ikke ble lagret av en annen grunn (en kreditnota for resten av ordren fantes allerede).
 */
async function insertNote(db: Db, siteId: string, values: Omit<typeof creditNotes.$inferInsert, "siteId" | "number">, retry: () => Promise<CreditNote | null>) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Nummeret hentes i samme setning som raden lagres. Tar en annen samme nummer, stopper den unike indeksen den ene.
    const [created] = await db
      .insert(creditNotes)
      .values({ ...values, siteId, number: sqlNextNumber(siteId) })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await db.insert(auditLog).values({ siteId, userId: values.createdBy ?? null, action: "creditnote.created", detail: { creditNoteId: created.id, number: created.number, orderId: values.orderId } });
      return created;
    }
    const raced = await retry();
    if (raced) return raced;
  }
  throw new CreditNoteError("Kreditnotaen kunne ikke lages akkurat nå. Prøv igjen.");
}

/** Kreditnota for én delvis refusjon. Beløpene er regnet ut i lib/shop/refunds.ts. */
export async function createPartialCreditNote(db: Db, siteId: string, order: Pick<OrderRow, "id" | "paymentMethod">, amounts: CreditAmounts, userId: string | null): Promise<CreditNote> {
  const note = await insertNote(db, siteId, { orderId: order.id, reason: PARTIAL_REASON, ...amounts, paymentMethod: order.paymentMethod, createdBy: userId }, async () => null);
  return note!;
}

/** Så mange ganger prøves et nytt nummer når et annet ble tatt samtidig. */
const ATTEMPTS = 8;

/**
 * Lager kreditnotaen for resten av ordren, eller gir den som finnes. Trygg å kalle flere ganger og samtidig:
 * en ordre får aldri to slike, og ingen nummer hoppes over. Gir null når delvise refusjoner alt har kreditert alt.
 */
export async function createCreditNote(db: Db, siteId: string, orderId: string, reason: CreditReason, userId: string | null): Promise<CreditNote | null> {
  const existing = await creditNoteForOrder(db, siteId, orderId);
  if (existing) return existing;
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order) throw new CreditNoteError("Fant ikke ordren");
  if (!order.paidAt) throw new CreditNoteError("Ordren er ikke betalt, så den trenger ingen kreditnota.");
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.name), asc(orderLines.id));
  const partials = (await creditNotesForOrder(db, siteId, orderId)).filter((n) => n.reason === PARTIAL_REASON);
  const amounts = remainingAmounts(creditAmounts(order, lines), partials, lines.map((l) => l.id));
  if (amounts.totalOre === 0 && amounts.vatOre === 0) return null;
  // Enten fikk ordren kreditnota samtidig, eller så ble nummeret tatt. Det første er ferdig, det andre prøves igjen.
  return insertNote(db, siteId, { orderId: order.id, reason, ...amounts, paymentMethod: order.paymentMethod, createdBy: userId }, () =>
    creditNoteForOrder(db, siteId, orderId),
  );
}

/** En ordre som ble betalt og så kansellert eller refundert, skal ha kreditnota, med mindre delvise refusjoner dekket alt. */
export function needsCreditNote(order: Pick<OrderRow, "status" | "paidAt"> & Partial<Pick<OrderRow, "refundedOre" | "totalOre">>): boolean {
  const coveredByPartials = order.totalOre !== undefined && (order.refundedOre ?? 0) >= order.totalOre;
  return Boolean(order.paidAt) && (order.status === "cancelled" || order.status === "refunded") && !coveredByPartials;
}

/**
 * «Lag kreditnota» på ordresiden, for når den ikke ble laget sammen med statusendringen (setOrderStatus logger feilen
 * og går videre). Trygg å trykke flere ganger: finnes kreditnotaen alt, gis den som er, og ingen ny lages.
 */
export async function retryCreditNote(db: Db, siteId: string, orderId: string, userId: string | null): Promise<CreditNote> {
  const [order] = await db
    .select({ status: orders.status, paidAt: orders.paidAt, refundedOre: orders.refundedOre, totalOre: orders.totalOre })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.siteId, siteId)))
    .limit(1);
  if (!order) throw new CreditNoteError("Fant ikke ordren");
  if (!needsCreditNote(order)) throw new CreditNoteError("Ordren trenger ingen kreditnota. Bare betalte ordre som er kansellert eller refundert, får det.");
  const existing = await creditNoteForOrder(db, siteId, orderId);
  if (existing) return existing;
  const note = await createCreditNote(db, siteId, orderId, order.status === "cancelled" ? "kansellert" : "refundert", userId);
  if (!note) throw new CreditNoteError("De delvise kreditnotaene dekker alt, så ordren trenger ingen ny kreditnota.");
  await db.insert(auditLog).values({ siteId, userId, action: "creditnote.retry", detail: { orderId, creditNoteId: note.id, number: note.number } });
  return note;
}

/**
 * Kreditnota per ordre, for ordreeksporten. Bare de ordrene som er med, så eksporten ikke henter mer enn den trenger.
 * Har ordren flere (delvise), gjelder den siste.
 */
export async function creditNotesForOrders(db: Db, siteId: string, orderIds: string[]): Promise<Map<string, Pick<CreditNote, "number" | "createdAt">>> {
  const result = new Map<string, Pick<CreditNote, "number" | "createdAt">>();
  // Store eksporter deles opp, så antall parametre i spørringen holder seg langt under grensen i Postgres.
  for (let i = 0; i < orderIds.length; i += 5000) {
    const rows = await db
      .select({ orderId: creditNotes.orderId, number: creditNotes.number, createdAt: creditNotes.createdAt })
      .from(creditNotes)
      .where(and(eq(creditNotes.siteId, siteId), inArray(creditNotes.orderId, orderIds.slice(i, i + 5000))))
      .orderBy(asc(creditNotes.number));
    for (const r of rows) result.set(r.orderId, { number: r.number, createdAt: r.createdAt });
  }
  return result;
}

/** Neste nummer i nettstedets serie, regnet ut inne i INSERT-setningen. */
function sqlNextNumber(siteId: string) {
  return sql<number>`(select coalesce(max(${creditNotes.number}), 0) + 1 from ${creditNotes} where ${creditNotes.siteId} = ${siteId})`;
}

/** Kreditnotaer laget i perioden (norsk tid, til og med siste dag), med ordrenummeret de gjelder. */
export async function creditNotesBetween(db: Db, siteId: string, start: Date, end: Date) {
  return db
    .select({ note: creditNotes, orderNumber: orders.number, orderCreatedAt: orders.createdAt })
    .from(creditNotes)
    .innerJoin(orders, eq(creditNotes.orderId, orders.id))
    .where(and(eq(creditNotes.siteId, siteId), gte(creditNotes.createdAt, start), lt(creditNotes.createdAt, end)))
    .orderBy(asc(creditNotes.number));
}

export const creditReasonLabel: Record<string, string> = {
  kansellert: "Ordren er kansellert",
  refundert: "Ordren er refundert",
  [PARTIAL_REASON]: "Deler av ordren er refundert",
};
