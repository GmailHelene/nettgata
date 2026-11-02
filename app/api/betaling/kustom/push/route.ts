import { after } from "next/server";
import { getDb } from "@/db";
import { notifyOrderPlaced } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { handleKustomPush } from "@/lib/payments/service";
import { clientKey, hit } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";

const plain = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };

/**
 * Push fra Kustom (merchant_urls.push), sendt når kjøpet er fullført og på nytt etter 5, 15, 30 og 60 minutter og
 * hver fjerde time i 48 timer, til ordren er kvittert. Innholdet i forespørselen brukes ikke: ordren hentes alltid
 * fra Kustom. Adressen krever ordrenøkkelen, og Kustom-ID-en må være den som står på ordren.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("ordre") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const kustomOrderId = url.searchParams.get("kustom") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f]{48}$/.test(token) || !/^[A-Za-z0-9-]{1,100}$/.test(kustomOrderId)) {
    return new Response("Ugyldig forespørsel", { status: 400, headers: plain });
  }
  const db = await getDb();
  // Kustom sender sjelden. Grensen stopper bare noen som prøver mange ordre fra samme adresse.
  if (!(await hit(db, `kustom-push:${await clientKey(request.headers, getSecret())}`, { limit: 60, windowSeconds: 600 }))) {
    return new Response("For mange forespørsler", { status: 429, headers: plain });
  }
  try {
    const result = await handleKustomPush(db, { orderId, token, kustomOrderId });
    if (!result.found) return new Response("Fant ikke ordren", { status: 404, headers: plain });
    const paidOrderId = result.paidOrderId;
    if (paidOrderId) after(() => notifyOrderPlaced(db, getEmailProvider(), paidOrderId).catch((err) => console.error("Ordrebekreftelsen feilet", err)));
    return new Response("OK", { status: 200, headers: plain });
  } catch (err) {
    // Kustom prøver igjen senere. Bakgrunnsjobben sjekker også ordren.
    console.error("Kustom-push feilet", orderId, err instanceof Error ? err.message : "ukjent feil");
    return new Response("Prøv igjen", { status: 500, headers: plain });
  }
}
