import { getDb } from "@/db";
import { cronKey, sameKey } from "@/lib/cron";
import { getEmailProvider } from "@/lib/email/send";
import { sendMonthlyReports } from "@/lib/rapport/maned";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hvert tiende minutt. De første dagene i måneden sender den
 * månedsrapporten for forrige måned, noen nettsteder om gangen. Ellers gjør den ingenting.
 * Krever nøkkelen som er avledet fra SESSION_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  return Response.json(await sendMonthlyReports(await getDb(), getEmailProvider()));
}
