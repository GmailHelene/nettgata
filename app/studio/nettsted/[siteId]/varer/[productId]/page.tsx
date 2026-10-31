import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productCategories, productVariants, products } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import type { ProductInput } from "@/lib/shop/catalog";
import { ProductEditor } from "./product-editor";

export default async function ProductPage({ params }: { params: Promise<{ siteId: string; productId: string }> }) {
  const { siteId, productId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const categories = await db
    .select({ id: productCategories.id, name: productCategories.name })
    .from(productCategories)
    .where(eq(productCategories.siteId, site.id))
    .orderBy(asc(productCategories.name));

  let initial: ProductInput & { id?: string } = {
    name: "",
    description: "",
    images: [],
    options: [],
    vatRate: 25,
    status: "draft",
    categoryId: null,
    variants: [{ optionValues: [], priceOre: 0, stock: null }],
  };
  let slug: string | null = null;

  if (productId !== "ny") {
    if (!/^[0-9a-f-]{36}$/.test(productId)) notFound();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.siteId, site.id))).limit(1);
    if (!product) notFound();
    const variants = await db.select().from(productVariants).where(eq(productVariants.productId, product.id)).orderBy(asc(productVariants.position));
    slug = product.slug;
    initial = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      images: product.images,
      options: product.options,
      vatRate: product.vatRate,
      status: product.status,
      categoryId: product.categoryId,
      variants: variants.map((v) => ({
        id: v.id,
        optionValues: v.optionValues,
        sku: v.sku ?? "",
        priceOre: v.priceOre,
        stock: v.stock,
        weightGrams: v.weightGrams,
      })),
    };
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <Link href={`/studio/nettsted/${site.id}/varer`} className="text-sm underline">
        Alle varer
      </Link>
      <h1 className="mb-8 mt-4 text-2xl font-bold">{initial.id ? initial.name : "Ny vare"}</h1>
      <ProductEditor siteId={site.id} initial={initial} categories={categories} viewPath={slug ? `/vis/${site.slug}/produkt/${slug}` : null} />
    </main>
  );
}
