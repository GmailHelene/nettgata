import { asNumber, asRecord, asString, callProvider, PaymentError, safeRedirect, type ProviderResponse } from "./common";
import type { PaymentEnvironment } from "./state";

/**
 * Vipps MobilePay ePayment API (developer.vippsmobilepay.com/api/epayment).
 * Beløp i øre. Betalingen reserveres når kunden godkjenner (AUTHORIZED), og trekkes (capture) når varene sendes.
 */
export type VippsCredentials = { clientId: string; clientSecret: string; subscriptionKey: string; msn: string };

export const vippsBaseUrl: Record<PaymentEnvironment, string> = {
  test: "https://apitest.vipps.no",
  production: "https://api.vipps.no",
};

/** Vipps vil vite hvilket system kallene kommer fra. Maks 30 tegn per verdi. */
const SYSTEM_HEADERS = {
  "Vipps-System-Name": "Nettgata",
  "Vipps-System-Version": "1.0",
  "Vipps-System-Plugin-Name": "nettgata-nettbutikk",
  "Vipps-System-Plugin-Version": "1.0",
};

export type VippsState = "CREATED" | "AUTHORIZED" | "ABORTED" | "EXPIRED" | "TERMINATED";
export type VippsAggregate = { authorizedOre: number; cancelledOre: number; capturedOre: number; refundedOre: number };
export type VippsPayment = {
  reference: string;
  state: VippsState | string;
  amountOre: number;
  currency: string;
  aggregate: VippsAggregate;
  redirectUrl?: string;
};

/** Referansen hos Vipps: unik per salgssted, 8-64 tegn, bare bokstaver, tall og bindestrek. */
export function vippsReference(order: { id: string; number: number }): string {
  return `nettgata-${order.number}-${order.id.replace(/-/g, "").slice(0, 12)}`;
}

const money = (value: unknown) => asNumber(asRecord(value).value) ?? 0;

function readAggregate(value: unknown): VippsAggregate {
  const a = asRecord(value);
  return {
    authorizedOre: money(a.authorizedAmount),
    cancelledOre: money(a.cancelledAmount),
    capturedOre: money(a.capturedAmount),
    refundedOre: money(a.refundedAmount),
  };
}

/** Problem-svar fra Vipps (application/problem+json) blir en melding eieren forstår. Nøkler er aldri med. */
function vippsError(res: ProviderResponse, action: string): PaymentError {
  const body = asRecord(res.body);
  const title = asString(body.title) ?? asString(body.detail) ?? asString(body.error);
  if (res.status === 401) {
    return new PaymentError(
      "Vipps godtok ikke nøklene. Sjekk client_id, client_secret og abonnementsnøkkelen, og at de hører til miljøet du har valgt (test eller produksjon).",
      { status: 401 },
    );
  }
  if (res.status === 403) {
    return new PaymentError(
      "Vipps sier at nøklene ikke har tilgang til dette. Sjekk salgsstednummeret (MSN), og at salgsstedet har Vipps på nett.",
      { status: 403 },
    );
  }
  return new PaymentError(`Vipps avviste ${action} (${res.status}${title ? `: ${title.slice(0, 200)}` : ""})`, { status: res.status, code: asString(body.type) });
}

export type VippsClient = ReturnType<typeof vippsClient>;

