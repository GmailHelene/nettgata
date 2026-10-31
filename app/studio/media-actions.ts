"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { deleteMedia, listMedia, MediaError, setMediaAlt, type MediaItem } from "@/lib/media";
import { requireSiteAccess } from "@/lib/session";
import { getMediaStore, StorageNotConfiguredError } from "@/lib/storage";
import type { ActionState } from "./actions";

function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof MediaError || err instanceof StorageNotConfiguredError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

/** Bildene til «Velg fra biblioteket» i bildefeltene. */
export async function listMediaAction(siteId: string): Promise<MediaItem[]> {
  const { site } = await requireSiteAccess(siteId);
  return listMedia(await getDb(), site.id);
}

export async function setMediaAltAction(siteId: string, mediaId: string, alt: string): Promise<ActionState> {
  try {
    const { site } = await requireSiteAccess(siteId);
    await setMediaAlt(await getDb(), { siteId: site.id, mediaId, alt });
    revalidatePath(`/studio/nettsted/${site.id}/bilder`);
    return { ok: true, message: "Beskrivelsen er lagret" };
  } catch (err) {
    return toState(err);
  }
}

export async function deleteMediaAction(siteId: string, mediaId: string): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    await deleteMedia(await getDb(), await getMediaStore(), { siteId: site.id, mediaId, userId: user.id });
    revalidatePath(`/studio/nettsted/${site.id}/bilder`);
    return { ok: true, message: "Bildet er slettet for godt" };
  } catch (err) {
    return toState(err);
  }
}
