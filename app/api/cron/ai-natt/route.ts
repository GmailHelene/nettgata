import { getDb } from "@/db";
import { startNightly } from "@/lib/ai/runs";
import { getAiClient } from "@/lib/ai/client";
import { cronKey, sameKey } from "@/lib/cron";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hver natt. Sender én forespørsel per nettsted med tillegget
 * AI-teamet til Anthropic sin Batch API. Svarene hentes av /api/cron/ai.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const client = await getAiClient();
  if (!client) return Response.json({ skipped: "ANTHROPIC_API_KEY mangler" });
  return Response.json(await startNightly(await getDb(), client));
}
