import { and, asc, desc, eq, ilike, inArray, ne, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { orders, productCategories, productVariants, products } from "@/db/schema";
import { csvKroner, toCsv } from "@/lib/csv";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { paymentLabels, type PaymentMethod } from "./settings";
import { carrierLabel } from "./tracking";

type Query = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** «%» og «_» betyr noe i LIKE. Kunden som søker etter «50%» skal finne nettopp det. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------- Ordre ----------

export const orderFilters = {
  alle: { label: "Alle", statuses: null },
  klar: { label: "Klar til sending", statuses: ["paid"] },
  venter: { label: "Venter på betaling", statuses: ["pending_payment"] },
  sendt: { label: "Sendt", statuses: ["fulfilled"] },
  avsluttet: { label: "Kansellert og refundert", statuses: ["cancelled", "refunded"] },
} as const satisfies Record<string, { label: string; statuses: readonly (typeof orders.$inferSelect.status)[] | null }>;
export type OrderFilter = keyof typeof orderFilters;

export const ORDERS_PER_PAGE = 50;

export function parseOrderQuery(q: Query) {
  const filter = first(q.status);
  const page = Number(first(q.side));
  return {
    filter: (filter in orderFilters ? filter : "alle") as OrderFilter,
    search: first(q.q).trim().slice(0, 100),
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : 1,
  };
}

/** Søk på ordrenummer, navn, e-post eller sporingsnummer. Henter én ekstra rad for å vite om det finnes en side til. */
export async function listOrders(db: Db, siteId: string, query: ReturnType<typeof parseOrderQuery>, limit = ORDERS_PER_PAGE + 1) {
  const conditions: SQL[] = [eq(orders.siteId, siteId)];
  const statuses = orderFilters[query.filter].statuses;
  if (statuses) conditions.push(inArray(orders.status, [...statuses]));
  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    const number = /^#?(\d{1,9})$/.exec(query.search);
    conditions.push(
      or(
        ilike(orders.customerName, pattern),
        ilike(orders.customerEmail, pattern),
        ilike(orders.trackingNumber, pattern),
        ...(number ? [eq(orders.number, Number(number[1]))] : []),
      )!,
    );
  }
  return db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset((query.page - 1) * ORDERS_PER_PAGE);
}

const statusText: Record<string, string> = {
  pending_payment: "Venter på betaling",
  paid: "Betalt",
  fulfilled: "Sendt",
  cancelled: "Kansellert",
  refunded: "Refundert",
};

export function ordersCsv(rows: (typeof orders.$inferSelect)[]): string {
  return toCsv(
    [
      "Ordrenr",
      "Dato",
      "Status",
      "Kunde",
      "E-post",
      "Telefon",
      "Adresse",
      "Postnr",
      "Poststed",
      "Levering",
      "Betaling",
      "Varer (kr)",
      "Rabatt (kr)",
      "Rabattkode",
      "Frakt (kr)",
      "Totalt (kr)",
      "Herav MVA (kr)",
      "Transportør",
      "Sporingsnummer",
    ],
    rows.map((o) => [
      o.number,
      formatOsloDateTime(o.createdAt),
      statusText[o.status] ?? o.status,
      o.customerName,
      o.customerEmail,
      o.customerPhone,
      o.shippingAddress?.street,
      o.shippingAddress?.postalCode,
      o.shippingAddress?.city,
      o.shipping.name,
      paymentLabels[o.paymentMethod as PaymentMethod] ?? o.paymentMethod,
      csvKroner(o.subtotalOre),
      csvKroner(o.discountOre),
      o.discountCode,
      csvKroner(o.shippingOre),
      csvKroner(o.totalOre),
      csvKroner(o.vatOre),
      o.trackingNumber ? carrierLabel(o.trackingCarrier) : "",
      o.trackingNumber,
    ]),
  );
}

// ---------- Varer ----------

