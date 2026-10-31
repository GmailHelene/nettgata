import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, productCategories, productVariants, products, variantPriceHistory, type ProductImage } from "@/db/schema";
import { imageFocusSchema } from "@/lib/content/fields";
import { mediaSrcPattern } from "@/lib/media-types";
import { vatRates } from "./money";
import { beforePrice } from "./pricing";

export class ShopError extends Error {}

/** «Strikket lue, blå» blir «strikket-lue-bla». */
export function productSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const imageSchema = z
  .object({
    src: z.string().regex(mediaSrcPattern),
    alt: z.string().trim().max(200),
    decorative: z.boolean().optional(),
    focus: imageFocusSchema.optional(),
  })
  .refine((v) => v.decorative || v.alt !== "", "Alle produktbilder trenger en kort beskrivelse (alt-tekst)");

const optionSchema = z.object({
  name: z.string().trim().min(1, "Valget må ha et navn, f.eks. Størrelse").max(40),
  values: z.array(z.string().trim().min(1).max(40)).min(1, "Valget må ha minst én verdi").max(30),
});

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  optionValues: z.array(z.string().trim().max(40)).max(3),
  sku: z.string().trim().max(60).optional().default(""),
  priceOre: z.number().int().min(0, "Prisen kan ikke være negativ").max(100_000_000),
  stock: z.number().int().min(0).nullable(),
  weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(1, "Varen må ha et navn").max(120),
    slug: z.string().trim().max(60).optional().default(""),
    description: z.string().max(10_000).default(""),
    images: z.array(imageSchema).max(20).default([]),
    options: z.array(optionSchema).max(3, "Maks tre valg per vare").default([]),
    vatRate: z.number().refine((v) => (vatRates as readonly number[]).includes(v), "Ugyldig MVA-sats"),
    status: z.enum(["draft", "active", "archived"]),
    categoryId: z.string().uuid().nullable().default(null),
    variants: z.array(variantSchema).min(1, "Varen må ha minst én variant").max(100),
  })
  .superRefine((p, ctx) => {
    const names = new Set<string>();
    for (const o of p.options) {
      if (names.has(o.name.toLowerCase())) ctx.addIssue({ code: "custom", message: `Valget «${o.name}» finnes to ganger` });
      names.add(o.name.toLowerCase());
    }
    const combos = new Set<string>();
    for (const v of p.variants) {
      if (v.optionValues.length !== p.options.length) {
        ctx.addIssue({ code: "custom", message: "Hver variant må ha én verdi for hvert valg" });
        continue;
      }
      v.optionValues.forEach((value, i) => {
        if (!p.options[i].values.includes(value)) ctx.addIssue({ code: "custom", message: `«${value}» er ikke en verdi i ${p.options[i].name}` });
      });
      const key = v.optionValues.join(" / ");
      if (combos.has(key)) ctx.addIssue({ code: "custom", message: `Varianten ${key || "uten valg"} finnes to ganger` });
      combos.add(key);
    }
  });
export type ProductInput = z.input<typeof productInputSchema>;

async function uniqueSlug(db: Db, siteId: string, wanted: string, exceptId?: string) {
  const base = productSlug(wanted) || "vare";
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const conditions = [eq(products.siteId, siteId), eq(products.slug, slug)];
    if (exceptId) conditions.push(ne(products.id, exceptId));
    const [taken] = await db.select({ id: products.id }).from(products).where(and(...conditions)).limit(1);
    if (!taken) return slug;
  }
  throw new ShopError("Fant ingen ledig adresse for varen");
}

function parse(input: ProductInput) {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  return parsed.data;
}

async function assertCategory(db: Db, siteId: string, categoryId: string | null) {
  if (!categoryId) return;
  const [cat] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.id, categoryId), eq(productCategories.siteId, siteId)))
    .limit(1);
  if (!cat) throw new ShopError("Ukjent kategori");
}

