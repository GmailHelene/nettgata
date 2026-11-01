import { getDb } from "@/db";
import { runNightlyBackup } from "@/lib/backup";
import { cronKey, sameKey } from "@/lib/cron";
import { getMediaStore } from "@/lib/storage";
import { runRetention } from "@/lib/retention";

/**
 * Nattlig sikkerhetskopi, kalt av bakgrunnsjobben i custom-worker.ts. Krever nøkkelen som er avledet
 * fra SESSION_SECRET, akkurat som domenesjekken. Etter kopien slettes det personvernerklæringene lover å slette,
 * så ingenting forsvinner før det er tatt kopi av natten.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const db = await getDb();
  const backup = await runNightlyBackup(db, await getMediaStore());
  const deleted = await runRetention(db);
  console.log("Sikkerhetskopi lagret", backup, "Slettet etter reglene", deleted);
  return Response.json({ backup, deleted });
}
