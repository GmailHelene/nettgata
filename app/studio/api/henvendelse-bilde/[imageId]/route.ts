import { getDb } from "@/db";
import { attachedImage, canViewInquiryImages, INQUIRY_IMAGE_TYPES } from "@/lib/henvendelser/bilder";
import { checkSiteAccess } from "@/lib/session";
import { getMediaStore } from "@/lib/storage";

const notFound = () => new Response("Fant ikke bildet", { status: 404, headers: { "cache-control": "no-store" } });

/**
 * Et bilde fra en henvendelse, til innboksen i studioet. Bare for eier og redaktør av nettstedet bildet hører til.
 * Svarer 404 også når tilgangen mangler, så ingen kan finne ut hvilke bilder som finnes. Aldri cache utenfor nettleseren.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const db = await getDb();
  const image = await attachedImage(db, (await params).imageId);
  if (!image) return notFound();
  const access = await checkSiteAccess(image.siteId);
  if (!access || !canViewInquiryImages(access.role)) return notFound();
  if (!INQUIRY_IMAGE_TYPES.includes(image.contentType as (typeof INQUIRY_IMAGE_TYPES)[number])) return notFound();

  const object = await (await getMediaStore()).get(image.key);
  if (!object) return notFound();
  return new Response(object.body as BodyInit, {
    headers: {
      // Typen fra databasen, som ble sjekket fra innholdet ved opplasting. Aldri det lageret eller nettleseren sier.
      "content-type": image.contentType,
      "content-length": String(object.size),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "content-disposition": "inline",
      "referrer-policy": "no-referrer",
    },
  });
}
