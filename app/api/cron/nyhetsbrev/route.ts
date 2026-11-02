import { getDb } from "@/db";
import { cronKey, sameKey } from "@/lib/cron";
import { getEmailProvider } from "@/lib/email/send";
import { processQueue } from "@/lib/nyhetsbrev/send";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hvert tiende minutt. Sender neste porsjon nyhetsbrev
 * (NEWSLETTER_PER_RUN), så store lister blir sendt litt etter litt. Krever nøkkelen som er avledet fra SESSION_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  return Response.json(await processQueue(await getDb(), getEmailProvider()));
}
