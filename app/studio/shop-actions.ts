"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { auditLog, productCategories, products, sites } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { createProduct, productSlug, ShopError, updateProduct, type ProductInput } from "@/lib/shop/catalog";
import { setOrderStatus, type OrderStatus } from "@/lib/shop/orders";
import { shopSettingsSchema, type ShopSettings } from "@/lib/shop/settings";
import type { ActionState } from "./actions";

function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof ShopError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

export async function saveProductAction(
  siteId: string,
  productId: string | null,
  input: ProductInput,
): Promise<{ ok: boolean; message: string; productId?: string }> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const db = await getDb();
    if (productId) {
      await updateProduct(db, site.id, productId, input, user.id);
      revalidatePath(`/studio/nettsted/${site.id}/varer`, "layout");
      return { ok: true, message: "Varen er lagret", productId };
    }
    const product = await createProduct(db, site.id, input, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/varer`, "layout");
    return { ok: true, message: "Varen er opprettet", productId: product.id };
  } catch (err) {
    return toState(err) as { ok: boolean; message: string };
  }
}

export async function archiveProductAction(siteId: string, productId: string): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const db = await getDb();
    // Varer arkiveres i stedet for å slettes, så gamle ordre og statistikk henger sammen.
    await db.update(products).set({ status: "archived", updatedAt: new Date() }).where(and(eq(products.id, productId), eq(products.siteId, site.id)));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "product.archived", detail: { productId } });
    revalidatePath(`/studio/nettsted/${site.id}/varer`, "layout");
    return { ok: true, message: "Varen er arkivert og vises ikke lenger i butikken" };
  } catch (err) {
    return toState(err);
  }
}

export async function createCategoryAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { site } = await requireSiteAccess(siteId);
    const name = String(formData.get("name") ?? "").trim();
    if (!name || name.length > 60) return { ok: false, message: "Kategorien må ha et navn (maks 60 tegn)" };
    const slug = productSlug(name);
    if (!slug) return { ok: false, message: "Navnet må inneholde bokstaver eller tall" };
    const db = await getDb();
    const [taken] = await db
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(and(eq(productCategories.siteId, site.id), eq(productCategories.slug, slug)))
      .limit(1);
    if (taken) return { ok: false, message: `Kategorien «${name}» finnes allerede` };
    await db.insert(productCategories).values({ siteId: site.id, name, slug });
    revalidatePath(`/studio/nettsted/${site.id}/varer`);
    return { ok: true, message: `Kategorien «${name}» er lagt til` };
  } catch (err) {
    return toState(err);
  }
}

export async function deleteCategoryAction(siteId: string, categoryId: string) {
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  // Varene i kategorien blir liggende uten kategori (fremmednøkkelen setter null).
  await db.delete(productCategories).where(and(eq(productCategories.id, categoryId), eq(productCategories.siteId, site.id)));
  revalidatePath(`/studio/nettsted/${site.id}/varer`);
}

export async function setOrderStatusAction(siteId: string, orderId: string, status: OrderStatus): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    await setOrderStatus(await getDb(), site.id, orderId, status, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/ordre`, "layout");
    return { ok: true, message: "Status er oppdatert" };
  } catch (err) {
    return toState(err);
  }
}

export async function saveShopSettingsAction(siteId: string, settings: ShopSettings): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const parsed = shopSettingsSchema.safeParse(settings);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const codes = parsed.data.shippingOptions.map((o) => o.code);
    if (new Set(codes).size !== codes.length) return { ok: false, message: "To fraktvalg har samme kode" };
    const db = await getDb();
    await db.update(sites).set({ shop: parsed.data }).where(eq(sites.id, site.id));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "shop.settings_updated" });
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Butikkinnstillingene er lagret" };
  } catch (err) {
    return toState(err);
  }
}
