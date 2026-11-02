"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/send";
import { canSendNewsletter, NewsletterError, processQueue, queueNewsletter, saveDraft, sendTest } from "@/lib/nyhetsbrev/send";
import { deleteSubscriber } from "@/lib/nyhetsbrev/subscribers";
import { requireSiteAccess } from "@/lib/session";

/*
 * Nyhetsbrev i studioet. Rollen sjekkes i lib/nyhetsbrev/send.ts: bare eier og redaktør kan skrive og sende.
 */

export type ComposerState = { ok: boolean; message: string; id?: string } | null;

const path = (siteId: string) => `/studio/nettsted/${siteId}/nyhetsbrev`;

function toState(err: unknown): ComposerState {
  unstable_rethrow(err);
  if (err instanceof NewsletterError) return { ok: false, message: err.message };
  console.error("Nyhetsbrev i studioet", err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen om litt." };
}

export async function saveNewsletterDraftAction(siteId: string, id: string | null, input: unknown): Promise<ComposerState> {
  const { site, role, user } = await requireSiteAccess(siteId);
  try {
    const saved = await saveDraft(await getDb(), { siteId: site.id, role, userId: user.id }, id, input);
    return { ok: true, message: "Kladden er lagret.", id: saved };
  } catch (err) {
    return toState(err);
  }
}

/** Lagrer kladden og sender den til den som er logget inn. */
export async function sendNewsletterTestAction(siteId: string, id: string | null, input: unknown): Promise<ComposerState> {
  const { site, role, user } = await requireSiteAccess(siteId);
  try {
    const db = await getDb();
    const actor = { siteId: site.id, role, userId: user.id };
    const saved = await saveDraft(db, actor, id, input);
    const provider = getEmailProvider();
    const result = await sendTest(db, provider, actor, input, user.email);
    if (result.status === "feilet") return { ok: false, message: "Testutgaven kunne ikke sendes. Prøv igjen om litt.", id: saved };
    return {
      ok: true,
      id: saved,
      message:
        provider.name === "logg"
          ? "E-post er ikke slått på ennå, så testutgaven ble bare lagret i loggen."
          : `Testutgaven er sendt til ${user.email}. Kladden er lagret.`,
    };
  } catch (err) {
    return toState(err);
  }
}

/** Lagrer, låser og legger nyhetsbrevet i køen. Første porsjon sendes med en gang, resten av bakgrunnsjobben. */
export async function sendNewsletterAction(siteId: string, id: string | null, input: unknown): Promise<ComposerState> {
  const { site, role, user } = await requireSiteAccess(siteId);
  try {
    const db = await getDb();
    const actor = { siteId: site.id, role, userId: user.id };
    const saved = await saveDraft(db, actor, id, input);
    const { recipients } = await queueNewsletter(db, actor, saved, input);
    after(() => processQueue(db, getEmailProvider()).catch((err) => console.error("Sending av nyhetsbrev feilet", err)));
    revalidatePath(path(site.id));
    return {
      ok: true,
      message: `Nyhetsbrevet sendes nå til ${recipients} ${recipients === 1 ? "abonnent" : "abonnenter"}. Store lister sendes litt etter litt, og du ser hvor langt det har kommet under Sendte nyhetsbrev.`,
    };
  } catch (err) {
    return toState(err);
  }
}

/** Sletter én abonnent helt, for eksempel når personen ber om å bli slettet. */
export async function deleteSubscriberAction(siteId: string, subscriberId: string) {
  const { site, role, user } = await requireSiteAccess(siteId);
  if (!canSendNewsletter(role)) return;
  const db = await getDb();
  if (await deleteSubscriber(db, site.id, subscriberId)) {
    await db.insert(auditLog).values({ siteId: site.id, userId: user.id, action: "newsletter.subscriber_deleted", detail: { subscriberId } });
  }
  revalidatePath(`${path(site.id)}/abonnenter`);
}
