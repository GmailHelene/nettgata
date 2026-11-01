import { after } from "next/server";
import { getDb } from "@/db";
import { notifyOrderPlaced } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { handleCustomerCancel } from "@/lib/payments/service";

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * «Avbryt og velg en annen betalingsmåte» på kvitteringssiden. Et vanlig skjema, så det virker uten JavaScript.
 * Krever den hemmelige nøkkelen fra kvitteringslenken. Har betalingen likevel gått gjennom, vises kvitteringen.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const db = await getDb();
  const result = await handleCustomerCancel(db, {
    orderId: String(form?.get("ordre") ?? ""),
    token: String(form?.get("t") ?? ""),
    host: request.headers.get("host") ?? new URL(request.url).host,
  });
  if (!result) return new Response("Fant ikke bestillingen.", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  const paidOrderId = result.paidOrderId;
  if (paidOrderId) after(() => notifyOrderPlaced(db, getEmailProvider(), paidOrderId).catch((err) => console.error("Ordrebekreftelsen feilet", err)));
  return new Response(null, { status: 303, headers: { ...noStore, Location: result.location } });
}
