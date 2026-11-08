import { and, eq, gte, inArray, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, customers, orderLines, orders, productVariants, products, sites, type ShippingAddress, type ShippingChoice } from "@/db/schema";
import type { OrderBring } from "@/lib/bring/booking";
import { findPickupPoints } from "@/lib/bring/pickup";
import { quoteBring } from "@/lib/bring/quote";
import { cartWeight } from "@/lib/bring/weight";
import { readSiteInfo } from "@/lib/site-info";
import { ShopError } from "./catalog";
import { allocateDiscount, assertUsable, claimDiscount, discountAmount, findDiscount, releaseDiscount, type Discount } from "./discounts";
import { formatNok, vatOf } from "./money";
import { availablePaymentMethods, checkoutShippingOptions, isOnlinePayment, paymentMethods, type CheckoutShippingOption, type ShopSettings } from "./settings";
import { createCreditNote } from "./credit-notes";
import { trackingSchema } from "./tracking";

export const MAX_QUANTITY = 99;

export const checkoutSchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .min(1, "Handlekurven er tom")
    .max(50),
  name: z.string().trim().min(1, "Skriv navnet ditt").max(100),
  email: z.string().trim().max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Sjekk e-postadressen"),
  phone: z.string().trim().max(30).default(""),
  shippingCode: z.string().max(30),
  address: z
    .object({
      street: z.string().trim().max(120),
      postalCode: z.string().trim().max(4),
      city: z.string().trim().max(60),
    })
    .nullable()
    .default(null),
  paymentMethod: z.enum(paymentMethods),
  acceptedTerms: z.literal(true, { error: "Du må godta kjøpsvilkårene" }),
  note: z.string().trim().max(1000).default(""),
  discountCode: z.string().trim().max(40).default(""),
  /**
   * Fraktprisen kassen viste kunden. Brukes aldri som pris: serveren regner ut frakten selv. Er den en annen,
   * stoppes bestillingen, så kunden aldri betaler en annen frakt enn den som sto på knappen.
   */
  seenShippingOre: z.number().int().min(0).max(10_000_000).optional(),
  /**
   * Hentestedet kunden valgte for Pakke til hentested. Serveren slår det opp hos Bring for postnummeret og bruker det
   * bare hvis det finnes i listen. Ellers ignoreres det, og pakken går til nærmeste hentested.
   */
  pickupPointId: z.string().trim().max(40).optional(),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

export type PricedLine = {
  variantId: string;
  productId: string;
  name: string;
  variantLabel: string;
  sku: string | null;
  quantity: number;
  unitPriceOre: number;
  vatRate: number;
  totalOre: number;
  stock: number | null;
  /** Vekt per stykk i gram: variantens egen, ellers varens. Null når vekten mangler. */
  weightGrams: number | null;
};

/**
 * Henter gjeldende pris og lager for handlekurven. Prisene kommer alltid fra databasen,
 * aldri fra nettleseren. Varer som er slettet eller ikke lenger aktive, faller ut.
 */
export async function priceLines(db: Db, siteId: string, lines: { variantId: string; quantity: number }[]): Promise<PricedLine[]> {
  const ids = [...new Set(lines.map((l) => l.variantId))];
  if (ids.length === 0) return [];
  const rows = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(inArray(productVariants.id, ids), eq(products.siteId, siteId), eq(products.status, "active")));
  const byId = new Map(rows.map((r) => [r.variant.id, r]));
  // En butikk som ikke er MVA-registrert, kan ikke ta MVA. Her settes det for alle veier inn til kassen og ordren.
  const [site] = await db.select({ info: sites.info }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const chargesVat = readSiteInfo(site?.info).mvaRegistrert;
  // Samme variant flere ganger i kurven slås sammen.
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.variantId, Math.min(MAX_QUANTITY, (merged.get(l.variantId) ?? 0) + l.quantity));

  return [...merged.entries()].flatMap(([variantId, quantity]) => {
    const row = byId.get(variantId);
    if (!row) return [];
    return [
      {
        variantId,
        productId: row.product.id,
        name: row.product.name,
        variantLabel: row.variant.optionValues.join(" / "),
        sku: row.variant.sku,
        quantity,
        unitPriceOre: row.variant.priceOre,
        vatRate: chargesVat ? row.product.vatRate : 0,
        totalOre: row.variant.priceOre * quantity,
        stock: row.variant.stock,
        weightGrams: row.variant.weightGrams ?? row.product.weightGrams ?? null,
      },
    ];
  });
}

