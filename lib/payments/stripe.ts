import { createStripeClient, keyMode, StripeApiError, type StripeClient, type StripeParams } from "@/lib/billing/stripe";
import { asNumber, asRecord, asString, PaymentError, safeRedirect } from "./common";
import type { PaymentEnvironment } from "./state";

/**
 * Kort med Stripe Connect. Hver butikk har sin egen Stripe-konto, opprettet gjennom Stripes egen registrering.
 * Betalingene er direkte betalinger på butikkens konto (hodet Stripe-Account), så butikken er selger, betaler gebyrene
 * og tar imot utbetalingene. Plattformen tar ingen andel og har aldri pengene.
 *
 * Kontoen settes opp med controller-feltene under: Stripe kontrollerer bedriften og står for tap, og butikken får
 * hele Stripe-dashbordet. Da har ikke Nettgata noe ansvar for kundekontroll eller tilbakeføringer.
 *
 * Kunden betaler på Stripes egen betalingsside (Checkout), så kortnummeret aldri kommer innom oss.
 * Beløpet reserveres ved kjøp og trekkes når ordren sendes, som hos Vipps. En kortreservasjon varer normalt i sju dager.
 */

/** Hvilket miljø plattformnøkkelen gjelder. Null når nøkkelen mangler eller ikke kan tolkes. */
export function stripePlatformEnvironment(): PaymentEnvironment | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  const mode = keyMode(key);
  return mode === "live" ? "production" : mode === "test" ? "test" : null;
}

/** Feil fra Stripe blir en melding uten innhold fra forespørselen. Statusen brukes videre av bakgrunnsjobben. */
function paymentError(err: unknown, action: string): PaymentError {
  if (err instanceof PaymentError) return err;
  if (err instanceof StripeApiError) {
    if (err.status === 0) return new PaymentError("Fikk ikke kontakt med Stripe. Prøv igjen om litt.", { status: 0 });
    return new PaymentError(`Stripe avviste ${action} (${err.status}${err.code ? `: ${err.code}` : ""})`, { status: err.status, code: err.code });
  }
  throw err;
}

async function guard<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw paymentError(err, action);
  }
}

// ---------- Plattformen: oppretter og leser butikkenes kontoer ----------

export type StripeAccountState = { accountId: string; chargesEnabled: boolean; detailsSubmitted: boolean };

const readAccountState = (body: unknown): StripeAccountState => {
  const a = asRecord(body);
  const accountId = asString(a.id);
  if (!accountId) throw new PaymentError("Stripe svarte uten konto-ID");
  return { accountId, chargesEnabled: a.charges_enabled === true, detailsSubmitted: a.details_submitted === true };
};

export type StripePlatform = ReturnType<typeof stripePlatform>;

export function stripePlatform(secretKey: string) {
  const stripe = createStripeClient(secretKey);
  return {
    async createAccount(input: { siteId: string; email: string; businessName: string }, idempotencyKey: string): Promise<StripeAccountState> {
      return guard("opprettelsen av kontoen", async () =>
        readAccountState(
          await stripe.post(
            "/v1/accounts",
            {
              country: "NO",
              email: input.email,
              default_currency: "nok",
              business_profile: { name: input.businessName.slice(0, 100) },
              capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
              controller: {
                fees: { payer: "account" },
                losses: { payments: "stripe" },
                requirement_collection: "stripe",
                stripe_dashboard: { type: "full" },
              },
              metadata: { siteId: input.siteId },
            },
            { idempotencyKey },
          ),
        ),
      );
    },

    async readAccount(accountId: string): Promise<StripeAccountState> {
      return guard("oppslaget av kontoen", async () => readAccountState(await stripe.get(`/v1/accounts/${encodeURIComponent(accountId)}`)));
    },

    /** Engangslenke til Stripes registreringsskjema. Den går ut etter kort tid, så den lages rett før eieren sendes dit. */
    async onboardingLink(accountId: string, urls: { returnUrl: string; refreshUrl: string }): Promise<string> {
      return guard("lenken til registreringen", async () => {
        const link = await stripe.post<{ url?: unknown }>("/v1/account_links", {
          account: accountId,
          type: "account_onboarding",
          return_url: urls.returnUrl,
          refresh_url: urls.refreshUrl,
          collection_options: { fields: "eventually_due" },
        });
        return safeRedirect("Stripe", link.url);
      });
    },
  };
}

// ---------- Butikkens konto: betalingene ----------

