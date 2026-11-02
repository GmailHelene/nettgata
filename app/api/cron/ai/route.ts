import { getDb } from "@/db";
import { collectBatches } from "@/lib/ai/runs";
import { getAiClient } from "@/lib/ai/client";
import { cronKey, sameKey } from "@/lib/cron";
import { getEmailProvider } from "@/lib/email/send";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hvert tiende minutt. Henter svarene fra nattkjøringen til
 * AI-teamet (daglig og ukentlig) når Anthropic er ferdig, og sender e-posten om nye ukentlige forslag. Krever nøkkelen som er avledet fra SESSION_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const client = await getAiClient();
  if (!client) return Response.json({ skipped: "ANTHROPIC_API_KEY mangler" });
  return Response.json(await collectBatches(await getDb(), client, new Date(), getEmailProvider()));
}
