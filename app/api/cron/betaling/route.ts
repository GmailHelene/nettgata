import { getDb } from "@/db";
import { cronKey, sameKey } from "@/lib/cron";
import { notifyOrderPlaced } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { sweepPayments } from "@/lib/payments/service";

/**
 * Kalles av bakgrunnsjobben i custom-worker.ts hvert tiende minutt. Ikke åpen for andre:
 * krever nøkkelen som er avledet fra SESSION_SECRET.
 *
 * Sjekker alle ordre som venter på Vipps eller Klarna: kunder som betalte, men aldri kom tilbake til butikken,
 * får ordren betalt og ordrebekreftelsen sendt. Avbrutte og utløpte betalinger kanselleres, og varene legges tilbake.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET?.trim();
  const given = request.headers.get("x-cron-key") ?? "";
  if (!secret || !given || !sameKey(given, await cronKey(secret))) return new Response("Ikke tilgang", { status: 403 });

  const db = await getDb();
  const provider = getEmailProvider();
  return Response.json(await sweepPayments(db, { onPaid: (orderId) => notifyOrderPlaced(db, provider, orderId) }));
}
