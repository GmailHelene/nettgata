import { getDb } from "@/db";
import { getStripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/sync";
import { verifyStripeSignature, WebhookSignatureError } from "@/lib/billing/webhook";

/**
 * Hendelser fra Stripe: https://nettgata.no/api/stripe/webhook. Hvilke hendelser som skal være slått på,
 * står i docs/BETALING-PLATTFORM.md. Ingenting skrives før signaturen er sjekket.
 *
 * Svarkodene styrer Stripe: 2xx er mottatt, alt annet sendes på nytt i opptil tre dager.
 * Derfor 503 når oppsettet mangler (hendelsene kommer igjen når hemmelighetene er satt) og 500 når
 * behandlingen feiler, men 400 for feil signatur, som aldri blir riktig av å prøve igjen.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripe = getStripe();
  if (!secret || !stripe) {
    console.error("Stripe-webhook mottatt, men STRIPE_SECRET_KEY eller STRIPE_WEBHOOK_SECRET mangler");
    return Response.json({ error: "Stripe er ikke satt opp" }, { status: 503 });
  }

  const payload = new Uint8Array(await request.arrayBuffer());
  let event;
  try {
    event = await verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn("Stripe-webhook avvist:", err.message);
      return Response.json({ error: "Ugyldig signatur" }, { status: 400 });
    }
    throw err;
  }

  try {
    const result = await handleStripeEvent(await getDb(), stripe, event);
    return Response.json({ received: true, ...result });
  } catch (err) {
    console.error(`Stripe-hendelsen ${event.type} (${event.id}) feilet`, err);
    return Response.json({ error: "Behandlingen feilet" }, { status: 500 });
  }
}
