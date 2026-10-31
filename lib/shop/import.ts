import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, productCategories, productVariants, products } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { createProduct, productInputSchema, productSlug, ShopError, updateVariants, type ProductInput, type VariantChange } from "./catalog";
import { formatNok, parseNok, vatRates } from "./money";

export const MAX_IMPORT_ROWS = 2000;
/** Server Actions tar imot rundt 1 MB. Dette gir god margin for norske tegn. */
export const MAX_IMPORT_CHARS = 900_000;

/** Kolonnene i eksporten, og noen vanlige alternative navn. Rekkefølgen spiller ingen rolle. */
const columnNames = {
  name: ["varenavn", "navn", "produkt"],
  slug: ["adresse", "slug"],
  status: ["status"],
  category: ["kategori"],
  options: ["valg"],
  variant: ["variant"],
  sku: ["varenummer", "sku", "varenr."],
  price: ["pris (kr)", "pris"],
  stock: ["lager", "antall"],
  vat: ["mva-sats", "mva"],
  weight: ["vekt (g)", "vekt"],
} as const;
type Column = keyof typeof columnNames;

const statusWords: Record<string, "active" | "draft" | "archived"> = {
  "i butikken": "active",
  aktiv: "active",
  kladd: "draft",
  arkivert: "archived",
};

type Row = {
  line: number;
  name: string;
  key: string;
  slug: string;
  status?: "active" | "draft" | "archived";
  category: string;
  optionNames: string[];
  values: string[];
  sku: string;
  priceOre?: number;
  /** undefined: ikke endre. null: lager følges ikke. */
  stock?: number | null;
  vatRate?: number;
  weightGrams?: number | null;
};

export type ImportPlan = {
  rows: number;
  creates: { name: string; variants: number; status: string }[];
  updates: { name: string; changes: string[] }[];
  newCategories: string[];
  errors: { line: number; message: string }[];
};

const split = (text: string) =>
  text
    .split("/")
    .map((v) => v.trim())
    .filter(Boolean);

function readRows(text: string): { rows: Row[]; errors: ImportPlan["errors"] } {
  if (text.length > MAX_IMPORT_CHARS) throw new ShopError("Filen er for stor. Del den i flere filer på maks 2000 rader.");
  const [header, ...data] = parseCsv(text);
  if (!header) throw new ShopError("Filen er tom");
  if (data.length > MAX_IMPORT_ROWS) throw new ShopError(`Filen har ${data.length} rader. Maks er ${MAX_IMPORT_ROWS} per import.`);

  const index = {} as Record<Column, number>;
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const [column, names] of Object.entries(columnNames) as [Column, readonly string[]][]) {
    index[column] = normalized.findIndex((h) => names.includes(h));
  }
  if (index.name === -1) throw new ShopError("Fant ikke kolonnen «Varenavn». Bruk overskriftene fra eksporten.");

  const rows: Row[] = [];
  const errors: ImportPlan["errors"] = [];
  data.forEach((cells, i) => {
    const line = i + 2; // Linje 1 er overskriftene, som i Excel.
    const get = (c: Column) => (index[c] === -1 ? "" : (cells[index[c]] ?? "").trim());
    const fail = (message: string) => errors.push({ line, message });

    const name = get("name");
    if (!name) return fail("Varenavn mangler");
    const row: Row = {
      line,
      name,
      slug: get("slug"),
      key: get("slug") || productSlug(name),
      category: get("category"),
      optionNames: split(get("options")),
      values: split(get("variant")),
      sku: get("sku"),
    };

    const status = get("status").toLowerCase();
    if (status) {
      if (!(status in statusWords)) return fail(`Ukjent status «${get("status")}». Bruk I butikken, Kladd eller Arkivert.`);
      row.status = statusWords[status];
    }
    const price = get("price");
    if (price) {
      const ore = parseNok(price);
      if (ore === null) return fail(`Ugyldig pris «${price}»`);
      row.priceOre = ore;
    }
    const stock = get("stock").toLowerCase();
    if (stock === "følges ikke" || stock === "folges ikke") row.stock = null;
    else if (stock) {
      if (!/^\d+$/.test(stock)) return fail(`Lager må være et helt tall eller «Følges ikke», ikke «${get("stock")}»`);
      row.stock = Number(stock);
    }
    const vat = get("vat").replace("%", "").trim();
    if (vat) {
      if (!(vatRates as readonly number[]).includes(Number(vat))) return fail(`MVA-satsen må være 25, 15, 12 eller 0, ikke «${get("vat")}»`);
      row.vatRate = Number(vat);
    }
    const weight = get("weight");
    if (weight) {
      if (!/^\d+$/.test(weight)) return fail(`Vekt må være hele gram, ikke «${weight}»`);
      row.weightGrams = Number(weight);
    }
    rows.push(row);
  });
  return { rows, errors };
}

