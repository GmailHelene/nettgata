import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { MediaError, saveImage } from "@/lib/media";
import { MAX_IMAGE_BYTES, VARIANT_WIDTHS } from "@/lib/media-types";
import { checkSiteAccess } from "@/lib/session";
import { getMediaStore, StorageNotConfiguredError } from "@/lib/storage";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Opplasting fra redigereren. Bildet er allerede krympet og gjort om til WebP i nettleseren. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return error("Ugyldig forespørsel", 400);

  const access = await checkSiteAccess(String(form.get("siteId") ?? ""));
  if (!access) return error("Ingen tilgang", 403);

  const file = form.get("file");
  if (!(file instanceof File)) return error("Mangler fil", 400);
  if (file.size > MAX_IMAGE_BYTES) return error("Bildet er større enn 5 MB", 413);

  // Mindre utgaver laget i nettleseren, for eksempel feltet «w640». Valideres i saveImage.
  const variants = [];
  for (const width of VARIANT_WIDTHS) {
    const variant = form.get(`w${width}`);
    if (variant instanceof File && variant.size <= MAX_IMAGE_BYTES) {
      variants.push({ width, bytes: new Uint8Array(await variant.arrayBuffer()) });
    }
  }

  try {
    const result = await saveImage(await getDb(), await getMediaStore(), {
      siteId: access.site.id,
      userId: access.user.id,
      bytes: new Uint8Array(await file.arrayBuffer()),
      width: Number(form.get("width")) || undefined,
      height: Number(form.get("height")) || undefined,
      alt: String(form.get("alt") ?? ""),
      variants,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MediaError) return error(err.message, 400);
    if (err instanceof StorageNotConfiguredError) return error(err.message, 503);
    console.error(err);
    return error("Opplastingen feilet", 500);
  }
}
