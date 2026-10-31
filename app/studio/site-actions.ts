"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { auditLog, inquiries, sites } from "@/db/schema";
import { siteLayoutSchema, type SiteLayout } from "@/lib/site-layout";
import { themeSchema, type Theme } from "@/lib/theme";
import { lookupOrgnr, type BrregCompany } from "@/lib/brreg";
import { createPage, deletePage, movePage, publishAll, setPageInMenu, updateSiteSettings } from "@/lib/pages";
import { PublishingError } from "@/lib/publishing";
import { requireSiteAccess, requireUser } from "@/lib/session";
import { createSiteFromPack, SiteError } from "@/lib/sites";
import type { ActionState } from "./actions";

function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof PublishingError || err instanceof SiteError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

function infoFromForm(formData: FormData) {
  const days = formData.getAll("hoursDay").map(String);
  const times = formData.getAll("hoursTime").map(String);
  return {
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    street: text(formData, "street"),
    postalCode: text(formData, "postalCode"),
    city: text(formData, "city"),
    orgnr: text(formData, "orgnr"),
    openingHours: days
      .map((day, i) => ({ day: day.trim(), time: (times[i] ?? "").trim() }))
      .filter((h) => h.day && h.time),
  };
}

/** Bare plattformadmin kan slå opp, siden oppslaget går mot et eksternt register. */
export async function lookupOrgnrAction(orgnr: string): Promise<BrregCompany | null> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) return null;
  return lookupOrgnr(orgnr);
}

/** I fase 1 setter Helene opp nettstedene selv. Selvbetjening åpnes i fase 4. */
export async function createSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let siteId: string;
  try {
    const user = await requireUser();
    if (!user.isPlatformAdmin) return { ok: false, message: "Du har ikke tilgang til å opprette nettsteder" };
    const db = await getDb();
    const site = await createSiteFromPack(db, {
      name: text(formData, "name"),
      packKey: text(formData, "pack"),
      designKey: text(formData, "design"),
      slug: text(formData, "slug") || undefined,
      info: infoFromForm(formData),
      ownerId: user.id,
    });
    siteId = site.id;
  } catch (err) {
    return toState(err);
  }
  redirect(`/studio/nettsted/${siteId}`);
}

export async function updateSettingsAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const db = await getDb();
    await updateSiteSettings(db, site.id, { name: text(formData, "name"), info: infoFromForm(formData), designKey: text(formData, "design") }, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Lagret. Endringene vises på nettstedet med en gang." };
  } catch (err) {
    return toState(err);
  }
}

export async function createPageAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string;
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const db = await getDb();
    const page = await createPage(db, site.id, { title: text(formData, "title"), path: text(formData, "path") }, user.id);
    target = `/studio/nettsted/${site.id}/side/${page.id}`;
  } catch (err) {
    return toState(err);
  }
  redirect(target);
}

export async function deletePageAction(siteId: string, pageId: string): Promise<ActionState> {
  try {
    const { user, site } = await requireSiteAccess(siteId);
    await deletePage(await getDb(), site.id, pageId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`);
    return { ok: true, message: "Siden er slettet" };
  } catch (err) {
    return toState(err);
  }
}

export async function setMenuAction(siteId: string, pageId: string, show: boolean) {
  const { site } = await requireSiteAccess(siteId);
  await setPageInMenu(await getDb(), site.id, pageId, show);
  revalidatePath(`/studio/nettsted/${site.id}`);
}

export async function movePageAction(siteId: string, pageId: string, direction: -1 | 1) {
  const { site } = await requireSiteAccess(siteId);
  await movePage(await getDb(), site.id, pageId, direction === -1 ? -1 : 1);
  revalidatePath(`/studio/nettsted/${site.id}`);
}

export async function publishAllAction(siteId: string): Promise<ActionState> {
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const count = await publishAll(await getDb(), site.id, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: `${count} sider er publisert` };
  } catch (err) {
    return toState(err);
  }
}

export async function markInquiryReadAction(siteId: string, inquiryId: string) {
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  await db
    .update(inquiries)
    .set({ readAt: new Date() })
    .where(and(eq(inquiries.id, inquiryId), eq(inquiries.siteId, site.id)));
  revalidatePath(`/studio/nettsted/${site.id}/henvendelser`);
}

/** Henvendelser er personopplysninger, så kunden må kunne slette dem selv. */
export async function deleteInquiryAction(siteId: string, inquiryId: string) {
  const { site, user } = await requireSiteAccess(siteId);
  const db = await getDb();
  await db.delete(inquiries).where(and(eq(inquiries.id, inquiryId), eq(inquiries.siteId, site.id)));
  await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "inquiry.deleted", detail: { inquiryId } });
  revalidatePath(`/studio/nettsted/${site.id}/henvendelser`);
}

/** Logo, toppstripe, bunntekst, fonter og hjørner. Gjelder med en gang på alle sider. */
export async function saveAppearanceAction(
  siteId: string,
  input: { layout: SiteLayout; fonts: Theme["fonts"]; radius: Theme["radius"] },
): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const layout = siteLayoutSchema.safeParse(input.layout);
    if (!layout.success) return { ok: false, message: layout.error.issues[0].message };
    const theme = themeSchema.safeParse({ ...site.theme, fonts: input.fonts, radius: input.radius });
    if (!theme.success) return { ok: false, message: "Ugyldig font eller hjørnevalg" };
    const db = await getDb();
    await db.update(sites).set({ layout: layout.data, theme: theme.data }).where(eq(sites.id, site.id));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "site.appearance_updated" });
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Utseendet er lagret og vises på nettstedet med en gang." };
  } catch (err) {
    return toState(err);
  }
}
