"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { auditLog, discountCodes, productCategories, products, sites } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import {
  bulkUpdateProducts,
  createProduct,
  productSlug,
  ShopError,
  updateProduct,
  updateVariants,
  type BulkProductChange,
  type ProductInput,
  type VariantChange,
} from "@/lib/shop/catalog";
import { saveDiscount, type DiscountInput } from "@/lib/shop/discounts";
import { setCustomerNote } from "@/lib/shop/customers";
import { notifyOrderShipped } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { applyImport, planImport, type ImportPlan } from "@/lib/shop/import";
import { setOrderStatus, setStaffNote, setTracking, type OrderStatus } from "@/lib/shop/orders";
import { shopSettingsSchema, type ShopSettings } from "@/lib/shop/settings";
import type { ActionState } from "./actions";

/** «Pakken er på vei» til kunden, sendt etter at studioet har fått svar. */
function shippedNotice(db: Awaited<ReturnType<typeof getDb>>, orderId: string) {
  after(() => notifyOrderShipped(db, getEmailProvider(), orderId).catch((err) => console.error("Sendt-varsel feilet", err)));
}

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
    const db = await getDb();
    await setOrderStatus(db, site.id, orderId, status, user.id);
    if (status === "fulfilled") shippedNotice(db, orderId);
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

export async function saveTrackingAction(
  siteId: string,
  orderId: string,
  tracking: { carrier: string; number: string },
  markFulfilled: boolean,
): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const db = await getDb();
    await setTracking(db, site.id, orderId, tracking, user.id);
    if (markFulfilled) {
      await setOrderStatus(db, site.id, orderId, "fulfilled", user.id);
      shippedNotice(db, orderId);
    }
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: markFulfilled ? "Sporingen er lagret og ordren er markert som sendt" : "Sporingen er lagret" };
  } catch (err) {
    return toState(err);
  }
}

export async function saveStaffNoteAction(siteId: string, orderId: string, note: string): Promise<ActionState> {
  try {
    const { site } = await requireSiteAccess(siteId);
    await setStaffNote(await getDb(), site.id, orderId, note);
    revalidatePath(`/studio/nettsted/${site.id}/ordre/${orderId}`);
    return { ok: true, message: "Notatet er lagret" };
  } catch (err) {
    return toState(err);
  }
}

export async function bulkProductsAction(siteId: string, ids: string[], change: BulkProductChange): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const count = await bulkUpdateProducts(await getDb(), site.id, ids, change, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: `${count} ${count === 1 ? "vare er" : "varer er"} oppdatert` };
  } catch (err) {
    return toState(err);
  }
}

export async function saveVariantGridAction(
  siteId: string,
  changes: VariantChange[],
): Promise<{ ok: boolean; message: string; conflicts?: string[] }> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const { updated, conflicts } = await updateVariants(await getDb(), site.id, changes, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    if (conflicts.length) {
      return {
        ok: false,
        message: `${updated} lagret. Lageret er endret av et salg siden du åpnet siden, så disse ble ikke lagret: ${conflicts.join(", ")}. Last siden på nytt og prøv igjen.`,
        conflicts,
      };
    }
    return { ok: true, message: `${updated} ${updated === 1 ? "variant er" : "varianter er"} lagret` };
  } catch (err) {
    return toState(err) as { ok: boolean; message: string };
  }
}

export async function saveDiscountAction(
  siteId: string,
  discountId: string | null,
  input: DiscountInput,
): Promise<{ ok: boolean; message: string; discountId?: string }> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const id = await saveDiscount(await getDb(), site.id, discountId, input, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: discountId ? "Rabattkoden er lagret" : "Rabattkoden er opprettet", discountId: id };
  } catch (err) {
    return toState(err) as { ok: boolean; message: string };
  }
}

/** Koder som er brukt, kan bare slås av, så historikken i gamle ordre fortsatt gir mening. */
export async function deleteDiscountAction(siteId: string, discountId: string): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const db = await getDb();
    const deleted = await db
      .delete(discountCodes)
      .where(and(eq(discountCodes.id, discountId), eq(discountCodes.siteId, site.id), eq(discountCodes.usedCount, 0)))
      .returning({ code: discountCodes.code });
    if (deleted.length === 0) return { ok: false, message: "Koden er brukt og kan bare slås av" };
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "discount.deleted", detail: { code: deleted[0].code } });
    revalidatePath(`/studio/nettsted/${site.id}/rabatter`);
    return { ok: true, message: `Koden ${deleted[0].code} er slettet` };
  } catch (err) {
    return toState(err);
  }
}

export async function setDiscountActiveAction(siteId: string, discountId: string, active: boolean): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const db = await getDb();
    await db.update(discountCodes).set({ active }).where(and(eq(discountCodes.id, discountId), eq(discountCodes.siteId, site.id)));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "discount.active", detail: { discountId, active } });
    revalidatePath(`/studio/nettsted/${site.id}/rabatter`);
    return { ok: true, message: active ? "Koden er slått på" : "Koden er slått av" };
  } catch (err) {
    return toState(err);
  }
}

export async function saveCustomerNoteAction(siteId: string, customerId: string, note: string): Promise<ActionState> {
  try {
    const { site } = await requireSiteAccess(siteId);
    await setCustomerNote(await getDb(), site.id, customerId, note);
    revalidatePath(`/studio/nettsted/${site.id}/kunder/${customerId}`);
    return { ok: true, message: "Notatet er lagret" };
  } catch (err) {
    return toState(err);
  }
}

export async function previewImportAction(siteId: string, text: string): Promise<{ ok: boolean; message: string; plan?: ImportPlan }> {
  try {
    const { site } = await requireSiteAccess(siteId);
    const plan = await planImport(await getDb(), site.id, text);
    return { ok: plan.errors.length === 0, message: plan.errors.length ? "Filen har feil som må rettes" : "Filen ser bra ut", plan };
  } catch (err) {
    return toState(err) as { ok: boolean; message: string };
  }
}

export async function applyImportAction(siteId: string, text: string): Promise<{ ok: boolean; message: string; plan?: ImportPlan }> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const plan = await applyImport(await getDb(), site.id, text, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: `Importert: ${plan.creates.length} nye varer og ${plan.updates.length} varer endret`, plan };
  } catch (err) {
    return toState(err) as { ok: boolean; message: string };
  }
}
