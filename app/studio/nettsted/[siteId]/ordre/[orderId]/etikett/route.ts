import { getDb } from "@/db";
import { bringLabelPdf } from "@/lib/bring/booking";
import { checkSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";

/**
 * Fraktetiketten fra Bring som PDF. Bare innloggede med tilgang til butikken får den: etiketten har kundens navn og adresse.
 * Adressen til etiketten hos Bring sendes aldri til nettleseren. PDF-en leveres herfra.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ siteId: string; orderId: string }> }) {
  const { siteId, orderId } = await params;
  const access = await checkSiteAccess(siteId);
  if (!access) return new Response("Ikke tilgang", { status: 403 });
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return new Response("Fant ikke etiketten", { status: 404 });
  try {
    const label = await bringLabelPdf(await getDb(), access.site.id, orderId);
    if (!label) return new Response("Fant ikke etiketten", { status: 404 });
    return new Response(label.body as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${label.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ShopError) return new Response(err.message, { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
    throw err;
  }
}