/** Frakten er gratis med en rabattkode for fri frakt, eller når varebeløpet etter rabatt er over butikkens grense. */
export function freeShippingApplies(settings: ShopSettings, goodsOre: number, freeShipping = false): boolean {
  return freeShipping || (settings.freeShippingOverOre !== null && goodsOre >= settings.freeShippingOverOre);
}

/**
 * Grensen for gratis frakt gjelder varebeløpet etter rabatt, som hos Shopify, også for Bring.
 * priceOre er prisen serveren har regnet ut for et Bring-valg. Uten den brukes valgets faste pris (reserveprisen for Bring).
 */
export function shippingFor(settings: ShopSettings, code: string, goodsOre: number, freeShipping = false, priceOre?: number) {
  const option = checkoutShippingOptions(settings).find((o) => o.code === code);
  if (!option) return null;
  return { ...option, priceOre: freeShippingApplies(settings, goodsOre, freeShipping) ? 0 : (priceOre ?? option.priceOre) };
}

export type VatRow = { rate: number; amountOre: number; vatOre: number };

/**
 * Beløp og MVA per sats. Frakt følger varene: den fordeles på satsene etter hvor mye hver sats
 * utgjør av varebeløpet, øre for øre, så summen av radene alltid er varer pluss frakt.
 * Samme utregning brukes i kassen, på ordren og i MVA-rapporten.
 */
export function vatBreakdown(lines: Pick<PricedLine, "totalOre" | "vatRate">[], shippingOre: number): VatRow[] {
  const shipping = allocateDiscount(lines.map((l) => l.totalOre), shippingOre);
  const rows = new Map<number, VatRow>();
  lines.forEach((l, i) => {
    const row = rows.get(l.vatRate) ?? { rate: l.vatRate, amountOre: 0, vatOre: 0 };
    row.amountOre += l.totalOre + shipping[i];
    row.vatOre += vatOf(l.totalOre, l.vatRate) + vatOf(shipping[i], l.vatRate);
    rows.set(l.vatRate, row);
  });
  return [...rows.values()].sort((a, b) => b.rate - a.rate);
}

export function totalVat(lines: Pick<PricedLine, "totalOre" | "vatRate">[], shippingOre: number): number {
  return vatBreakdown(lines, shippingOre).reduce((sum, r) => sum + r.vatOre, 0);
}

export type CartTotals = ReturnType<typeof cartTotals>;

/**
 * Én utregning for handlekurv, kasse og ordre, så tallene kunden ser alltid er tallene som lagres.
 * shippingPriceOre er Bring-prisen serveren har hentet for det valgte fraktvalget.
 */
export function cartTotals(
  settings: ShopSettings,
  lines: Pick<PricedLine, "totalOre" | "vatRate">[],
  shippingCode: string,
  discount: Pick<Discount, "kind" | "value"> | null = null,
  shippingPriceOre?: number,
) {
  const subtotalOre = lines.reduce((sum, l) => sum + l.totalOre, 0);
  const discountOre = discount ? discountAmount(discount, subtotalOre) : 0;
  const goodsOre = subtotalOre - discountOre;
  const shipping = shippingFor(settings, shippingCode, goodsOre, discount?.kind === "free_shipping", shippingPriceOre);
  const shippingOre = shipping?.priceOre ?? 0;
  const shares = allocateDiscount(lines.map((l) => l.totalOre), discountOre);
  const vatOre = totalVat(lines.map((l, i) => ({ totalOre: l.totalOre - shares[i], vatRate: l.vatRate })), shippingOre);
  return { subtotalOre, discountOre, shipping, shippingOre, totalOre: goodsOre + shippingOre, vatOre };
}

