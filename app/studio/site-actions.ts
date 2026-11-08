"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect, unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { auditLog, inquiries, pages, sites } from "@/db/schema";
import { readSiteLayout, siteLayoutSchema, type SiteLayout } from "@/lib/site-layout";
import { readSiteInfo } from "@/lib/site-info";
import { notificationSettingsSchema, type NotificationSettings } from "@/lib/notifications";
import type { Theme } from "@/lib/theme";
import { lookupOrgnr, type BrregCompany } from "@/lib/brreg";
import { parseRedirectList, type Redirect } from "@/lib/redirects";
import { assertSitemapFetchAllowed, collectOldPaths, SitemapError, suggestRedirects, type ImportRow } from "@/lib/sitemap-import";
import { createPage, createPost, deletePage, duplicatePage, movePage, publishAll, setPageInMenu, updateSiteSettings, updateSiteTheme } from "@/lib/pages";
import { assertCanPublish, PublishingError } from "@/lib/publishing";
import { requireSiteAccess, requireUser } from "@/lib/session";
import { pingPublished } from "@/lib/seo/publish";
import { createSiteFromPack, SiteError } from "@/lib/sites";
import { assertCanCreateSite, LimitError } from "@/lib/selvbetjening/grenser";
import { hit, rules } from "@/lib/rate-limit";
import { deleteInquiryImages } from "@/lib/henvendelser/bilder";
import { getMediaStore } from "@/lib/storage";
import type { ActionState } from "./actions";

function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof PublishingError || err instanceof SiteError || err instanceof LimitError) return { ok: false, message: err.message };
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
    serviceArea: text(formData, "serviceArea"),
    googleVerification: formData.has("googleVerification") ? text(formData, "googleVerification") : undefined,
    openingHours: days
      .map((day, i) => ({ day: day.trim(), time: (times[i] ?? "").trim() }))
      .filter((h) => h.day && h.time),
    specialHours: specialHoursFromForm(formData),
  };
}

/** Avvikende åpningstider. Rader uten dato og tid hoppes over, så en tom rad ikke gir feilmelding. */
function specialHoursFromForm(formData: FormData) {
  const dates = formData.getAll("specialDate").map(String);
  const labels = formData.getAll("specialLabel").map(String);
  const times = formData.getAll("specialTime").map(String);
  return dates
    .map((date, i) => ({ date: date.trim(), label: (labels[i] ?? "").trim(), time: (times[i] ?? "").trim() }))
    .filter((s) => s.date || s.time);
}

/**
 * Oppslag i Enhetsregisteret fra veiviseren. Plattformadmin og brukere med bekreftet e-post kan slå opp.
 * Oppslaget går mot et eksternt register, så kundene har en grense per time.
 */
export async function lookupOrgnrAction(orgnr: string): Promise<BrregCompany | null> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) {
    if (!user.emailVerified) return null;
    if (!(await hit(await getDb(), `brreg:${user.id}`, rules.brregPerUser))) return null;
  }
  return lookupOrgnr(orgnr);
}

/**
 * Nytt nettsted fra veiviseren. Plattformadmin kan lage så mange hun vil. Kunder med bekreftet e-post kan lage
 * nettsteder selv (selvbetjening), opptil grensen for ubetalte nettsteder i lib/selvbetjening/grenser.ts.
 */
export async function createSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let siteId: string;
  try {
    const user = await requireUser();
    const db = await getDb();
    await assertCanCreateSite(db, user);
    const site = await createSiteFromPack(db, {
      selfServe: !user.isPlatformAdmin,
      name: text(formData, "name"),
      packKey: text(formData, "pack"),
      themeKey: text(formData, "theme"),
      paletteKey: text(formData, "palette"),
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
    const info = infoFromForm(formData);
    // Google-koden har egen side (Google og synlighet). Skjemaer uten feltet beholder koden som er lagret.
    const googleVerification = info.googleVerification ?? readSiteInfo(site.info).googleVerification ?? "";
    await updateSiteSettings(db, site.id, { name: text(formData, "name"), info: { ...info, googleVerification } }, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Lagret. Endringene vises på nettstedet med en gang." };
  } catch (err) {
    return toState(err);
  }
}

/** Bare koden fra Google Search Console. Navn og kontaktinfo blir liggende som de er. */
export async function saveGoogleVerificationAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const info = { ...readSiteInfo(site.info), googleVerification: text(formData, "googleVerification") };
    await updateSiteSettings(await getDb(), site.id, { name: site.name, info }, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Lagret. Trykk nå Bekreft hos Google." };
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

export async function createPostAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let target: string;
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const page = await createPost(await getDb(), site.id, { title: text(formData, "title") }, user.id);
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
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Siden er slettet" };
  } catch (err) {
    return toState(err);
  }
}

/** Kopi av en side, med kladden og alle seksjonene. Kopien er ikke publisert og ligger ikke i menyen. */
export async function duplicatePageAction(siteId: string, pageId: string): Promise<ActionState> {
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const page = await duplicatePage(await getDb(), site.id, pageId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: `Kopien «${page.title}» er laget på ${page.path}. Den er ikke publisert og ligger ikke i menyen.` };
  } catch (err) {
    return toState(err);
  }
}

