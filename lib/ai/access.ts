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

/**
 * Den ukentlige AI-rapporten er med i grunnprisen. Den går for nettsteder uten tillegget som betaler:
 * aktivt abonnement (også når et trekk har feilet og Stripe prøver igjen) eller «Fakturert utenom Stripe».
 * En prøveperiode som ikke er betalt, gir den ikke, så forlatte prøver ikke koster noe. At nettstedet er
 * publisert, sjekkes i lib/ai/runs.ts.
 */
export function weeklyAiActive(rawBilling: unknown): boolean {
  if (aiTeamActive(rawBilling)) return false;
  const billing = readBilling(rawBilling);
  return billing.manual || billing.status === "active" || billing.status === "past_due";
}