/** Trekker lager for én variant bare hvis det er nok igjen. Atomisk i én SQL-setning. */
async function reserve(db: Db, variantId: string, quantity: number): Promise<boolean> {
  const updated = await db
    .update(productVariants)
    .set({ stock: sql`${productVariants.stock} - ${quantity}` })
    .where(and(eq(productVariants.id, variantId), or(isNull(productVariants.stock), gte(productVariants.stock, quantity))))
    .returning({ id: productVariants.id });
  return updated.length === 1;
}

export async function release(db: Db, variantId: string, quantity: number) {
  await db
    .update(productVariants)
    .set({ stock: sql`${productVariants.stock} + ${quantity}` })
    .where(and(eq(productVariants.id, variantId), sql`${productVariants.stock} is not null`));
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bring-valgene pakken kan sendes med (ikke for tung), slik Bring skal spørres om dem. Kassen og ordren spør likt,
 * så ordren kan bruke svaret kassen fikk, og kunden betaler prisen som ble vist.
 */
export function bringQuoteOptions(settings: ShopSettings, weightGrams: number | null) {
  return checkoutShippingOptions(settings).flatMap((o) =>
    o.bring && (weightGrams === null || weightGrams <= o.bring.maxWeightGrams) ? [{ code: o.code, product: o.bring.product, fallbackOre: o.priceOre }] : [],
  );
}

/**
 * Fraktprisen for et Bring-valg, regnet ut på serveren når ordren lages: handlekurvens vekt og kundens postnummer.
 * Gjelder butikkens regel om gratis frakt, spørres ikke Bring. Svarer ikke Bring, eller mangler vekten, brukes reserveprisen.
 */
async function bringPriceForOrder(
  db: Db,
  siteId: string,
  settings: ShopSettings,
  option: CheckoutShippingOption,
  lines: PricedLine[],
  discount: Discount | null,
  address: ShippingAddress | null,
  pickupPointId?: string,
): Promise<{ priceOre: number | undefined; bring: OrderBring | null }> {
  if (!option.bring || !address) return { priceOre: undefined, bring: null };
  const weightGrams = cartWeight(lines);
  if (weightGrams !== null && weightGrams > option.bring.maxWeightGrams) {
    throw new ShopError(`Pakken er for tung for ${option.name}. Velg en annen leveringsmåte.`);
  }
  const subtotalOre = lines.reduce((sum, l) => sum + l.totalOre, 0);
  const goodsOre = subtotalOre - (discount ? discountAmount(discount, subtotalOre) : 0);
  const chosen =
    pickupPointId && option.bring.product === "5800" ? (await findPickupPoints(db, siteId, address.postalCode)).find((p) => p.id === pickupPointId) : undefined;
  const base = {
    product: option.bring.product,
    weightGrams,
    toPostalCode: address.postalCode,
    ...(chosen && { pickupPoint: { id: chosen.id, name: chosen.name, address: chosen.address, postalCode: chosen.postalCode, city: chosen.city } }),
  };
  if (freeShippingApplies(settings, goodsOre, discount?.kind === "free_shipping")) {
    return { priceOre: 0, bring: { ...base, price: "gratis", reason: null } };
  }
  const quotes = await quoteBring(db, siteId, bringQuoteOptions(settings, weightGrams), weightGrams, address.postalCode);
  const quote = quotes[option.code] ?? { priceOre: option.priceOre, source: "reserve" as const, reason: "bring" as const };
  return { priceOre: quote.priceOre, bring: { ...base, price: quote.source, reason: quote.reason } };
}

/**
 * Lagrer ordren og holder av varene. Ordre med Vipps eller Klarna lages bare av kassen som også starter betalingen
 * (startsPayment), ellers ville ordren aldri blitt betalt, og kunden ville fått bekreftelse på en ordre som kanselleres.
 */
export async function createOrder(db: Db, siteId: string, settings: ShopSettings, input: CheckoutInput, opts: { startsPayment?: boolean } = {}) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const data = parsed.data;

  if (!availablePaymentMethods(settings).includes(data.paymentMethod)) throw new ShopError("Betalingsmåten er ikke tilgjengelig");
  if (isOnlinePayment(data.paymentMethod) && !opts.startsPayment) throw new ShopError("Last siden på nytt og prøv igjen.");
  const lines = await priceLines(db, siteId, data.lines);
  if (lines.length !== new Set(data.lines.map((l) => l.variantId)).size) {
    throw new ShopError("En eller flere varer i handlekurven finnes ikke lenger. Oppdater handlekurven.");
  }
  let discount: Discount | null = null;
  if (data.discountCode) {
    const found = await findDiscount(db, siteId, data.discountCode);
    assertUsable(found, lines.reduce((sum, l) => sum + l.totalOre, 0), new Date());
    discount = found;
  }
  const option = checkoutShippingOptions(settings).find((o) => o.code === data.shippingCode);
  if (!option) throw new ShopError("Velg en leveringsmåte");

  let address: ShippingAddress | null = null;
  if (option.requiresAddress) {
    const a = data.address;
    if (!a || !a.street || !a.city) throw new ShopError("Fyll inn adresse, postnummer og poststed");
    if (!/^\d{4}$/.test(a.postalCode)) throw new ShopError("Postnummeret må ha fire siffer");
    address = { name: data.name, street: a.street, postalCode: a.postalCode, city: a.city, country: "NO" };
  }

  // Frakten regnes ut og låses her. En pris fra nettleseren brukes aldri.
  const bringPrice = await bringPriceForOrder(db, siteId, settings, option, lines, discount, address, data.pickupPointId);
  const totals = cartTotals(settings, lines, option.code, discount, bringPrice.priceOre);
  const shipping = totals.shipping;
  if (!shipping) throw new ShopError("Velg en leveringsmåte");
  if (data.seenShippingOre !== undefined && data.seenShippingOre !== totals.shippingOre) {
    throw new ShopError(
      `${totals.shippingOre === 0 ? "Frakten er nå gratis." : `Fraktprisen er nå ${formatNok(totals.shippingOre)}.`} Sjekk totalen og trykk Bestill på nytt.`,
    );
  }
  const shippingChoice: ShippingChoice & { bring?: OrderBring } = {
    code: shipping.code,
    name: shipping.name,
    priceOre: shipping.priceOre,
    ...(bringPrice.bring && { bring: bringPrice.bring }),
  };

  // Trekk lager linje for linje. Går én linje tom, legges det som allerede er trukket tilbake.
  const reserved: PricedLine[] = [];
  for (const line of lines) {
    if (!(await reserve(db, line.variantId, line.quantity))) {
      for (const r of reserved) await release(db, r.variantId, r.quantity);
      const left = line.stock ?? 0;
      throw new ShopError(
        left > 0 ? `Det er bare ${left} igjen av ${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ""}` : `${line.name} er utsolgt`,
      );
    }
    reserved.push(line);
  }
  if (discount && !(await claimDiscount(db, discount.id))) {
    for (const r of reserved) await release(db, r.variantId, r.quantity);
    throw new ShopError("Rabattkoden er brukt opp");
  }

  try {
    let order: typeof orders.$inferSelect | undefined;
    // Ordrenummer er fortløpende per nettsted. Unik indeks stopper dobbeltnummer; da prøver vi igjen.
    for (let attempt = 0; attempt < 3 && !order; attempt++) {
      const [{ last }] = await db.select({ last: max(orders.number) }).from(orders).where(eq(orders.siteId, siteId));
      try {
        [order] = await db
          .insert(orders)
          .values({
            siteId,
            number: (last ?? 1000) + 1,
            customerName: data.name,
            customerEmail: data.email,
            customerPhone: data.phone || null,
            shippingAddress: address,
            shipping: shippingChoice,
            subtotalOre: totals.subtotalOre,
            discountCode: discount?.code ?? null,
            discountOre: totals.discountOre,
            shippingOre: totals.shippingOre,
            totalOre: totals.totalOre,
            vatOre: totals.vatOre,
            paymentMethod: data.paymentMethod,
            note: data.note || null,
            accessToken: randomToken(),
          })
          .returning();
      } catch (err) {
        if (attempt === 2) throw err;
      }
    }
    if (!order) throw new ShopError("Kunne ikke lagre ordren");

    // Kunden opprettes ved første kjøp og får nytt navn og telefon ved neste.
    const [customer] = await db
      .insert(customers)
      .values({ siteId, email: data.email.toLowerCase(), name: data.name, phone: data.phone || null })
      .onConflictDoUpdate({
        target: [customers.siteId, customers.email],
        set: { name: sql`excluded.name`, phone: sql`coalesce(excluded.phone, ${customers.phone})` },
      })
      .returning({ id: customers.id });
    await db.update(orders).set({ customerId: customer.id }).where(eq(orders.id, order.id));
    order.customerId = customer.id;

    await db.insert(orderLines).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        variantId: l.variantId,
        name: l.name,
        variantLabel: l.variantLabel || null,
        sku: l.sku,
        quantity: l.quantity,
        unitPriceOre: l.unitPriceOre,
        vatRate: l.vatRate,
        totalOre: l.totalOre,
      })),
    );
    await db.insert(auditLog).values({ siteId, action: "order.created", detail: { orderId: order.id, number: order.number } });
    return order;
  } catch (err) {
    for (const r of reserved) await release(db, r.variantId, r.quantity);
    if (discount) await releaseDiscount(db, discount.id);
    throw err;
  }
}

