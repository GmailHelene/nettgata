import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { MediaError, saveFile } from "@/lib/media";
import { MAX_FILE_BYTES } from "@/lib/media-types";
import { checkSiteAccess } from "@/lib/session";
import { getMediaStore, StorageNotConfiguredError } from "@/lib/storage";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Opplasting av PDF fra redigereren, for eksempel menyen. Filtypen sjekkes fra innholdet i saveFile. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return error("Ugyldig forespørsel", 400);

  const access = await checkSiteAccess(String(form.get("siteId") ?? ""));
  if (!access) return error("Ingen tilgang", 403);

  const file = form.get("file");
  if (!(file instanceof File)) return error("Mangler fil", 400);
  if (file.size > MAX_FILE_BYTES) return error("Filen er større enn 10 MB", 413);

  try {
    const result = await saveFile(await getDb(), await getMediaStore(), {
      siteId: access.site.id,
      userId: access.user.id,
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MediaError) return error(err.message, 400);
    if (err instanceof StorageNotConfiguredError) return error(err.message, 503);
    console.error(err);
    return error("Opplastingen feilet", 500);
  }
}
