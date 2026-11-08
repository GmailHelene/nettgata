import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, orders } from "@/db/schema";
import { csvKroner, toCsv } from "@/lib/csv";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { ShopError } from "./catalog";
import { salesStatuses } from "./reports";

type Query = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const CUSTOMERS_PER_PAGE = 50;

export const customerSorts = {
  siste: "Sist handlet",
  mest: "Handlet mest for",
  flest: "Flest ordre",
} as const;
export type CustomerSort = keyof typeof customerSorts;

export function parseCustomerQuery(q: Query) {
  const sort = first(q.sorter);
  const page = Number(first(q.side));
  return {
    search: first(q.q).trim().slice(0, 100),
    sort: (sort in customerSorts ? sort : "siste") as CustomerSort,
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : 1,
  };
}

// Bare ordre som er salg teller. Kansellerte og refunderte ordre vises på kunden, men gir ikke omsetning.
const counted = sql`${orders.status} in (${sql.join(
  salesStatuses.map((s) => sql`${s}`),
  sql`, `,
)})`;
const stats = {
  orderCount: sql<number>`cast(count(${orders.id}) filter (where ${counted}) as integer)`,
  spentOre: sql<number>`cast(coalesce(sum(${orders.totalOre}) filter (where ${counted}), 0) as integer)`,
  lastOrderAt: sql<Date | null>`max(${orders.createdAt}) filter (where ${counted})`,
};

export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>[number];

/** Kunder med antall ordre, hvor mye de har handlet for og når de handlet sist. */
export async function listCustomers(db: Db, siteId: string, query: ReturnType<typeof parseCustomerQuery>, limit = CUSTOMERS_PER_PAGE + 1) {
  const conditions: SQL[] = [eq(customers.siteId, siteId)];
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(customers.name, pattern), ilike(customers.email, pattern), ilike(customers.phone, pattern))!);
  }
  const order =
    query.sort === "mest"
      ? [desc(stats.spentOre), asc(customers.name)]
      : query.sort === "flest"
        ? [desc(stats.orderCount), asc(customers.name)]
        : [sql`max(${orders.createdAt}) desc nulls last`, asc(customers.name)];
  const rows = await db
    .select({ customer: customers, ...stats })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .where(and(...conditions))
    .groupBy(customers.id)
    .orderBy(...order)
    .limit(limit)
    .offset((query.page - 1) * CUSTOMERS_PER_PAGE);
  return rows.map((r) => ({
    ...r.customer,
    orderCount: Number(r.orderCount),
    spentOre: Number(r.spentOre),
    lastOrderAt: r.lastOrderAt ? new Date(r.lastOrderAt) : null,
  }));
}

export async function getCustomer(db: Db, siteId: string, customerId: string) {
  if (!/^[0-9a-f-]{36}$/.test(customerId)) return null;
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.siteId, siteId)))
    .limit(1);
  if (!customer) return null;
  const history = await db.select().from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt));
  const sales = history.filter((o) => (salesStatuses as readonly string[]).includes(o.status));
  const spentOre = sales.reduce((sum, o) => sum + o.totalOre, 0);
  return {
    customer,
    orders: history,
    orderCount: sales.length,
    spentOre,
    averageOre: sales.length ? Math.round(spentOre / sales.length) : 0,
    firstOrderAt: history.at(-1)?.createdAt ?? null,
    lastOrderAt: history[0]?.createdAt ?? null,
  };
}

export async function setCustomerNote(db: Db, siteId: string, customerId: string, note: string) {
  const updated = await db
    .update(customers)
    .set({ note: note.trim().slice(0, 2000) || null })
    .where(and(eq(customers.id, customerId), eq(customers.siteId, siteId)))
    .returning({ id: customers.id });
  if (updated.length === 0) throw new ShopError("Fant ikke kunden");
}

/** Kundelisten for flytting til et annet system. Notatet er internt og tas ikke med. */
export async function customersCsv(db: Db, siteId: string): Promise<string> {
  const rows = await listCustomers(db, siteId, { search: "", sort: "siste", page: 1 }, 100_000);
  return toCsv(
    ["Navn", "E-post", "Telefon", "Ordre", "Handlet for (kr)", "Første gang", "Sist handlet"],
    rows.map((c) => [c.name, c.email, c.phone, c.orderCount, csvKroner(c.spentOre), formatOsloDateTime(c.createdAt), c.lastOrderAt ? formatOsloDateTime(c.lastOrderAt) : ""]),
  );
}