/** Én klient per butikk og jobb. Tilgangsnøkkelen hentes første gang den trengs og gjenbrukes i klientens levetid. */
export function vippsClient(environment: PaymentEnvironment, creds: VippsCredentials) {
  const base = vippsBaseUrl[environment];
  const common = { "Ocp-Apim-Subscription-Key": creds.subscriptionKey, "Merchant-Serial-Number": creds.msn, ...SYSTEM_HEADERS };
  let token: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const res = await callProvider("Vipps", `${base}/accesstoken/get`, {
      method: "POST",
      headers: { client_id: creds.clientId, client_secret: creds.clientSecret, ...common },
    });
    if (!res.ok) throw vippsError(res, "innloggingen");
    const accessToken = asString(asRecord(res.body).access_token);
    if (!accessToken) throw new PaymentError("Vipps svarte uten tilgangsnøkkel");
    return accessToken;
  }

  function accessToken(): Promise<string> {
    if (!token) {
      const pending = fetchToken();
      token = pending;
      // En feilet henting skal ikke huskes, så neste kall prøver på nytt.
      pending.catch(() => {
        if (token === pending) token = null;
      });
    }
    return token;
  }

  async function call(method: "GET" | "POST", path: string, opts: { body?: unknown; idempotencyKey?: string } = {}) {
    return callProvider("Vipps", `${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...common,
        ...(opts.idempotencyKey && { "Idempotency-Key": opts.idempotencyKey }),
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
    });
  }

  const path = (reference: string) => `/epayment/v1/payments/${encodeURIComponent(reference)}`;

  return {
    environment,
    accessToken,

    async createPayment(input: { reference: string; amountOre: number; returnUrl: string; description: string; idempotencyKey: string }) {
      const res = await call("POST", "/epayment/v1/payments", {
        idempotencyKey: input.idempotencyKey,
        body: {
          amount: { currency: "NOK", value: input.amountOre },
          paymentMethod: { type: "WALLET" },
          reference: input.reference,
          returnUrl: input.returnUrl,
          userFlow: "WEB_REDIRECT",
          paymentDescription: input.description,
        },
      });
      if (!res.ok) throw vippsError(res, "betalingen");
      return { redirectUrl: safeRedirect("Vipps", asRecord(res.body).redirectUrl) };
    },

    /** Status rett fra Vipps. Dette er det eneste som avgjør om ordren er betalt. */
    async getPayment(reference: string): Promise<VippsPayment> {
      const res = await call("GET", path(reference));
      if (!res.ok) throw vippsError(res, "oppslaget");
      const body = asRecord(res.body);
      const amount = asRecord(body.amount);
      return {
        reference: asString(body.reference) ?? reference,
        state: asString(body.state) ?? "UKJENT",
        amountOre: asNumber(amount.value) ?? -1,
        currency: asString(amount.currency) ?? "",
        aggregate: readAggregate(body.aggregate),
        redirectUrl: asString(body.redirectUrl),
      };
    },

    async capture(reference: string, amountOre: number, idempotencyKey: string): Promise<VippsAggregate> {
      const res = await call("POST", `${path(reference)}/capture`, { idempotencyKey, body: { modificationAmount: { currency: "NOK", value: amountOre } } });
      if (!res.ok) throw vippsError(res, "trekket");
      return readAggregate(asRecord(res.body).aggregate);
    },

    async refund(reference: string, amountOre: number, idempotencyKey: string): Promise<VippsAggregate> {
      const res = await call("POST", `${path(reference)}/refund`, { idempotencyKey, body: { modificationAmount: { currency: "NOK", value: amountOre } } });
      if (!res.ok) throw vippsError(res, "refusjonen");
      return readAggregate(asRecord(res.body).aggregate);
    },

    /**
     * Frigjør det som er reservert og ikke trukket. Med transactionOnly stoppes bare en betaling kunden ikke har godkjent ennå,
     * så vi aldri frigjør en reservasjon ved et uhell når kunden godkjenner i samme øyeblikk.
     */
    async cancel(reference: string, opts: { transactionOnly: boolean; idempotencyKey: string }) {
      const res = await call("POST", `${path(reference)}/cancel`, { idempotencyKey: opts.idempotencyKey, body: { cancelTransactionOnly: opts.transactionOnly } });
      if (!res.ok) throw vippsError(res, "kanselleringen");
      return readAggregate(asRecord(res.body).aggregate);
    },

    /**
     * «Test tilkoblingen»: henter tilgangsnøkkel, og slår opp en betaling som ikke finnes. 404 betyr at
     * salgsstednummeret og abonnementsnøkkelen også virker. Ingenting opprettes eller endres.
     */
    async testConnection(): Promise<void> {
      await accessToken();
      const res = await call("GET", path("nettgata-tilkoblingstest"));
      if (res.status === 401 || res.status === 403) throw vippsError(res, "testen");
    },
  };
}