/** Lagrer varianter og prishistorikk. Prisen logges bare når den faktisk endres. */
async function saveVariants(db: Db, productId: string, variants: ReturnType<typeof parse>["variants"]) {
  const existing = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
  const byId = new Map(existing.map((v) => [v.id, v]));
  const keep = new Set<string>();

  for (const [position, v] of variants.entries()) {
    const values = { optionValues: v.optionValues, sku: v.sku || null, priceOre: v.priceOre, stock: v.stock, weightGrams: v.weightGrams ?? null, position };
    const current = v.id ? byId.get(v.id) : undefined;
    if (current) {
      keep.add(current.id);
      await db.update(productVariants).set(values).where(eq(productVariants.id, current.id));
      if (current.priceOre !== v.priceOre) await db.insert(variantPriceHistory).values({ variantId: current.id, priceOre: v.priceOre });
    } else {
      const [created] = await db.insert(productVariants).values({ productId, ...values }).returning({ id: productVariants.id });
      keep.add(created.id);
      await db.insert(variantPriceHistory).values({ variantId: created.id, priceOre: v.priceOre });
    }
  }
  const removed = existing.filter((v) => !keep.has(v.id)).map((v) => v.id);
  // Ordrelinjer beholder navn og pris som øyeblikksbilde, så sletting av varianter rører ikke gamle ordre.
  if (removed.length) await db.delete(productVariants).where(inArray(productVariants.id, removed));
}

export async function createProduct(db: Db, siteId: string, input: ProductInput, userId: string) {
  const data = parse(input);
  await assertCategory(db, siteId, data.categoryId);
  const slug = await uniqueSlug(db, siteId, data.slug || data.name);
  const [product] = await db
    .insert(products)
    .values({
      siteId,
      name: data.name,
      slug,
      description: data.description,
      images: data.images,
      options: data.options,
      vatRate: data.vatRate,
      status: data.status,
      categoryId: data.categoryId,
    })
    .returning();
  await saveVariants(db, product.id, data.variants);
  await db.insert(auditLog).values({ siteId, userId, action: "product.created", detail: { productId: product.id } });
  return product;
}

export async function updateProduct(db: Db, siteId: string, productId: string, input: ProductInput, userId: string) {
  const data = parse(input);
  const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.siteId, siteId))).limit(1);
  if (!product) throw new ShopError("Fant ikke varen");
  await assertCategory(db, siteId, data.categoryId);
  const slug = data.slug && data.slug !== product.slug ? await uniqueSlug(db, siteId, data.slug, product.id) : product.slug;
  await db
    .update(products)
    .set({
      name: data.name,
      slug,
      description: data.description,
      images: data.images,
      options: data.options,
      vatRate: data.vatRate,
      status: data.status,
      categoryId: data.categoryId,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));
  await saveVariants(db, product.id, data.variants);
  await db.insert(auditLog).values({ siteId, userId, action: "product.updated", detail: { productId } });
}

export type CatalogVariant = {
  id: string;
  optionValues: string[];
  label: string;
  priceOre: number;
  beforePriceOre: number | null;
  stock: number | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  images: ProductImage[];
  options: { name: string; values: string[] }[];
  vatRate: number;
  categoryId: string | null;
  variants: CatalogVariant[];
  fromPriceOre: number;
  inStock: boolean;
  createdAt: string;
};

/** Aktive varer med varianter, priser og førpris, klare for nettstedet. */
export async function listCatalog(db: Db, siteId: string, opts: { categoryId?: string; slug?: string; ids?: string[] } = {}) {
  const conditions = [eq(products.siteId, siteId), eq(products.status, "active")];
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.slug) conditions.push(eq(products.slug, opts.slug));
  if (opts.ids?.length) conditions.push(inArray(products.id, opts.ids));
  const rows = await db.select().from(products).where(and(...conditions)).orderBy(asc(products.sortOrder), asc(products.name));
  if (rows.length === 0) return [];

  const variants = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, rows.map((r) => r.id)))
    .orderBy(asc(productVariants.position));
  const history = variants.length
    ? await db.select().from(variantPriceHistory).where(inArray(variantPriceHistory.variantId, variants.map((v) => v.id)))
    : [];

  const now = new Date();
  return rows
    .map((p): CatalogProduct | null => {
      const vs = variants
        .filter((v) => v.productId === p.id)
        .map((v) => ({
          id: v.id,
          optionValues: v.optionValues,
          label: v.optionValues.join(" / "),
          priceOre: v.priceOre,
          beforePriceOre: beforePrice(history.filter((h) => h.variantId === v.id), now),
          stock: v.stock,
        }));
      if (vs.length === 0) return null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        images: p.images,
        options: p.options,
        vatRate: p.vatRate,
        categoryId: p.categoryId,
        variants: vs,
        fromPriceOre: Math.min(...vs.map((v) => v.priceOre)),
        inStock: vs.some((v) => v.stock === null || v.stock > 0),
        createdAt: p.createdAt.toISOString(),
      };
    })
    .filter((p): p is CatalogProduct => p !== null);
}

