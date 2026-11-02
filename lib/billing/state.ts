import { z } from "zod";
import { PLANS, type BillingInterval, type Plan } from "./plans";

/**
 * Abonnementet til ett nettsted, lagret i sites.billing. Stripe er fasiten: alt utenom manual og manualNote
 * skrives av webhooken (lib/billing/sync.ts) ut fra det Stripe svarer, aldri fra skjemaet kunden sender.
 *
 * Hvert felt leses for seg med .catch(), så én ødelagt verdi ikke visker ut resten. Skriving skjer alltid
 * som en sammenslåing (billing || endringer), aldri ved å skrive hele objektet på nytt.
 */
export const billingSchema = z.object({
  plan: z.enum(["nettside", "nettbutikk"]).nullable().catch(null),
  interval: z.enum(["month", "year"]).nullable().catch(null),
  addon: z.boolean().catch(false),
  /** Statusen fra Stripe (active, past_due, canceled osv.), eller «none» før første betaling. */
  status: z.string().catch("none"),
  stripeCustomerId: z.string().nullable().catch(null),
  stripeSubscriptionId: z.string().nullable().catch(null),
  /** ISO-tid. Neste fornyelse, eller når abonnementet slutter hvis det er sagt opp. */
  currentPeriodEnd: z.string().nullable().catch(null),
  cancelAtPeriodEnd: z.boolean().catch(false),
  cancelAt: z.string().nullable().catch(null),
  /** Når oppstarten (engangsbeløpet) ble betalt. */
  setupPaidAt: z.string().nullable().catch(null),
  /** Plattformadmin fakturerer kunden selv, utenom Stripe. Gir samme tilgang som et betalt abonnement. */
  manual: z.boolean().catch(false),
  manualNote: z.string().catch(""),
  /** Når tilstanden sist ble hentet fra Stripe. Et eldre svar overskriver aldri et nyere. */
  syncedAt: z.string().nullable().catch(null),
  /** De siste hendelsene fra Stripe som er behandlet, så en hendelse som sendes på nytt ikke telles to ganger. */
  events: z.array(z.string()).catch([]),
});
export type SiteBilling = z.infer<typeof billingSchema>;

export function readBilling(raw: unknown): SiteBilling {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return billingSchema.parse(value);
}

/**
 * Statusene som teller som betalende. past_due betyr at et trekk feilet og at Stripe prøver igjen.
 * Kunden beholder tilgangen mens Stripe prøver, og mister den når Stripe gir opp (canceled eller unpaid).
 */
const PAYING = new Set(["active", "trialing", "past_due"]);

/** Et abonnement som fortsatt finnes hos Stripe. Da skal kunden rette det i kundeportalen, ikke kjøpe et nytt. */
const BLOCKS_NEW_CHECKOUT = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/** Avsluttet for godt. Et slikt abonnement får aldri overskrive et nyere som fortsatt løper. */
export const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function hasActiveSubscription(raw: unknown): boolean {
  const billing = readBilling(raw);
  return billing.manual || PAYING.has(billing.status);
}

export function blocksNewCheckout(billing: SiteBilling): boolean {
  return Boolean(billing.stripeSubscriptionId) && BLOCKS_NEW_CHECKOUT.has(billing.status);
}

export const DOMAIN_NEEDS_SUBSCRIPTION = "Eget domene er med i abonnementet. Velg et abonnement under «Abonnement», så kan du koble til domenet.";

/** Eget domene krever betalende abonnement. Plattformadmin kan alltid koble til, for eksempel for piloter. */
export function canConnectDomain(raw: unknown, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || hasActiveSubscription(raw);
}

export const PUBLISH_NEEDS_SUBSCRIPTION =
  "Nettstedet kan publiseres når abonnementet er betalt. Velg abonnement under «Abonnement». Forhåndsvisningen virker som før.";

/**
 * Publisering krever betalende abonnement eller «Fakturert utenom Stripe». Plattformadmin kan alltid publisere,
 * for eksempel demo- og pilotnettsteder. Sider som alt er publisert, blir liggende ute: sperren gjelder bare nye
 * publiseringer, og forhåndsvisningen virker uansett.
 */
export function canPublish(raw: unknown, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || hasActiveSubscription(raw);
}

export type BillingTone ="ok" | "warning" | "problem" | "neutral";

export type BillingSummary = {
  /** Kort merkelapp, for eksempel «Aktivt». */
  label: string;
  tone: BillingTone;
  /** Én setning om hva som gjelder nå, eller null når merkelappen sier nok. */
  text: string | null;
};

/** Hva kunden ser øverst på abonnementssiden. formatDay gjør en ISO-tid om til en norsk dato. */
export function summarizeBilling(billing: SiteBilling, formatDay: (iso: string) => string): BillingSummary {
  if (billing.manual) {
    return { label: "Faktureres direkte", tone: "ok", text: "Abonnementet faktureres utenom kortbetaling. Ta kontakt hvis noe skal endres." };
  }
  const end = billing.cancelAt ?? billing.currentPeriodEnd;
  switch (billing.status) {
    case "active":
    case "trialing":
      if (billing.cancelAtPeriodEnd) {
        return { label: "Sagt opp", tone: "warning", text: end ? `Abonnementet varer til ${formatDay(end)}, og blir ikke fornyet.` : "Abonnementet blir ikke fornyet." };
      }
      return { label: "Aktivt", tone: "ok", text: billing.currentPeriodEnd ? `Neste betaling er ${formatDay(billing.currentPeriodEnd)}.` : null };
    case "past_due":
      return { label: "Betalingen feilet", tone: "problem", text: "Siste trekk gikk ikke gjennom. Oppdater kortet, så prøver Stripe igjen." };
    case "unpaid":
      return { label: "Ikke betalt", tone: "problem", text: "Abonnementet er stoppet fordi betalingen ikke gikk gjennom. Oppdater kortet for å starte det igjen." };
    case "paused":
      return { label: "Satt på pause", tone: "warning", text: "Abonnementet er satt på pause. Ta kontakt for å starte det igjen." };
    case "canceled":
      return { label: "Avsluttet", tone: "neutral", text: "Abonnementet er avsluttet. Du kan starte et nytt når du vil." };
    case "incomplete":
    case "incomplete_expired":
      return { label: "Ikke fullført", tone: "warning", text: "Betalingen ble ikke fullført, og ingenting er trukket." };
    default:
      return { label: "Ingen abonnement", tone: "neutral", text: "Med abonnement kan du blant annet koble til eget domene." };
  }
}

export function planLabel(plan: Plan | null): string {
  return plan ? PLANS[plan].label : "Ukjent";
}

export function intervalLabel(interval: BillingInterval | null): string {
  return interval === "year" ? "årlig" : interval === "month" ? "månedlig" : "";
}