export async function setMenuAction(siteId: string, pageId: string, show: boolean) {
  const { site } = await requireSiteAccess(siteId);
  await setPageInMenu(await getDb(), site.id, pageId, show);
  revalidatePath(`/studio/nettsted/${site.id}`, "layout");
}

export async function movePageAction(siteId: string, pageId: string, direction: -1 | 1) {
  const { site } = await requireSiteAccess(siteId);
  await movePage(await getDb(), site.id, pageId, direction === -1 ? -1 : 1);
  revalidatePath(`/studio/nettsted/${site.id}`, "layout");
}

export async function publishAllAction(siteId: string): Promise<ActionState> {
  try {
    const { user, site } = await requireSiteAccess(siteId);
    const db = await getDb();
    await assertCanPublish(db, site.id, user);
    const { published, failed } = await publishAll(db, site.id, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    if (published) after(() => pingPublished(db, site.id).catch((err) => console.error("IndexNow feilet", err)));
    const done = `${published} ${published === 1 ? "side er" : "sider er"} publisert.`;
    if (!failed.length) return { ok: true, message: done };
    return { ok: false, message: [done, "Disse er ikke publisert ennå:", ...failed.map((f) => `${f.title}: ${f.message}`)].join("\n") };
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
  // Bildene i lageret først. Med henvendelsen borte ville bare ryddejobben funnet dem igjen.
  await deleteInquiryImages(db, await getMediaStore(), site.id, [inquiryId]);
  await db.delete(inquiries).where(and(eq(inquiries.id, inquiryId), eq(inquiries.siteId, site.id)));
  await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "inquiry.deleted", detail: { inquiryId } });
  revalidatePath(`/studio/nettsted/${site.id}/henvendelser`);
}

/** Logo, toppstripe, bunntekst, fonter og hjørner. Gjelder med en gang på alle sider. */
export async function saveAppearanceAction(siteId: string, input: { layout: SiteLayout }): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const layout = siteLayoutSchema.safeParse(input.layout);
    if (!layout.success) return { ok: false, message: layout.error.issues[0].message };
    const db = await getDb();
    // Ikonet i fanen lagres med egen handling. Skjemaet for utseende kan ha en eldre utgave, så den lagrede beholdes.
    const [current] = await db.select({ layout: sites.layout }).from(sites).where(eq(sites.id, site.id)).limit(1);
    const favicon = readSiteLayout(current?.layout).favicon;
    await db.update(sites).set({ layout: { ...layout.data, favicon } }).where(eq(sites.id, site.id));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "site.appearance_updated" });
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Utseendet er lagret og vises på nettstedet med en gang." };
  } catch (err) {
    return toState(err);
  }
}

/** Bytter tema eller lagrer tilpasningene fra Design. Gjelder hele nettstedet med en gang, uten publisering. */
export async function saveThemeAction(siteId: string, theme: Theme): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    await updateSiteTheme(await getDb(), site.id, theme, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Designet er lagret og vises på nettstedet med en gang." };
  } catch (err) {
    return toState(err);
  }
}

