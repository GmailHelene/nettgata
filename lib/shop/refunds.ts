import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, orderLines, orderRefunds, orders, type CreditNoteLine, type CreditNoteVat, type RefundLine } from "@/db/schema";
import { PaymentError } from "@/lib/payments/common";
import { changeOrderStatus, refundPartOfPayment } from "@/lib/payments/service";
import { ShopError } from "./catalog";
import { createPartialCreditNote, type CreditAmounts } from "./credit-notes";
import { allocateDiscount } from "./discounts";
import { release, vatBreakdown } from "./orders";
import { isOnlinePayment } from "./settings";

/**
 * Delvis refusjon, som «Refunder» i Shopify: eieren velger varer og antall, og om frakten skal refunderes.
 * Gjelder ordre som er sendt eller hentet (retur). Før det er pengene hos Vipps, Klarna og Kustom bare reservert,
 * og da er kansellering riktig vei. Gjelder valget alt som er igjen, refunderes hele ordren på vanlig måte.
 *
 * Rekkefølgen er laget så kunden aldri får pengene to ganger: raden lagres som «behandles» først, id-en er nøkkelen
 * betalingsløsningen får, og kreditnotaen lages når pengene er sendt. Feiler noe, står raden som «behandles» med
 * feilmeldingen, og «Prøv igjen» bruker samme rad og samme nøkkel.
 */

type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;
type RefundRow = typeof orderRefunds.$inferSelect;

export class RefundError extends ShopError {}

export type RefundInput = { lines: RefundLine[]; shipping: boolean; reason?: string; notifyCustomer: boolean; restock: boolean };

/** Det som er igjen å refundere: antall per linje og frakt, etter refusjonene som er ferdige. */
export function refundable(order: Pick<OrderRow, "shippingOre">, lines: Pick<LineRow, "id" | "quantity">[], done: Pick<RefundRow, "lines" | "shippingOre">[]) {
  const quantities = new Map(lines.map((l) => [l.id, l.quantity]));
  for (const r of done) for (const l of r.lines) quantities.set(l.lineId, (quantities.get(l.lineId) ?? 0) - l.quantity);
  return { quantities, shippingOre: order.shippingOre - done.reduce((s, r) => s + r.shippingOre, 0) };
}

/**
 * Beløpene på en delvis kreditnota. Hver linje får sin del av rabatten i forhold til antallet, og frakten fordeles
 * på MVA-satsene som i kassen (vatBreakdown). Fortegnet er negativt, som på kreditnotaen for hele ordren.
 */
export function partialAmounts(
  order: Pick<OrderRow, "discountOre">,
  lines: Pick<LineRow, "id" | "name" | "variantLabel" | "sku" | "quantity" | "unitPriceOre" | "vatRate" | "totalOre">[],
  selection: RefundLine[],
  shippingOre: number,
): CreditAmounts {
  const shares = allocateDiscount(lines.map((l) => l.totalOre), order.discountOre);
  const picked = selection
    .filter((s) => s.quantity > 0)
    .map((s) => {
      const i = lines.findIndex((l) => l.id === s.lineId);
      const line = lines[i];
      const gross = line.unitPriceOre * s.quantity;
      const discount = Math.round((shares[i] * s.quantity) / line.quantity);
      return { line, quantity: s.quantity, gross, discount };
    });

  // Fraktens MVA følger varene på hele ordren, ikke bare de som refunderes.
  const net = lines.map((l, i) => ({ totalOre: l.totalOre - shares[i], vatRate: l.vatRate }));
  const withShipping = vatBreakdown(net, shippingOre);
  const without = vatBreakdown(net, 0);
  const vat = new Map<number, CreditNoteVat>();
  const add = (rate: number, amountOre: number, vatOre: number) => {
    const row = vat.get(rate) ?? { rate, amountOre: 0, vatOre: 0 };
    row.amountOre -= amountOre;
    row.vatOre -= vatOre;
    vat.set(rate, row);
  };
  for (const r of withShipping) {
    const base = without.find((w) => w.rate === r.rate);
    add(r.rate, r.amountOre - (base?.amountOre ?? 0), r.vatOre - (base?.vatOre ?? 0));
  }
  for (const r of vatBreakdown(picked.map((p) => ({ totalOre: p.gross - p.discount, vatRate: p.line.vatRate })), 0)) add(r.rate, r.amountOre, r.vatOre);
  const vatRows = [...vat.values()].filter((r) => r.amountOre !== 0 || r.vatOre !== 0).sort((a, b) => b.rate - a.rate);

  const creditLines: CreditNoteLine[] = picked.map((p) => ({
    name: p.line.name,
    variantLabel: p.line.variantLabel,
    sku: p.line.sku,
    quantity: p.quantity,
    unitPriceOre: -p.line.unitPriceOre,
    vatRate: p.line.vatRate,
    totalOre: -p.gross,
    lineId: p.line.id,
    discountOre: -p.discount,
  }));
  const subtotalOre = -picked.reduce((s, p) => s + p.gross, 0);
  const discountOre = -picked.reduce((s, p) => s + p.discount, 0);
  return {
    lines: creditLines,
    vat: vatRows,
    subtotalOre,
    discountOre,
    shippingOre: -shippingOre,
    totalOre: subtotalOre - discountOre - shippingOre,
    vatOre: vatRows.reduce((s, r) => s + r.vatOre, 0),
  };
}

