"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { auditLog, discountCodes, orders, productCategories, products } from "@/db/schema";
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
import { CreditNoteError, retryCreditNote } from "@/lib/shop/credit-notes";
import { notifyOrderPlaced, notifyOrderShipped } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { updateShopSettings } from "@/lib/payments/config";
import { changeOrderStatus } from "@/lib/payments/service";
import { readyProviders } from "@/lib/payments/state";
import { applyImport, planImport, type ImportPlan } from "@/lib/shop/import";
import { setStaffNote, setTracking, type OrderStatus } from "@/lib/shop/orders";
import { availablePaymentMethods, shopSettingsSchema, type ShopSettings } from "@/lib/shop/settings";
import type { ActionState } from "./actions";

/** «Pakken er på vei» til kunden, sendt etter at studioet har fått svar. */
function shippedNotice(db: Awaited<ReturnType<typeof getDb>>, orderId: string) {
  after(() => notifyOrderShipped(db, getEmailProvider(), orderId).catch((err) => console.error("Sendt-varsel feilet", err)));
}

/** Ordrebekreftelsen for Vipps og Klarna sendes når betalingen er bekreftet, ikke når ordren lages. */
function placedNotice(db: Awaited<ReturnType<typeof getDb>>, orderId: string) {
  after(() => notifyOrderPlaced(db, getEmailProvider(), orderId).catch((err) => console.error("Ordrevarsel feilet", err)));
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

/**
 * Vipps og Klarna: trekk ved «sendt», frigjøring ved kansellering og refusjon ved «refundert» skjer hos Vipps
 * eller Klarna før statusen endres. «Betalt» hentes fra Vipps eller Klarna i stedet for å settes for hånd.
 */
export async function setOrderStatusAction(siteId: string, orderId: string, status: OrderStatus): Promise<ActionState> {
  try {
    const { site, user, role } = await requireSiteAccess(siteId);
    const db = await getDb();
    // Refusjon og kansellering av en betalt ordre gir pengene tilbake, så det kan bare eieren.
    // Å kansellere en ubetalt ordre og å markere som sendt er vanlig arbeid for alle med tilgang.
    if (role !== "owner" && (status === "refunded" || status === "cancelled")) {
      const [order] = await db.select({ status: orders.status }).from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
      if (status === "refunded" || order?.status !== "pending_payment") {
        return { ok: false, message: "Bare eieren av butikken kan refundere eller kansellere en betalt ordre." };
      }
    }
    const change = await changeOrderStatus(db, site.id, orderId, status, user.id);
    if (change.paid) placedNotice(db, orderId);
    if (status === "fulfilled") shippedNotice(db, orderId);
    revalidatePath(`/studio/nettsted/${site.id}/ordre`, "layout");
    return { ok: true, message: change.message };
  } catch (err) {
    unstable_rethrow(err);
    // En sjekk hos Vipps eller Klarna kan ha endret ordren selv om handlingen feilet (for eksempel avbrutt betaling).
    revalidatePath(`/studio/nettsted/${siteId}/ordre`, "layout");
    return toState(err);
  }
}

export async function saveShopSettingsAction(siteId: string, settings: ShopSettings): Promise<ActionState> {
  try {
    const { site, user, role } = await requireSiteAccess(siteId);
    // Betalingsmåter og frakt bestemmer om og hvordan butikken får betalt, så bare eieren kan endre dem.
    if (role !== "owner") return { ok: false, message: "Bare eieren av butikken kan endre frakt og betalingsmåter." };
    const parsed = shopSettingsSchema.safeParse(settings);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const codes = parsed.data.shippingOptions.map((o) => o.code);
    if (new Set(codes).size !== codes.length) return { ok: false, message: "To fraktvalg har samme kode" };
    // Kassen må ha minst én betalingsmåte: en butikken håndterer selv, eller Vipps eller Klarna.
    if (availablePaymentMethods({ ...parsed.data, online: readyProviders(site.shop) }).length === 0) {
      return { ok: false, message: "Velg minst én betalingsmåte, eller koble til Vipps eller Klarna under Betaling." };
    }
    const db = await getDb();
    // Skriver bare butikkinnstillingene. Betalingsnøklene i samme felt blir liggende urørt.
    await updateShopSettings(db, site.id, parsed.data);
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
    if (!markFulfilled) {
      revalidatePath(`/studio/nettsted/${site.id}`, "layout");
      return { ok: true, message: "Sporingen er lagret" };
    }
    try {
      // Med Vipps og Klarna trekkes beløpet her. Feiler trekket, blir ordren ikke markert som sendt.
      const change = await changeOrderStatus(db, site.id, orderId, "fulfilled", user.id);
      shippedNotice(db, orderId);
      revalidatePath(`/studio/nettsted/${site.id}`, "layout");
      return { ok: true, message: change.online ? `Sporingen er lagret. ${change.message}` : "Sporingen er lagret og ordren er markert som sendt" };
    } catch (err) {
      unstable_rethrow(err);
      revalidatePath(`/studio/nettsted/${site.id}`, "layout");
      if (err instanceof ShopError) return { ok: false, message: `Sporingen er lagret, men ordren er ikke markert som sendt. ${err.message}` };
      throw err;
    }
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

/** Lager kreditnotaen som mangler på en kansellert eller refundert ordre. Eier og redaktør, som resten av ordrearbeidet. */
export async function retryCreditNoteAction(siteId: string, orderId: string): Promise<ActionState> {
  try {
    const { site, user, role } = await requireSiteAccess(siteId);
    if (role !== "owner" && role !== "editor") return { ok: false, message: "Bare eieren eller en redaktør kan lage kreditnota." };
    const note = await retryCreditNote(await getDb(), site.id, orderId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/ordre/${orderId}`);
    return { ok: true, message: `Kreditnota nr. ${note.number} er laget` };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof CreditNoteError) return { ok: false, message: err.message };
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
    const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
    return { ok: true, message: `Importert: ${n(plan.creates.length, "ny vare", "nye varer")} og ${n(plan.updates.length, "endret vare", "endrede varer")}`, plan };
  } catch (err) {
    return toState(err) as { ok: boolean; message: string };
  }
}
