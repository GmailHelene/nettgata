import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { InquiryImageError, MAX_INQUIRY_IMAGE_BYTES, removePendingImage, saveInquiryImage } from "@/lib/henvendelser/bilder";
import { clientKey } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { getMediaStore, StorageNotConfiguredError } from "@/lib/storage";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status: number) => json({ error: message }, status);

/** Bare fra nettstedet selv. En annen side skal ikke kunne laste opp i navnet til en besøkende. */
function crossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return Boolean(site && site !== "same-origin");
}

/**
 * Bilder i kontaktskjemaet på kundenettstedene, ett om gangen. Offentlig, så alt sjekkes i saveInquiryImage:
 * nøkkelen, at skjemaet har bildefeltet, typen fra innholdet, størrelsen, antallet og grensene per IP og nettsted.
 */
export async function POST(request: Request) {
  if (crossSite(request)) return error("Ingen tilgang", 403);
  // Litt over grensen for selve bildet, for resten av skjemaet. Stopper store filer før de leses inn.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_INQUIRY_IMAGE_BYTES + 64 * 1024) return error("Bildet er for stort", 413);
  const form = await request.formData().catch(() => null);
  if (!form) return error("Ugyldig forespørsel", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return error("Mangler bilde", 400);
  if (file.size > MAX_INQUIRY_IMAGE_BYTES) return error("Bildet er for stort", 413);

  try {
    const db = await getDb();
    const result = await saveInquiryImage(db, await getMediaStore(), {
      token: String(form.get("token") ?? ""),
      bytes: new Uint8Array(await file.arrayBuffer()),
      ipKey: await clientKey(request.headers, getSecret()),
    });
    return json(result);
  } catch (err) {
    if (err instanceof InquiryImageError) return error(err.message, err.status);
    if (err instanceof StorageNotConfiguredError) return error("Bilder kan ikke lastes opp akkurat nå", 503);
    console.error("Bilde i henvendelse feilet", err);
    return error("Opplastingen feilet", 500);
  }
}

/** Den besøkende fjerner et bilde før skjemaet er sendt. Svarer likt om bildet fantes eller ikke. */
export async function DELETE(request: Request) {
  if (crossSite(request)) return error("Ingen tilgang", 403);
  const body = (await request.json().catch(() => null)) as { token?: unknown; id?: unknown } | null;
  try {
    await removePendingImage(await getDb(), await getMediaStore(), { token: String(body?.token ?? ""), imageId: String(body?.id ?? "") });
  } catch (err) {
    console.error("Fjerning av bilde feilet", err);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