/** Gamle adresser fra en tidligere nettside, én per linje. Gjelder med en gang. */
export async function saveRedirectsAction(siteId: string, text: string): Promise<ActionState> {
  try {
    const { site, user, role } = await requireSiteAccess(siteId);
    // En omdirigering kan sende alle besøkende på en adresse et annet sted, så bare eieren kan endre dem.
    if (role !== "owner") return { ok: false, message: "Bare eieren av nettstedet kan endre omdirigeringer." };
    const { redirects, errors } = parseRedirectList(text);
    if (errors.length) return { ok: false, message: errors.slice(0, 5).join("\n") };
    const db = await getDb();
    await db.update(sites).set({ redirects }).where(eq(sites.id, site.id));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "site.redirects_updated", detail: { count: redirects.length } });
    revalidatePath(`/studio/nettsted/${site.id}/innstillinger`, "layout");
    if (!redirects.length) return { ok: true, message: "Ingen omdirigeringer lagret." };
    // Sider som finnes, vinner over omdirigeringer (se findRedirect). Kunden må få vite at disse ikke sendes videre.
    const paths = new Set((await db.select({ path: pages.path }).from(pages).where(eq(pages.siteId, site.id))).map((p) => p.path));
    const shadowed = redirects.filter((r) => paths.has(r.from));
    const saved = `Lagret ${redirects.length} ${redirects.length === 1 ? "omdirigering" : "omdirigeringer"}. De virker med en gang.`;
    if (!shadowed.length) return { ok: true, message: saved };
    return {
      ok: true,
      message: [saved, `Disse adressene er sider her nå, så de viser siden i stedet for å sende videre: ${shadowed.map((r) => r.from).join(", ")}`].join("\n"),
    };
  } catch (err) {
    return toState(err);
  }
}

export type SitemapScan = { ok: boolean; message: string; rows: ImportRow[]; pages: { path: string; title: string }[] };

/**
 * Leser gamle adresser fra en sitemap (adresse eller opplastet fil) og foreslår nye sider. Lagrer ingenting:
 * kunden går gjennom forslagene først. Henting fra nettet har SSRF-sperrer, se lib/sitemap-import.ts.
 */
export async function scanSitemapAction(siteId: string, source: { url: string } | { xml: string }): Promise<SitemapScan> {
  const empty = { rows: [], pages: [] };
  try {
    const { site, role } = await requireSiteAccess(siteId);
    if (role !== "owner") return { ok: false, message: "Bare eieren av nettstedet kan endre omdirigeringer.", ...empty };
    const input = "url" in source ? { url: String(source.url ?? "").slice(0, 2000) } : { xml: String(source.xml ?? "") };
    const db = await getDb();
    // Bare henting fra nettet teller. En opplastet fil koster ingen forespørsler ut.
    if ("url" in input) await assertSitemapFetchAllowed(db, site.id);
    const { paths, skippedSitemaps } = await collectOldPaths(input);
    if (!paths.length) return { ok: false, message: "Fant ingen gamle adresser i sitemapen.", ...empty };
    const pageRows = await db
      .select({ path: pages.path, title: pages.title })
      .from(pages)
      .where(eq(pages.siteId, site.id))
      .orderBy(asc(pages.sortOrder));
    const rows = suggestRedirects(paths, pageRows);
    const skipped = skippedSitemaps ? ` ${skippedSitemaps} ${skippedSitemaps === 1 ? "sitemap" : "sitemaper"} i indeksen ble ikke lest.` : "";
    return { ok: true, message: `Fant ${paths.length} gamle ${paths.length === 1 ? "adresse" : "adresser"}.${skipped}`, rows, pages: pageRows };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof SitemapError) return { ok: false, message: err.message, ...empty };
    console.error(err);
    return { ok: false, message: "Noe gikk galt. Prøv igjen.", ...empty };
  }
}

/**
 * Lagrer omdirigeringene kunden har bekreftet fra sitemapen, sammen med dem som finnes fra før.
 * Gjelder samme regler som når listen skrives for hånd (saveRedirectsAction). Gir tilbake hele listen som tekst.
 */
export async function importRedirectsAction(siteId: string, existingText: string, confirmed: Redirect[]): Promise<{ state: ActionState; text: string }> {
  const lines = confirmed.slice(0, 1000).map((r) => `${String(r.from).trim()} ${String(r.to).trim()}`);
  const text = [existingText.trim(), ...lines].filter(Boolean).join("\n");
  const state = await saveRedirectsAction(siteId, text);
  return { state, text: state?.ok ? text : existingText };
}

export async function saveNotificationsAction(siteId: string, input: NotificationSettings): Promise<ActionState> {
  try {
    const { site, user, role } = await requireSiteAccess(siteId);
    // Varslene inneholder henvendelser og ordre med personopplysninger. Mottakeren bestemmer eieren.
    if (role !== "owner") return { ok: false, message: "Bare eieren av nettstedet kan endre hvem som får varsler." };
    const parsed = notificationSettingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const db = await getDb();
    await db.update(sites).set({ notifications: parsed.data }).where(eq(sites.id, site.id));
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "site.notifications_updated" });
    revalidatePath(`/studio/nettsted/${site.id}/innstillinger`, "layout");
    return { ok: true, message: "Varslene er lagret" };
  } catch (err) {
    return toState(err);
  }
}