export async function refundsForOrder(db: Db, orderId: string): Promise<RefundRow[]> {
  return db.select().from(orderRefunds).where(eq(orderRefunds.orderId, orderId)).orderBy(asc(orderRefunds.createdAt));
}

const sameSelection = (a: RefundRow, lines: RefundLine[], shippingOre: number) =>
  a.shippingOre === shippingOre &&
  JSON.stringify([...a.lines].sort((x, y) => x.lineId.localeCompare(y.lineId))) === JSON.stringify([...lines].sort((x, y) => x.lineId.localeCompare(y.lineId)));

export type RefundResult = { message: string; refundId: string | null; full: boolean; notify: boolean };

/** Refunderer deler av en ordre. Se kommentaren øverst for rekkefølgen. */
export async function refundPart(db: Db, siteId: string, orderId: string, input: RefundInput, userId: string | null): Promise<RefundResult> {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order) throw new ShopError("Fant ikke ordren");
  if (order.status !== "fulfilled" || !order.paidAt) {
    throw new RefundError(
      order.status === "paid"
        ? "Ordren er ikke sendt ennå, så kunden er ikke belastet. Kanseller ordren, eller send den og refunder det som kommer i retur."
        : "Bare ordre som er sendt eller hentet, kan refunderes delvis.",
    );
  }
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.name), asc(orderLines.id));
  const all = await refundsForOrder(db, order.id);
  const left = refundable(order, lines, all.filter((r) => r.status === "ferdig"));

  const selection = input.lines.filter((l) => l.quantity > 0);
  for (const s of selection) {
    if (!Number.isInteger(s.quantity) || s.quantity < 0) throw new RefundError("Antallet må være et helt tall.");
    if (!left.quantities.has(s.lineId)) throw new RefundError("En av varene hører ikke til ordren.");
    if (s.quantity > left.quantities.get(s.lineId)!) throw new RefundError("Du kan ikke refundere flere enn det som er igjen av en vare.");
  }
  const shippingOre = input.shipping ? left.shippingOre : 0;
  if (selection.length === 0 && shippingOre <= 0) throw new RefundError("Velg minst én vare eller frakten.");

  // Gjelder valget alt som er igjen, er det en vanlig refusjon av hele ordren, med kreditnota for resten.
  const everything = [...left.quantities].every(([id, q]) => q <= 0 || selection.find((s) => s.lineId === id)?.quantity === q) && (left.shippingOre <= 0 || shippingOre > 0);
  if (everything && !all.some((r) => r.status === "behandles")) {
    const change = await changeOrderStatus(db, siteId, orderId, "refunded", userId);
    if (input.restock) for (const s of selection) await restockLine(db, lines, s);
    return { message: change.message, refundId: null, full: true, notify: input.notifyCustomer };
  }

  const amounts = partialAmounts(order, lines, selection, shippingOre);
  const amountOre = -amounts.totalOre;
  if (amountOre <= 0) throw new RefundError("Beløpet å refundere er null.");

  // Én refusjon behandles om gangen. Feilet en tidligere med samme valg, prøves den igjen med samme nøkkel.
  let refund = all.find((r) => r.status === "behandles");
  const retry = Boolean(refund);
  if (refund && !sameSelection(refund, selection, shippingOre)) {
    throw new RefundError("En annen refusjon på denne ordren er ikke fullført. Prøv den igjen eller avbryt den først.");
  }
  if (!refund) {
    [refund] = await db
      .insert(orderRefunds)
      .values({
        siteId,
        orderId,
        lines: selection,
        shippingOre,
        amountOre,
        reason: input.reason?.trim().slice(0, 300) || null,
        notifyCustomer: input.notifyCustomer,
        createdBy: userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!refund) throw new RefundError("En annen refusjon på denne ordren behandles akkurat nå. Last siden på nytt.");
  }

  let payment;
  try {
    payment = await refundPartOfPayment(db, siteId, orderId, refund.amountOre, refund.id, userId, { retry });
  } catch (err) {
    const message = err instanceof PaymentError || err instanceof ShopError ? err.message : "Betalingsløsningen svarte ikke.";
    await db.update(orderRefunds).set({ error: message }).where(eq(orderRefunds.id, refund.id));
    if (!(err instanceof PaymentError || err instanceof ShopError)) console.error("Delvis refusjon feilet", refund.id, err);
    throw new RefundError(`${message} Ingenting er endret på ordren. Prøv igjen.`);
  }

  const note = await createPartialCreditNote(db, siteId, order, amounts, userId);
  const completed = await db
    .update(orderRefunds)
    .set({ status: "ferdig", creditNoteId: note.id, completedAt: new Date(), error: null })
    .where(and(eq(orderRefunds.id, refund.id), eq(orderRefunds.status, "behandles")))
    .returning({ id: orderRefunds.id });
  if (completed.length) {
    await db.update(orders).set({ refundedOre: sql`${orders.refundedOre} + ${amountOre}` }).where(eq(orders.id, order.id));
    if (input.restock) for (const s of selection) await restockLine(db, lines, s);
    await db.insert(auditLog).values({
      siteId,
      userId,
      action: "order.partially_refunded",
      detail: { orderId, refundId: refund.id, amountOre, creditNoteId: note.id, restock: input.restock },
    });
  }

  const kr = (amountOre / 100).toFixed(2).replace(".", ",");
  const message = !isOnlinePayment(order.paymentMethod)
    ? `Refusjonen på ${kr} kr er registrert med kreditnota ${note.number}. Husk å betale pengene tilbake til kunden.`
    : payment.skipped
      ? `Refusjonen på ${kr} kr er registrert med kreditnota ${note.number}. Testbetalingen hadde ingen nøkler, så ingen penger ble flyttet.`
      : `Kunden får ${kr} kr tilbake. Kreditnota ${note.number} er laget.`;
  return { message, refundId: refund.id, full: false, notify: refund.notifyCustomer };
}

/** Avbryter en refusjon som ikke ble fullført. Bare når eieren har sjekket at pengene ikke gikk ut. */
export async function abandonRefund(db: Db, siteId: string, refundId: string, userId: string | null) {
  const updated = await db
    .update(orderRefunds)
    .set({ status: "feilet", completedAt: new Date() })
    .where(and(eq(orderRefunds.id, refundId), eq(orderRefunds.siteId, siteId), eq(orderRefunds.status, "behandles")))
    .returning({ orderId: orderRefunds.orderId });
  if (!updated.length) throw new RefundError("Refusjonen er allerede fullført eller avbrutt.");
  await db.insert(auditLog).values({ siteId, userId, action: "order.refund_abandoned", detail: { refundId, orderId: updated[0].orderId } });
}

async function restockLine(db: Db, lines: LineRow[], s: RefundLine) {
  const line = lines.find((l) => l.id === s.lineId);
  if (line?.variantId && s.quantity > 0) await release(db, line.variantId, s.quantity);
}
