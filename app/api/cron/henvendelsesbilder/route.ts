import { getDb } from "@/db";
import { cronKey, sameKey } from "@/lib/cron";
import { cleanupInquiryImages } from "@/lib/henvendelser/bilder";
import { getMediaStore } from "@/lib/storage";

/**
 * Hvert tiende minutt fra custom-worker.ts: sletter bilder fra kontaktskjemaer som aldri ble sendt, og bilder fra
 * henvendelser som er slettet, når de er eldre enn et døgn. Krever samme nøkkel som de andre bakgrunnsjobbene.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const deleted = await cleanupInquiryImages(await getDb(), await getMediaStore());
  if (deleted) console.log("Bilder fra henvendelser slettet", deleted);
  return Response.json({ deleted });
}