type Prepared = {
  plan: ImportPlan;
  creates: { input: ProductInput; category: string }[];
  variantChanges: VariantChange[];
  productChanges: { productId: string; status?: "active" | "draft" | "archived"; category?: string }[];
};

/**
 * Sammenligner filen med butikken. Eksisterende varer finnes på adresse (eller navn), og varianter
 * på varenummer eller variantnavn. Nye varer opprettes. Varianter som ikke står i filen, røres ikke.
 */
async function prepare(db: Db, siteId: string, text: string): Promise<Prepared> {
  const { rows, errors } = readRows(text);
  const existing = await db.select().from(products).where(eq(products.siteId, siteId));
  const variants = existing.length
    ? await db.select({ variant: productVariants, productId: products.id }).from(productVariants).innerJoin(products, eq(productVariants.productId, products.id)).where(eq(products.siteId, siteId))
    : [];
  const categories = await db.select().from(productCategories).where(eq(productCategories.siteId, siteId));
  const categoryNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const bySlug = new Map(existing.map((p) => [p.slug, p]));
  const bySku = new Map(variants.filter((v) => v.variant.sku).map((v) => [v.variant.sku!.toLowerCase(), v]));

  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);

  const prepared: Prepared = {
    plan: { rows: rows.length + errors.length, creates: [], updates: [], newCategories: [], errors },
    creates: [],
    variantChanges: [],
    productChanges: [],
  };
  const newCategories = new Set<string>();
  const noteCategory = (name: string) => {
    if (name && !categoryNames.has(name.toLowerCase())) newCategories.add(name);
  };

  for (const [key, group] of groups) {
    const product = bySlug.get(key);
    const status = group.find((r) => r.status)?.status;
    const category = group.find((r) => r.category)?.category ?? "";

    if (product) {
      const changes: string[] = [];
      const productChange: Prepared["productChanges"][number] = { productId: product.id };
      if (status && status !== product.status) {
        productChange.status = status;
        changes.push(`status til ${Object.entries(statusWords).find(([, v]) => v === status)![0]}`);
      }
      const currentCategory = categories.find((c) => c.id === product.categoryId)?.name ?? "";
      if (category && category.toLowerCase() !== currentCategory.toLowerCase()) {
        productChange.category = category;
        noteCategory(category);
        changes.push(`kategori til ${category}`);
      }
      if (productChange.status || productChange.category) prepared.productChanges.push(productChange);

      for (const row of group) {
        const label = row.values.join(" / ");
        const match = row.sku
          ? bySku.get(row.sku.toLowerCase())
          : variants.find((v) => v.productId === product.id && v.variant.optionValues.join(" / ") === label);
        if (!match || match.productId !== product.id) {
          errors.push({
            line: row.line,
            message: row.sku
              ? `Fant ikke varenummer ${row.sku} på «${product.name}»`
              : `Fant ikke varianten «${label || "uten valg"}» på «${product.name}». Nye varianter legges inn på varen i studioet.`,
          });
          continue;
        }
        const change: VariantChange = { variantId: match.variant.id };
        const what = label ? `${label}: ` : "";
        if (row.priceOre !== undefined && row.priceOre !== match.variant.priceOre) {
          change.priceOre = row.priceOre;
          changes.push(`${what}pris ${formatNok(match.variant.priceOre)} til ${formatNok(row.priceOre)}`);
        }
        if (row.stock !== undefined && row.stock !== match.variant.stock) {
          change.stock = row.stock;
          changes.push(`${what}lager ${match.variant.stock ?? "følges ikke"} til ${row.stock ?? "følges ikke"}`);
        }
        if (change.priceOre !== undefined || change.stock !== undefined) prepared.variantChanges.push(change);
      }
      if (changes.length) prepared.plan.updates.push({ name: product.name, changes });
      continue;
    }

    // Ny vare: valgene bygges fra kolonnene Valg og Variant, i rekkefølgen verdiene dukker opp.
    const optionNames = group.find((r) => r.optionNames.length)?.optionNames ?? [];
    const bad = group.find((r) => r.values.length !== optionNames.length);
    if (bad) {
      errors.push({
        line: bad.line,
        message: optionNames.length
          ? `«${bad.name}» har valgene ${optionNames.join(" / ")}, så varianten må ha ${optionNames.length} verdier skilt med /`
          : `«${bad.name}» står på flere rader uten varianter. Fyll ut kolonnene Valg og Variant, for eksempel Størrelse og M.`,
      });
      continue;
    }
    if (optionNames.length === 0 && group.length > 1) {
      errors.push({ line: group[1].line, message: `«${group[0].name}» står på flere rader uten varianter` });
      continue;
    }
    const missingPrice = group.find((r) => r.priceOre === undefined);
    if (missingPrice) {
      errors.push({ line: missingPrice.line, message: `Pris mangler for ny vare «${missingPrice.name}»` });
      continue;
    }
    const input: ProductInput = {
      name: group[0].name,
      slug: group[0].slug,
      vatRate: group.find((r) => r.vatRate !== undefined)?.vatRate ?? 25,
      // Nye varer blir kladd hvis filen ikke sier noe annet, så ingenting vises i butikken ved et uhell.
      status: status ?? "draft",
      options: optionNames.map((name, i) => ({ name, values: [...new Set(group.map((r) => r.values[i]))] })),
      variants: group.map((r) => ({ optionValues: r.values, sku: r.sku, priceOre: r.priceOre!, stock: r.stock ?? null, weightGrams: r.weightGrams ?? null })),
    };
    const checked = productInputSchema.safeParse(input);
    if (!checked.success) {
      errors.push({ line: group[0].line, message: `«${group[0].name}»: ${checked.error.issues[0].message}` });
      continue;
    }
    noteCategory(category);
    prepared.creates.push({ input, category });
    prepared.plan.creates.push({ name: input.name, variants: input.variants.length, status: input.status === "active" ? "I butikken" : input.status === "archived" ? "Arkivert" : "Kladd" });
  }

  prepared.plan.newCategories = [...newCategories];
  prepared.plan.errors.sort((a, b) => a.line - b.line);
  return prepared;
}

