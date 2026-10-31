import { getDb } from "@/db";
import { cronKey, sameKey } from "@/lib/cron";
import { sweepDomains } from "@/lib/domains";
import { getDomainServices } from "@/lib/domains/services";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hvert tiende minutt. Ikke åpen for andre:
 * krever nøkkelen som er avledet fra SESSION_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const db = await getDb();
  const services = getDomainServices(db);
  if (!services || services.simulated) return Response.json({ skipped: "Domenekobling er ikke satt opp" });
  return Response.json(await sweepDomains(db, services));
}