const transitions: Record<string, string[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["fulfilled", "cancelled", "refunded"],
  fulfilled: ["refunded"],
  cancelled: [],
  refunded: [],
};

export type OrderStatus = keyof typeof transitions;

/** Om statusen kan endres fra den ene til den andre etter de faste reglene. */
export function canTransition(from: string, to: string): boolean {
  return transitions[from]?.includes(to) ?? false;
}

async function releaseLines(db: Db, orderId: string) {
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  for (const l of lines) if (l.variantId) await release(db, l.variantId, l.quantity);
}

/**
 * Endrer status etter faste regler. Kansellering legger varene tilbake på lager.
 * Oppdateringen gjelder bare hvis statusen fortsatt er den vi leste, så to samtidige endringer aldri begge går gjennom
 * (for eksempel to klikk på «Kanseller», som ellers ville lagt varene tilbake to ganger).
 */
export async function setOrderStatus(db: Db, siteId: string, orderId: string, next: OrderStatus, userId: string | null) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order) throw new ShopError("Fant ikke ordren");
  if (!canTransition(order.status, next)) throw new ShopError(`Kan ikke gå fra ${order.status} til ${next}`);

  const now = new Date();
  const updated = await db
    .update(orders)
    .set({
      status: next as typeof order.status,
      ...(next === "paid" && { paidAt: now }),
      ...(next === "fulfilled" && { fulfilledAt: now }),
      ...(next === "cancelled" && { cancelledAt: now }),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning({ id: orders.id });
  if (updated.length === 0) throw new ShopError("Ordren ble endret samtidig av noe annet. Last siden på nytt og prøv igjen.");
  if (next === "cancelled") await releaseLines(db, order.id);
  await db.insert(auditLog).values({ siteId, userId, action: "order.status", detail: { orderId, from: order.status, to: next } });
  // En betalt ordre som kanselleres eller refunderes, får kreditnota (bokføringsloven). Feiler det, står ordren likevel
  // med ny status, og feilen logges. createCreditNote er trygg å kalle igjen.
  if ((order.status === "paid" || order.status === "fulfilled") && (next === "cancelled" || next === "refunded")) {
    try {
      await createCreditNote(db, siteId, order.id, next === "cancelled" ? "kansellert" : "refundert", userId);
    } catch (err) {
      console.error("Kreditnota feilet", order.id, err);
    }
  }
}

/**
 * Merker en ordre som betalt etter at Vipps eller Klarna har bekreftet betalingen og beløpet stemmer.
 * Gjelder bare ordre som fortsatt venter på betaling, i én SQL-setning. Kommer kunden tilbake og bakgrunnsjobben
 * sjekker samtidig, blir ordren bare betalt én gang, og bare den som rakk det, får true (og sender ordrebekreftelsen).
 */
export async function markOrderPaid(
  db: Db,
  siteId: string,
  orderId: string,
  payment: { provider: string; environment: string; reference: string; amountOre: number },
): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.siteId, siteId), eq(orders.status, "pending_payment")))
    .returning({ id: orders.id });
  if (updated.length === 0) return false;
  await db.insert(auditLog).values([
    { siteId, action: "order.status", detail: { orderId, from: "pending_payment", to: "paid" } },
    { siteId, action: "payment.paid", detail: { orderId, ...payment } },
  ]);
  return true;
}

