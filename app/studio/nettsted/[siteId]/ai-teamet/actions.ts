"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import type { ActionState } from "@/app/studio/actions";
import { getAiClient } from "@/lib/ai/client";
import { MANUAL_RUNS_PER_DAY } from "@/lib/ai/config";
import { AiRunError, runNow } from "@/lib/ai/runs";
import { approveSuggestion, rejectSuggestion, SuggestionError } from "@/lib/ai/suggestions";
import { PublishingError } from "@/lib/publishing";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";

export type SuggestionActionState = (ActionState & { pageId?: string | null }) | null;

function toState(err: unknown): { ok: false; message: string } {
  unstable_rethrow(err);
  if (err instanceof SuggestionError || err instanceof AiRunError || err instanceof PublishingError) return { ok: false, message: err.message };
  console.error("AI-teamet", err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen om litt." };
}

const path = (siteId: string) => `/studio/nettsted/${siteId}/ai-teamet`;

export async function approveAction(siteId: string, suggestionId: string): Promise<SuggestionActionState> {
  const { site, user } = await requireSiteAccess(siteId);
  try {
    const result = await approveSuggestion(await getDb(), site.id, suggestionId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: result.message, pageId: result.pageId };
  } catch (err) {
    revalidatePath(path(site.id));
    return toState(err);
  }
}

export async function rejectAction(siteId: string, suggestionId: string): Promise<SuggestionActionState> {
  const { site, user } = await requireSiteAccess(siteId);
  try {
    await rejectSuggestion(await getDb(), site.id, suggestionId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Avvist. Ingenting er endret." };
  } catch (err) {
    return toState(err);
  }
}

/** «Lag nye forslag nå». Tillegg og kostnadstak sjekkes i runNow, døgngrensen her. */
export async function runNowAction(siteId: string): Promise<ActionState> {
  const { site, user } = await requireSiteAccess(siteId);
  const client = await getAiClient();
  if (!client) return { ok: false, message: "AI-teamet er ikke slått på ennå. Prøv igjen senere." };
  try {
    const db = await getDb();
    if (!(await hit(db, `ai-manuell:${site.id}`, { limit: MANUAL_RUNS_PER_DAY, windowSeconds: 86_400 }))) {
      return { ok: false, message: `Du kan be om nye forslag ${MANUAL_RUNS_PER_DAY} ganger i døgnet. Nye forslag kommer uansett i løpet av natten.` };
    }
    const result = await runNow(db, client, site.id, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return {
      ok: true,
      message: result.suggestions
        ? `AI-teamet har ${result.suggestions === 1 ? "ett nytt forslag" : `${result.suggestions} nye forslag`} til deg.`
        : "AI-teamet fant ingenting nytt å foreslå akkurat nå.",
    };
  } catch (err) {
    return toState(err);
  }
}
