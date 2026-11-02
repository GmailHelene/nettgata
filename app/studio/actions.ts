"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/db";
import { pages, users } from "@/db/schema";
import { headers } from "next/headers";
import { createPreviewToken } from "@/lib/preview";
import { clientKey, hit, reset, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { assertCanPublish, PublishingError, publishPage, restoreVersion, saveDraft } from "@/lib/publishing";
import {
  clearPendingSecondFactor,
  createPendingSecondFactor,
  createSession,
  destroySession,
  readPendingSecondFactor,
  requireSiteAccess,
  requireUser,
} from "@/lib/session";
import { verifySecondFactor } from "@/lib/two-factor";
import { pingPublished, publishSeoNotes, withSeoNotes } from "@/lib/seo/publish";

export type ActionState = { ok: boolean; message: string } | null;

// Sammenlignes mot når brukeren ikke finnes, så svartiden ikke avslører hvilke e-poster som er registrert.
let dummyHash: Promise<string> | null = null;

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "Fyll inn e-post og passord" };

  const db = await getDb();
  const emailKey = `login-email:${email}`;
  const ipKey = `login-ip:${await clientKey(await headers(), getSecret())}`;
  const allowed = (await hit(db, emailKey, rules.loginPerEmail)) && (await hit(db, ipKey, rules.loginPerIp));
  if (!allowed) return { ok: false, message: "For mange forsøk. Vent 15 minutter og prøv igjen." };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Samme kost som ekte passord (12). Med lavere kost svarer ukjente e-poster raskere, og det avslører hvem som finnes.
  dummyHash ??= bcrypt.hash("ikke-en-bruker", 12);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) return { ok: false, message: "Feil e-post eller passord" };

  await reset(db, emailKey);
  // Med tofaktor gir riktig passord bare et mellomsteg. Økten lages først når koden stemmer.
  if (user.totpEnabledAt) {
    await createPendingSecondFactor(user.id);
    redirect("/studio/logg-inn/kode");
  }
  await createSession(user.id);
  redirect("/studio");
}

/** Andre steg av innloggingen: kode fra appen eller en reservekode. */
export async function verifyCodeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await readPendingSecondFactor();
  if (!userId) return { ok: false, message: "Innloggingen gikk ut. Gå tilbake og logg inn på nytt." };

  const db = await getDb();
  const key = `totp:${userId}`;
  if (!(await hit(db, key, rules.totpPerUser))) return { ok: false, message: "For mange forsøk. Vent 15 minutter og prøv igjen." };
  const result = await verifySecondFactor(db, userId, String(formData.get("code") ?? ""));
  if (!result) return { ok: false, message: "Koden stemmer ikke. Skriv inn koden som vises i appen nå, eller en reservekode." };

  await reset(db, key);
  await clearPendingSecondFactor();
  await createSession(userId);
  redirect(result === "reservekode" ? "/studio/konto?reservekode=brukt" : "/studio");
}

export async function logout() {
  await destroySession();
  redirect("/studio/logg-inn");
}

/**
 * Henter siden og sjekker at brukeren har tilgang til nettstedet den hører til.
 * Innloggingen sjekkes først, så den som ikke er logget inn, aldri får vite om en side finnes.
 */
async function authorizePage(pageId: string) {
  await requireUser();
  const db = await getDb();
  const [page] = await db.select({ siteId: pages.siteId }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) throw new PublishingError("Fant ikke siden");
  const access = await requireSiteAccess(page.siteId);
  return { db, ...access };
}

function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof PublishingError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

export async function saveDraftAction(
  pageId: string,
  title: string,
  content: unknown,
  options: { quiet?: boolean } = {},
): Promise<ActionState> {
  try {
    const { db, user, site } = await authorizePage(pageId);
    await saveDraft(db, pageId, { title, content }, user.id);
    // Automatisk lagring henter ikke siden på nytt: redigereren har allerede innholdet,
    // og en full runde mot databasen etter hvert lagret ord er bortkastet.
    if (!options.quiet) revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Kladden er lagret" };
  } catch (err) {
    return toState(err);
  }
}

export async function publishAction(pageId: string): Promise<ActionState> {
  try {
    const { db, user, site } = await authorizePage(pageId);
    await assertCanPublish(db, site.id, user);
    const version = await publishPage(db, pageId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    after(() => pingPublished(db, site.id, [pageId]).catch((err) => console.error("IndexNow feilet", err)));
    // Rådene for Google stopper aldri publiseringen. Feiler de, publiseres det likevel uten råd.
    const notes = await publishSeoNotes(db, pageId).catch(() => []);
    return { ok: true, message: withSeoNotes(`Publisert som versjon ${version.number}.`, notes) };
  } catch (err) {
    return toState(err);
  }
}

export async function restoreAction(pageId: string, versionId: string): Promise<ActionState> {
  try {
    const { db, user, site } = await authorizePage(pageId);
    // «Gå tilbake hit» publiserer på nytt, så samme sperre gjelder.
    await assertCanPublish(db, site.id, user);
    const version = await restoreVersion(db, pageId, versionId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    after(() => pingPublished(db, site.id, [pageId]).catch((err) => console.error("IndexNow feilet", err)));
    return { ok: true, message: `Gjenopprettet og publisert som versjon ${version.number}` };
  } catch (err) {
    return toState(err);
  }
}

export async function previewLinkAction(pageId: string): Promise<{ ok: boolean; url?: string; message?: string }> {
  try {
    await authorizePage(pageId);
    return { ok: true, url: `/studio/forhandsvis/${await createPreviewToken(pageId)}` };
  } catch (err) {
    return { ok: false, message: toState(err)?.message };
  }
}