export const productStatusFilters = {
  alle: { label: "Alle", statuses: ["active", "draft"] },
  active: { label: "I butikken", statuses: ["active"] },
  draft: { label: "Kladd", statuses: ["draft"] },
  archived: { label: "Arkivert", statuses: ["archived"] },
} as const;
export type ProductStatusFilter = keyof typeof productStatusFilters;

export function parseProductQuery(q: Query) {
  const status = first(q.status);
  const category = first(q.kategori);
  return {
    status: (status in productStatusFilters ? status : "alle") as ProductStatusFilter,
    search: first(q.q).trim().slice(0, 100),
    categoryId: /^[0-9a-f-]{36}$/.test(category) ? category : "",
    lowStock: first(q.lager) === "lite",
  };
}

export type AdminProduct = Awaited<ReturnType<typeof listProductsAdmin>>[number];

/** Varer med lageroppsummering. Søket treffer både varenavn og varenummer (SKU). */
export async function listProductsAdmin(db: Db, siteId: string, query: ReturnType<typeof parseProductQuery>, lowStockAt: number) {
  const conditions: SQL[] = [eq(products.siteId, siteId), inArray(products.status, [...productStatusFilters[query.status].statuses])];
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    const bySku = db.select({ id: productVariants.productId }).from(productVariants).where(ilike(productVariants.sku, pattern));
    conditions.push(or(ilike(products.name, pattern), inArray(products.id, bySku))!);
  }
  const rows = await db
    .select({ product: products, category: productCategories.name })
    .from(products)
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(and(...conditions))
    .orderBy(asc(products.name))
    .limit(1000);
  const variants = rows.length
    ? await db
        .select()
        .from(productVariants)
        .where(inArray(productVariants.productId, rows.map((r) => r.product.id)))
        .orderBy(asc(productVariants.position))
    : [];

  return rows
    .map(({ product, category }) => {
      const vs = variants.filter((v) => v.productId === product.id);
      const tracked = vs.filter((v) => v.stock !== null);
      return {
        id: product.id,
        name: product.name,
        status: product.status,
        image: product.images[0]?.src ?? null,
        category,
        variantCount: vs.length,
        fromPriceOre: vs.length ? Math.min(...vs.map((v) => v.priceOre)) : 0,
        tracked: tracked.length > 0,
        stock: tracked.reduce((sum, v) => sum + (v.stock ?? 0), 0),
        low: tracked.some((v) => (v.stock ?? 0) <= lowStockAt),
      };
    })
    .filter((p) => !query.lowStock || p.low);
}

/** Alle varianter av varer som ikke er arkivert, for pris- og lagerredigering i én tabell. */
export async function listVariantsForGrid(db: Db, siteId: string) {
  return db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      name: products.name,
      status: products.status,
      optionValues: productVariants.optionValues,
      sku: productVariants.sku,
      priceOre: productVariants.priceOre,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(products.siteId, siteId), ne(products.status, "archived")))
    .orderBy(asc(products.name), asc(productVariants.position));
}

/** Én rad per variant. Samme kolonner leses av importen, så filen kan endres i Excel og lastes opp igjen. */
export async function productsCsv(db: Db, siteId: string): Promise<string> {
  const rows = await db
    .select({ product: products, variant: productVariants, category: productCategories.name })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
    .where(eq(products.siteId, siteId))
    .orderBy(asc(products.name), asc(productVariants.position));
  const statusLabel = { active: "I butikken", draft: "Kladd", archived: "Arkivert" } as const;
  return toCsv(
    ["Varenavn", "Adresse", "Status", "Kategori", "Valg", "Variant", "Varenummer", "Pris (kr)", "Lager", "MVA-sats", "Vekt (g)"],
    rows.map(({ product, variant, category }) => [
      product.name,
      product.slug,
      statusLabel[product.status],
      category,
      product.options.map((o) => o.name).join(" / "),
      variant.optionValues.join(" / "),
      variant.sku,
      csvKroner(variant.priceOre),
      variant.stock ?? "Følges ikke",
      product.vatRate,
      // Variantens egen vekt, ellers varens (vekt på varen kom med Bring-frakten).
      variant.weightGrams ?? product.weightGrams,
    ]),
  );
}
