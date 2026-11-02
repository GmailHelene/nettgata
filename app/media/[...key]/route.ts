import { mediaFileKeyPattern, originalKey, PDF_CONTENT_TYPE } from "@/lib/media-types";
import { getMediaStore } from "@/lib/storage";

/**
 * Leverer bilder til nettstedene. Nøkkelen er unik per opplasting og endres aldri,
 * så nettleseren og CDN-et kan cache bildet for alltid.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!mediaFileKeyPattern.test(key)) return new Response("Not found", { status: 404 });

  const store = await getMediaStore();
  // Bilder lastet opp før de mindre utgavene fantes, har bare originalen. Da svarer vi med den.
  const fallback = originalKey(key);
  const object = (await store.get(key)) ?? (fallback ? await store.get(fallback) : null);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body as BodyInit, {
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.size),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      // PDF-er (meny, brosjyre) åpnes i nettleserens egen visning. Typen er sjekket ved opplasting.
      ...(key.endsWith(".pdf") && { "content-type": PDF_CONTENT_TYPE, "content-disposition": "inline" }),
    },
  });
}
