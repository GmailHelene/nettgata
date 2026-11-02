import { getDb } from "@/db";
import { runNightlyBackup } from "@/lib/backup";
import { cronKey, sameKey } from "@/lib/cron";
import { getMediaStore } from "@/lib/storage";
import { runRetention } from "@/lib/retention";
import { getEmailProvider } from "@/lib/email/send";
import { cleanupInactiveSites } from "@/lib/selvbetjening/opprydding";
import { platformUrl } from "@/lib/site-url";

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
  const store = await getMediaStore();
  const backup = await runNightlyBackup(db, store);
  const deleted = await runRetention(db);
  // Ubetalte nettsteder uten aktivitet: varsel etter 60 dager, sletting 14 dager senere (lib/selvbetjening/opprydding.ts).
  const inactive = await cleanupInactiveSites({ db, store, provider: getEmailProvider(), baseUrl: platformUrl() });
  console.log("Sikkerhetskopi lagret", backup, "Slettet etter reglene", deleted, "Ubetalte nettsteder", inactive);
  return Response.json({ backup, deleted, inactive });
}
