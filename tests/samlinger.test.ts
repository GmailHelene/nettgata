import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { organizations, productCategories, productCollections, products, sites, users } from "@/db/schema";
import { bulkUpdateProducts, createProduct, listCatalog, updateProduct, type ProductInput } from "@/lib/shop/catalog";

describe("samlinger", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let julepynt: string;
  let gaver: string;

  const vare = (name: string, extra: Partial<ProductInput> = {}): ProductInput =>
    ({ name, vatRate: 25, status: "active", variants: [{ optionValues: [], priceOre: 20000, stock: null }], ...extra }) as ProductInput;

  const memberships = async (productId: string) =>
    (await db.select().from(productCollections).where(eq(productCollections.productId, productId))).map((m) => m.categoryId).sort();

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db.insert(sites).values({ orgId: org.id, name: "Ullstua", slug: "ullstua", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
    siteId = site.id;
    userId = user.id;
    [{ id: julepynt }] = await db.insert(productCategories).values({ siteId, name: "Julepynt", slug: "julepynt" }).returning();
    [{ id: gaver }] = await db.insert(productCategories).values({ siteId, name: "Gaver", slug: "gaver" }).returning();
  });

  it("en vare kan stå i flere samlinger, og finnes i alle", async () => {
    const p = await createProduct(db, siteId, vare("Lys", { collectionIds: [julepynt, gaver] }), userId);
    await createProduct(db, siteId, vare("Lue", { collectionIds: [gaver] }), userId);

    expect((await listCatalog(db, siteId, { categoryId: julepynt })).map((x) => x.name)).toEqual(["Lys"]);
    expect((await listCatalog(db, siteId, { categoryId: gaver })).map((x) => x.name)).toEqual(["Lue", "Lys"]);
    const [lys] = await listCatalog(db, siteId, { slug: p.slug });
    expect([...(lys.collectionSlugs ?? [])].sort()).toEqual(["gaver", "julepynt"]);
    // Den første er hovedkategorien, så eksport og varelister fortsatt virker.
    expect(p.categoryId).toBe(julepynt);
  });

  it("varer som bare har kategori, står i den samlingen", async () => {
    const p = await createProduct(db, siteId, vare("Pledd", { categoryId: gaver }), userId);
    expect(await memberships(p.id)).toEqual([gaver]);
  });

  it("endring erstatter samlingene, og tom liste tar varen ut av alle", async () => {
    const p = await createProduct(db, siteId, vare("Lys", { collectionIds: [julepynt] }), userId);
    await updateProduct(db, siteId, p.id, vare("Lys", { collectionIds: [gaver] }), userId);
    expect(await memberships(p.id)).toEqual([gaver]);
    await updateProduct(db, siteId, p.id, vare("Lys", { collectionIds: [] }), userId);
    expect(await memberships(p.id)).toEqual([]);
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0].categoryId).toBeNull();
  });

  it("godtar ikke samlinger fra en annen butikk", async () => {
    const [org] = await db.insert(organizations).values({ name: "Annen" }).returning();
    const [other] = await db.insert(sites).values({ orgId: org.id, name: "Annen", slug: "annen", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
    const [theirs] = await db.insert(productCategories).values({ siteId: other.id, name: "Deres", slug: "deres" }).returning();
    await expect(createProduct(db, siteId, vare("Lys", { collectionIds: [theirs.id] }), userId)).rejects.toThrow(/samlingen/);
  });

  it("«flytt til» for flere varer erstatter samlingene", async () => {
    const p = await createProduct(db, siteId, vare("Lys", { collectionIds: [julepynt, gaver] }), userId);
    await bulkUpdateProducts(db, siteId, [p.id], { categoryId: gaver }, userId);
    expect(await memberships(p.id)).toEqual([gaver]);
  });

  it("sletter en samling uten å slette varene", async () => {
    const p = await createProduct(db, siteId, vare("Lys", { collectionIds: [julepynt] }), userId);
    await db.delete(productCategories).where(eq(productCategories.id, julepynt));
    expect(await memberships(p.id)).toEqual([]);
    expect(await db.select().from(products).where(eq(products.id, p.id))).toHaveLength(1);
  });
});