export const variantChangeSchema = z.object({
  variantId: z.string().uuid(),
  priceOre: z.number().int().min(0, "Prisen kan ikke være negativ").max(100_000_000).optional(),
  stock: z.number().int().min(0, "Lager kan ikke være negativt").max(10_000_000).nullable().optional(),
  /** Lageret slik det var da siden ble åpnet. Har noen kjøpt i mellomtiden, avvises lagerendringen. */
  expectedStock: z.number().int().nullable().optional(),
});
export type VariantChange = z.input<typeof variantChangeSchema>;

/**
 * Lagrer mange pris- og lagerendringer på én gang. Lager settes bare hvis det fortsatt er det
 * samme som da siden ble åpnet, ellers ville et salg i mellomtiden blitt skrevet over.
 */
export async function updateVariants(db: Db, siteId: string, changes: VariantChange[], userId: string) {
  const parsed = z.array(variantChangeSchema).max(1000).safeParse(changes);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  if (parsed.data.length === 0) return { updated: 0, conflicts: [] as string[] };

  const rows = await db
    .select({ variant: productVariants, name: products.name })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(inArray(productVariants.id, parsed.data.map((c) => c.variantId)), eq(products.siteId, siteId)));
  const byId = new Map(rows.map((r) => [r.variant.id, r]));

  let updated = 0;
  const conflicts: string[] = [];
  for (const change of parsed.data) {
    const row = byId.get(change.variantId);
    if (!row) throw new ShopError("Fant ikke varianten");
    const label = row.variant.optionValues.length ? `${row.name} (${row.variant.optionValues.join(" / ")})` : row.name;
    let changed = false;
    if (change.stock !== undefined) {
      const guard =
        change.expectedStock === undefined ? sql`true` : sql`${productVariants.stock} is not distinct from ${change.expectedStock}`;
      const res = await db
        .update(productVariants)
        .set({ stock: change.stock })
        .where(and(eq(productVariants.id, change.variantId), guard))
        .returning({ id: productVariants.id });
      if (res.length === 0) conflicts.push(label);
      else changed = true;
    }
    if (change.priceOre !== undefined && change.priceOre !== row.variant.priceOre) {
      await db.update(productVariants).set({ priceOre: change.priceOre }).where(eq(productVariants.id, change.variantId));
      await db.insert(variantPriceHistory).values({ variantId: change.variantId, priceOre: change.priceOre });
      changed = true;
    }
    if (changed) updated++;
  }
  await db.insert(auditLog).values({ siteId, userId, action: "product.bulk_variants", detail: { updated, conflicts: conflicts.length } });
  return { updated, conflicts };
}

export const bulkProductChangeSchema = z.union([
  z.object({ status: z.enum(["draft", "active", "archived"]) }),
  z.object({ categoryId: z.string().uuid().nullable() }),
]);
export type BulkProductChange = z.infer<typeof bulkProductChangeSchema>;

export async function bulkUpdateProducts(db: Db, siteId: string, ids: string[], change: BulkProductChange, userId: string) {
  const parsedIds = z.array(z.string().uuid()).min(1, "Velg minst én vare").max(1000).safeParse(ids);
  if (!parsedIds.success) throw new ShopError(parsedIds.error.issues[0].message);
  const parsed = bulkProductChangeSchema.safeParse(change);
  if (!parsed.success) throw new ShopError("Ugyldig endring");
  if ("categoryId" in parsed.data) await assertCategory(db, siteId, parsed.data.categoryId);
  const updated = await db
    .update(products)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(products.siteId, siteId), inArray(products.id, parsedIds.data)))
    .returning({ id: products.id });
  if (updated.length) await db.insert(auditLog).values({ siteId, userId, action: "product.bulk", detail: { count: updated.length, ...parsed.data } });
  return updated.length;
}
