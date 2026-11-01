import { after } from "next/server";
import { getDb } from "@/db";
import { notifyOrderPlaced } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { handlePaymentReturn } from "@/lib/payments/service";

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * Hit sender Vipps og Klarna kunden etter betalingen, uansett utfall. Lenken sier bare hvilken ordre det gjelder.
 * Om ordren er betalt, hentes alltid fra Vipps eller Klarna før kunden ser kvitteringssiden.
 * Kvitteringssiden har også en lenke hit, så kunden kan sjekke igjen hvis bekreftelsen kom sent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await getDb();
  const result = await handlePaymentReturn(db, {
    orderId: url.searchParams.get("ordre") ?? "",
    token: url.searchParams.get("t") ?? "",
    host: request.headers.get("host") ?? url.host,
  });
  if (!result) return new Response("Fant ikke bestillingen.", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  const paidOrderId = result.paidOrderId;
  // Ordrebekreftelsen sendes etter at kunden har fått svar, og bare av den som faktisk merket ordren som betalt.
  if (paidOrderId) after(() => notifyOrderPlaced(db, getEmailProvider(), paidOrderId).catch((err) => console.error("Ordrebekreftelsen feilet", err)));
  return new Response(null, { status: 303, headers: { ...noStore, Location: result.location } });
}
