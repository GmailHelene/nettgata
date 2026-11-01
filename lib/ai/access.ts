import { readBilling } from "@/lib/billing/state";

/** Statusene hos Stripe der kunden betaler (samme som i lib/billing/state.ts). */
const PAYING = new Set(["active", "trialing", "past_due"]);

/**
 * AI-teamet er bare for nettsteder med tillegget aktivt i Stripe. «Fakturert utenom Stripe» gir ikke tillegget,
 * fordi det ikke er betalt for. Fila brukes også i nettleseren.
 */
export function aiTeamActive(rawBilling: unknown): boolean {
  const billing = readBilling(rawBilling);
  return billing.addon && Boolean(billing.stripeSubscriptionId) && PAYING.has(billing.status);
}