export type StripeIntent = {
  id: string;
  status: string;
  amountOre: number;
  receivedOre: number;
  currency: string;
  orderId: string;
  refundedOre: number;
};

export type StripeSession = {
  id: string;
  /** open, complete eller expired */
  status: string;
  url: string | null;
  intent: StripeIntent | null;
};

const readIntent = (value: unknown): StripeIntent | null => {
  const pi = asRecord(value);
  const id = asString(pi.id);
  if (!id) return null;
  const charge = asRecord(pi.latest_charge);
  return {
    id,
    status: asString(pi.status) ?? "ukjent",
    amountOre: asNumber(pi.amount) ?? -1,
    receivedOre: asNumber(pi.amount_received) ?? 0,
    currency: (asString(pi.currency) ?? "").toUpperCase(),
    orderId: asString(asRecord(pi.metadata).orderId) ?? "",
    refundedOre: asNumber(charge.amount_refunded) ?? 0,
  };
};

const readSession = (body: unknown): StripeSession => {
  const s = asRecord(body);
  const id = asString(s.id);
  if (!id) throw new PaymentError("Stripe svarte uten betalingsøkt");
  return { id, status: asString(s.status) ?? "ukjent", url: asString(s.url) ?? null, intent: readIntent(s.payment_intent) };
};

export type StripeCheckoutInput = {
  orderId: string;
  orderNumber: number;
  amountOre: number;
  description: string;
  customerEmail: string;
  returnUrl: string;
  expiresAt: Date;
};

export type StripePayments = ReturnType<typeof stripePayments>;

export function stripePayments(secretKey: string, accountId: string, environment: PaymentEnvironment) {
  const stripe: StripeClient = createStripeClient(secretKey, { stripeAccount: accountId });
  const id = (value: string) => encodeURIComponent(value);
  const expanded: StripeParams = { expand: ["payment_intent.latest_charge"] };

  return {
    environment,
    accountId,

    /** Lager betalingssiden. Hele ordren er én linje, så summen alltid er nøyaktig det butikken har regnet ut. */
    async createCheckout(input: StripeCheckoutInput, idempotencyKey: string): Promise<{ sessionId: string; url: string }> {
      return guard("betalingen", async () => {
        const metadata = { orderId: input.orderId, orderNumber: String(input.orderNumber) };
        const session = readSession(
          await stripe.post(
            "/v1/checkout/sessions",
            {
              mode: "payment",
              locale: "nb",
              payment_method_types: ["card"],
              customer_email: input.customerEmail,
              client_reference_id: input.orderId,
              expires_at: Math.floor(input.expiresAt.getTime() / 1000),
              line_items: [{ quantity: 1, price_data: { currency: "nok", unit_amount: input.amountOre, product_data: { name: input.description.slice(0, 200) } } }],
              // Avbryter kunden, kommer den til kvitteringssiden, som tilbyr å velge en annen betalingsmåte.
              success_url: input.returnUrl,
              cancel_url: input.returnUrl,
              metadata,
              payment_intent_data: { capture_method: "manual", metadata },
            },
            { idempotencyKey },
          ),
        );
        return { sessionId: session.id, url: safeRedirect("Stripe", session.url) };
      });
    },

    async getSession(sessionId: string): Promise<StripeSession> {
      return guard("oppslaget av betalingen", async () => readSession(await stripe.get(`/v1/checkout/sessions/${id(sessionId)}`, expanded)));
    },

    /** Stenger betalingssiden, så kunden ikke kan betale en ordre som er kansellert. */
    async expireSession(sessionId: string): Promise<void> {
      await guard("stengingen av betalingen", () => stripe.post(`/v1/checkout/sessions/${id(sessionId)}/expire`, {}, { idempotencyKey: `utlop-${sessionId}` }));
    },

    async capture(intentId: string, amountOre: number, idempotencyKey: string): Promise<void> {
      await guard("trekket", () => stripe.post(`/v1/payment_intents/${id(intentId)}/capture`, { amount_to_capture: amountOre }, { idempotencyKey }));
    },

    /** Frigjør et beløp som bare er reservert. */
    async cancelIntent(intentId: string, idempotencyKey: string): Promise<void> {
      await guard("frigjøringen", () => stripe.post(`/v1/payment_intents/${id(intentId)}/cancel`, {}, { idempotencyKey }));
    },

    async refund(intentId: string, amountOre: number, idempotencyKey: string): Promise<void> {
      await guard("refusjonen", () => stripe.post("/v1/refunds", { payment_intent: intentId, amount: amountOre }, { idempotencyKey }));
    },
  };
}