/** Leser filen og viser hva som vil skje. Lagrer ingenting. */
export async function planImport(db: Db, siteId: string, text: string): Promise<ImportPlan> {
  return (await prepare(db, siteId, text)).plan;
}

/** Gjennomfører importen, men bare hvis filen ikke har feil, så butikken aldri blir halvveis oppdatert av en feil fil. */
export async function applyImport(db: Db, siteId: string, text: string, userId: string) {
  const prepared = await prepare(db, siteId, text);
  if (prepared.plan.errors.length) throw new ShopError("Filen har feil. Rett dem og sjekk filen på nytt før du importerer.");

  const categoryIds = new Map(
    (await db.select().from(productCategories).where(eq(productCategories.siteId, siteId))).map((c) => [c.name.toLowerCase(), c.id]),
  );
  for (const name of prepared.plan.newCategories) {
    const [created] = await db.insert(productCategories).values({ siteId, name, slug: productSlug(name) }).returning();
    categoryIds.set(name.toLowerCase(), created.id);
  }
  const categoryId = (name: string) => (name ? (categoryIds.get(name.toLowerCase()) ?? null) : null);

  for (const c of prepared.creates) await createProduct(db, siteId, { ...c.input, categoryId: categoryId(c.category) }, userId);
  for (const p of prepared.productChanges) {
    await db
      .update(products)
      .set({ ...(p.status && { status: p.status }), ...(p.category && { categoryId: categoryId(p.category) }), updatedAt: new Date() })
      .where(eq(products.id, p.productId));
  }
  if (prepared.variantChanges.length) await updateVariants(db, siteId, prepared.variantChanges, userId);
  await db.insert(auditLog).values({
    siteId,
    userId,
    action: "product.import",
    detail: { created: prepared.creates.length, updated: prepared.plan.updates.length },
  });
  return prepared.plan;
}
