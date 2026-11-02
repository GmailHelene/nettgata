import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, creditNotes, orderLines, orders, type CreditNoteLine, type CreditNoteVat } from "@/db/schema";
import { allocateDiscount } from "./discounts";
import { vatBreakdown } from "./orders";

/**
 * Kreditnota for nettbutikken. Lages av seg selv når en betalt ordre kanselleres eller refunderes (setOrderStatus i
 * lib/shop/orders.ts). Egen nummerserie per nettsted fra 1, uten hull: nummeret settes i samme SQL-setning som raden
 * lagres, og den unike indeksen på nettsted og nummer stopper to like nummer når to lages samtidig. Da prøves det igjen.
 *
 * Refusjon gir i dag alltid hele beløpet tilbake (lib/payments/service.ts), så kreditnotaen gjelder hele ordren.
 * Kommer delvis refusjon, må kreditnotaen få egne linjer og den unike indeksen på ordre fjernes.
 *
 * En kreditnota endres aldri (bokføringsloven). Det finnes ingen funksjon for å endre den, og databasen stopper det.
 */

export type CreditNote = typeof creditNotes.$inferSelect;
export type CreditReason = "kansellert" | "refundert";

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

export async function creditNoteForOrder(db: Db, siteId: string, orderId: string): Promise<CreditNote | null> {
  const [row] = await db
    .select()
    .from(creditNotes)
    .where(and(eq(creditNotes.siteId, siteId), eq(creditNotes.orderId, orderId)))
    .limit(1);
  return row ?? null;
}

/** Så mange ganger prøves et nytt nummer når et annet ble tatt samtidig. */
const ATTEMPTS = 8;

/**
 * Lager kreditnotaen for ordren, eller gir den som finnes. Trygg å kalle flere ganger og samtidig:
 * en ordre får aldri to kreditnotaer, og ingen nummer hoppes over.
 */
export async function createCreditNote(db: Db, siteId: string, orderId: string, reason: CreditReason, userId: string | null): Promise<CreditNote> {
  const existing = await creditNoteForOrder(db, siteId, orderId);
  if (existing) return existing;
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order) throw new CreditNoteError("Fant ikke ordren");
  if (!order.paidAt) throw new CreditNoteError("Ordren er ikke betalt, så den trenger ingen kreditnota.");
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.name), asc(orderLines.id));
  const amounts = creditAmounts(order, lines);

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Nummeret hentes i samme setning som raden lagres. Tar en annen samme nummer, stopper den unike indeksen den ene.
    const [created] = await db
      .insert(creditNotes)
      .values({
        siteId,
        orderId: order.id,
        number: sqlNextNumber(siteId),
        reason,
        ...amounts,
        paymentMethod: order.paymentMethod,
        createdBy: userId,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await db.insert(auditLog).values({ siteId, userId, action: "creditnote.created", detail: { creditNoteId: created.id, number: created.number, orderId: order.id } });
      return created;
    }
    // Enten fikk ordren kreditnota samtidig, eller så ble nummeret tatt. Det første er ferdig, det andre prøves igjen.
    const raced = await creditNoteForOrder(db, siteId, orderId);
    if (raced) return raced;
  }
  throw new CreditNoteError("Kreditnotaen kunne ikke lages akkurat nå. Prøv igjen.");
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

export const creditReasonLabel: Record<string, string> = { kansellert: "Ordren er kansellert", refundert: "Ordren er refundert" };
