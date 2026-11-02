import { getDb } from "@/db";
import { startNightly, startWeekly } from "@/lib/ai/runs";
import { getAiClient } from "@/lib/ai/client";
import { cronKey, sameKey } from "@/lib/cron";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hver natt. Sender én forespørsel per nettsted med tillegget
 * AI-teamet til Anthropic sin Batch API, og den ukentlige AI-rapporten for nettsteder uten tillegget som står
 * for tur. Svarene hentes av /api/cron/ai. Feiler den ene, prøves den andre likevel.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const client = await getAiClient();
  if (!client) return Response.json({ skipped: "ANTHROPIC_API_KEY mangler" });
  const db = await getDb();
  const [daily, weekly] = await Promise.allSettled([startNightly(db, client), startWeekly(db, client)]);
  const result = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : { error: "Batchen kunne ikke sendes" });
  const failed = daily.status === "rejected" || weekly.status === "rejected";
  return Response.json({ daily: result(daily), weekly: result(weekly) }, { status: failed ? 500 : 200 });
}
