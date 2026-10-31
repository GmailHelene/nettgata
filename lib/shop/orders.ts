import { and, eq, gte, inArray, isNull, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, orderLines, orders, productVariants, products, type ShippingAddress } from "@/db/schema";
import { ShopError } from "./catalog";
import { vatOf } from "./money";
import { availablePaymentMethods, paymentMethods, type ShopSettings } from "./settings";

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
        vatRate: row.product.vatRate,
        totalOre: row.variant.priceOre * quantity,
        stock: row.variant.stock,
      },
    ];
  });
}

export function shippingFor(settings: ShopSettings, code: string, subtotalOre: number) {
  const option = settings.shippingOptions.find((o) => o.code === code);
  if (!option) return null;
  const free = settings.freeShippingOverOre !== null && subtotalOre >= settings.freeShippingOverOre;
  return { ...option, priceOre: free ? 0 : option.priceOre };
}

/** MVA på frakt følger varene: fordeles på satsene etter hvor mye hver sats utgjør av varebeløpet. */
export function totalVat(lines: Pick<PricedLine, "totalOre" | "vatRate">[], shippingOre: number): number {
  const subtotal = lines.reduce((sum, l) => sum + l.totalOre, 0);
  const goodsVat = lines.reduce((sum, l) => sum + vatOf(l.totalOre, l.vatRate), 0);
  if (shippingOre === 0 || subtotal === 0) return goodsVat;
  const shippingVat = lines.reduce((sum, l) => sum + vatOf(Math.round((shippingOre * l.totalOre) / subtotal), l.vatRate), 0);
  return goodsVat + shippingVat;
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

async function release(db: Db, variantId: string, quantity: number) {
  await db
    .update(productVariants)
    .set({ stock: sql`${productVariants.stock} + ${quantity}` })
    .where(and(eq(productVariants.id, variantId), sql`${productVariants.stock} is not null`));
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createOrder(db: Db, siteId: string, settings: ShopSettings, input: CheckoutInput) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const data = parsed.data;

  if (!availablePaymentMethods(settings).includes(data.paymentMethod)) throw new ShopError("Betalingsmåten er ikke tilgjengelig");
  const lines = await priceLines(db, siteId, data.lines);
  if (lines.length !== new Set(data.lines.map((l) => l.variantId)).size) {
    throw new ShopError("En eller flere varer i handlekurven finnes ikke lenger. Oppdater handlekurven.");
  }
  const subtotalOre = lines.reduce((sum, l) => sum + l.totalOre, 0);
  const shipping = shippingFor(settings, data.shippingCode, subtotalOre);
  if (!shipping) throw new ShopError("Velg en leveringsmåte");

  let address: ShippingAddress | null = null;
  if (shipping.requiresAddress) {
    const a = data.address;
    if (!a || !a.street || !/^\d{4}$/.test(a.postalCode) || !a.city) throw new ShopError("Fyll inn adresse, postnummer og poststed");
    address = { name: data.name, street: a.street, postalCode: a.postalCode, city: a.city, country: "NO" };
  }

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

  try {
    const totalOre = subtotalOre + shipping.priceOre;
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
            shipping: { code: shipping.code, name: shipping.name, priceOre: shipping.priceOre },
            subtotalOre,
            shippingOre: shipping.priceOre,
            totalOre,
            vatOre: totalVat(lines, shipping.priceOre),
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

/** Endrer status etter faste regler. Kansellering legger varene tilbake på lager. */
export async function setOrderStatus(db: Db, siteId: string, orderId: string, next: OrderStatus, userId: string | null) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order) throw new ShopError("Fant ikke ordren");
  if (!transitions[order.status]?.includes(next)) throw new ShopError(`Kan ikke gå fra ${order.status} til ${next}`);

  const now = new Date();
  await db
    .update(orders)
    .set({
      status: next as typeof order.status,
      ...(next === "paid" && { paidAt: now }),
      ...(next === "fulfilled" && { fulfilledAt: now }),
      ...(next === "cancelled" && { cancelledAt: now }),
    })
    .where(eq(orders.id, order.id));
  if (next === "cancelled") {
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    for (const l of lines) if (l.variantId) await release(db, l.variantId, l.quantity);
  }
  await db.insert(auditLog).values({ siteId, userId, action: "order.status", detail: { orderId, from: order.status, to: next } });
}