/**
 * Kansellerer en ordre som aldri ble betalt: kunden avbrøt hos Vipps eller Klarna, betalingen gikk ut på tid,
 * eller butikken avbrøt den. Varene legges tilbake på lager, og rabattkoden kan brukes igjen,
 * så kunden kan prøve på nytt med samme kode. Gjelder bare ordre som fortsatt venter på betaling.
 */
export async function cancelUnpaidOrder(db: Db, siteId: string, orderId: string, detail: Record<string, unknown>, userId: string | null = null): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.siteId, siteId), eq(orders.status, "pending_payment")))
    .returning({ discountCode: orders.discountCode });
  if (updated.length === 0) return false;
  await releaseLines(db, orderId);
  const code = updated[0].discountCode;
  if (code) {
    const discount = await findDiscount(db, siteId, code);
    if (discount) await releaseDiscount(db, discount.id);
  }
  await db.insert(auditLog).values([
    { siteId, userId, action: "order.status", detail: { orderId, from: "pending_payment", to: "cancelled" } },
    { siteId, userId, action: "payment.cancelled", detail: { orderId, ...detail } },
  ]);
  return true;
}

/**
 * Knytter ordren til betalingen hos Vipps eller Klarna. Med expected byttes referansen bare hvis den fortsatt er
 * den vi leste og ordren venter på betaling, så to prosesser aldri skriver over hverandre.
 */
