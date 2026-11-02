"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { deleteFileBySrc, deleteMedia, listMedia, MediaError, setMediaAlt, type MediaItem } from "@/lib/media";
import { removeFavicon, saveFavicon } from "@/lib/favicon";
import { MAX_IMAGE_BYTES } from "@/lib/media-types";
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

/** Nytt ikon i nettleserfanen. Nettleseren har laget PNG-ene på 180 og 48 px. Serveren sjekker størrelse og filtype. */
export async function saveFaviconAction(siteId: string, form: FormData): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const icon = form.get("icon");
    const small = form.get("small");
    if (!(icon instanceof File) || !(small instanceof File)) return { ok: false, message: "Velg et bilde først" };
    if (icon.size > MAX_IMAGE_BYTES || small.size > MAX_IMAGE_BYTES) return { ok: false, message: "Bildet er for stort" };
    await saveFavicon(await getDb(), await getMediaStore(), {
      siteId: site.id,
      userId: user.id,
      icon: new Uint8Array(await icon.arrayBuffer()),
      small: new Uint8Array(await small.arrayBuffer()),
    });
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Ikonet er lagret og vises i nettleserfanen med en gang. Det kan ta litt tid før Google viser det nye." };
  } catch (err) {
    return toState(err);
  }
}

/** Tilbake til bokstaven fra navnet i temafargene. */
export async function removeFaviconAction(siteId: string): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    await removeFavicon(await getDb(), { siteId: site.id, userId: user.id });
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: "Ikonet er fjernet. Nettstedet bruker forbokstaven i navnet til det er lastet opp et nytt." };
  } catch (err) {
    return toState(err);
  }
}

/** Sletter en PDF fra «Filer» under Bilder. Går bare når ingen side bruker den. */
export async function deleteFileAction(siteId: string, mediaId: string): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    await deleteMedia(await getDb(), await getMediaStore(), { siteId: site.id, mediaId, userId: user.id });
    revalidatePath(`/studio/nettsted/${site.id}/bilder`);
    return { ok: true, message: "Filen er slettet for godt" };
  } catch (err) {
    return toState(err);
  }
}

/** Den gamle filen etter «Bytt fil». Brukes den fortsatt av den publiserte siden, får kunden vite hva som må til. */
export async function deleteOldFileAction(siteId: string, src: string): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    await deleteFileBySrc(await getDb(), await getMediaStore(), { siteId: site.id, src, userId: user.id });
    revalidatePath(`/studio/nettsted/${site.id}/bilder`);
    return { ok: true, message: "Den gamle filen er slettet." };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof MediaError && err.message.startsWith("Filen brukes fortsatt")) {
      return {
        ok: false,
        message:
          "Den gamle filen brukes fortsatt, som regel av den publiserte siden. Publiser siden med den nye filen, så kan du slette den gamle under Bilder, Filer.",
      };
    }
    return toState(err);
  }
}
