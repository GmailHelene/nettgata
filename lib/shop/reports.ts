import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { orderLines, orders, productVariants, products } from "@/db/schema";
import { addDays, osloDate, parseOsloDate } from "@/lib/oslo-time";

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
    .select({ createdAt: orders.createdAt, totalOre: orders.totalOre })
    .from(orders)
    .where(and(eq(orders.siteId, siteId), gte(orders.createdAt, from), inArray(orders.status, [...salesStatuses])));

  const byDay = new Map<string, Period>();
  for (const r of rows) {
    const day = osloDate(r.createdAt);
    const p = byDay.get(day) ?? empty();
    p.ore += r.totalOre;
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