export async function setPaymentRef(db: Db, orderId: string, ref: string, expected?: string): Promise<boolean> {
  const conditions = [eq(orders.id, orderId), eq(orders.status, "pending_payment")];
  if (expected !== undefined) conditions.push(eq(orders.paymentRef, expected));
  const updated = await db
    .update(orders)
    .set({ paymentRef: ref })
    .where(and(...conditions))
    .returning({ id: orders.id });
  return updated.length === 1;
}

/** Lagrer sporingsnummer. Tomt nummer fjerner sporingen. */
export async function setTracking(db: Db, siteId: string, orderId: string, input: { carrier: string; number: string }, userId: string) {
  let values: { trackingCarrier: string | null; trackingNumber: string | null } = { trackingCarrier: null, trackingNumber: null };
  if (input.number.trim()) {
    const parsed = trackingSchema.safeParse(input);
    if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
    values = { trackingCarrier: parsed.data.carrier, trackingNumber: parsed.data.number };
  }
  const updated = await db
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, orderId), eq(orders.siteId, siteId)))
    .returning({ id: orders.id });
  if (updated.length === 0) throw new ShopError("Fant ikke ordren");
  await db.insert(auditLog).values({ siteId, userId, action: "order.tracking", detail: { orderId, ...values } });
}

export async function setStaffNote(db: Db, siteId: string, orderId: string, note: string) {
  const text = note.trim().slice(0, 2000);
  const updated = await db
    .update(orders)
    .set({ staffNote: text || null })
    .where(and(eq(orders.id, orderId), eq(orders.siteId, siteId)))
    .returning({ id: orders.id });
  if (updated.length === 0) throw new ShopError("Fant ikke ordren");
}
