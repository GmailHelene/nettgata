import { asNumber, asRecord, asString, callProvider, PaymentError, type ProviderResponse } from "./common";
import type { KlarnaOrderBody } from "./klarna";
import type { PaymentEnvironment } from "./state";

/**
 * Kustom Checkout (tidligere Klarna Checkout, eget selskap siden 2024). Kunden betaler i Kustoms innebygde kasse
 * (html_snippet), som vises på en egen side hos oss (app/api/betaling/kustom). Ordren finnes hos Kustom med samme ID
 * i Checkout API og Order Management API. Den kvitteres (acknowledge) når vi har sjekket den, og trekkes når varene sendes.
 * Dokumentasjon: https://docs.kustom.co
 *
 * Varelinjene er de samme som for Klarna (klarnaOrderBody): Kustom bruker det samme formatet.
 */
export type KustomCredentials = { username: string; password: string };

export const kustomBaseUrl: Record<PaymentEnvironment, string> = {
  test: "https://api.playground.kustom.co",
  production: "https://api.kustom.co",
};

export type KustomMerchantUrls = {
  terms: string;
  checkout: string;
  confirmation: string;
  push: string;
  /** Bare med https. Kustom spør oss før kjøpet fullføres, så en kansellert ordre aldri kan betales. */
  validation?: string;
};

export type KustomCheckoutOrder = { orderId: string; status: string; htmlSnippet: string | null };

export type KustomOrder = {
  orderId: string;
  status: string;
  fraudStatus: string;
  orderAmountOre: number;
  originalOrderAmountOre: number;
  capturedOre: number;
  refundedOre: number;
  remainingAuthorizedOre: number;
  currency: string;
  reference1: string;
  reference2: string;
};

/** Feilsvar fra Kustom ({ error_code, error_messages, correlation_id }) blir en melding eieren forstår. */
function kustomError(res: ProviderResponse, action: string): PaymentError {
  const body = asRecord(res.body);
  const code = asString(body.error_code);
  const messages = Array.isArray(body.error_messages) ? body.error_messages.filter((m): m is string => typeof m === "string") : [];
  if (res.status === 401) {
    return new PaymentError(
      "Kustom godtok ikke brukernavnet og passordet. Sjekk at de er limt inn riktig, og at de hører til miljøet du har valgt (test eller produksjon).",
      { status: 401, code },
    );
  }
  const detail = [code, messages.join(" ")].filter(Boolean).join(": ").slice(0, 200);
  return new PaymentError(`Kustom avviste ${action} (${res.status}${detail ? `: ${detail}` : ""})`, { status: res.status, code });
}

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

/** merchant_reference1 kan komme som tall (eksempelet i dokumentasjonen), så begge leses som tekst. */
const asText = (value: unknown) => (typeof value === "number" ? String(value) : (asString(value) ?? ""));

export type KustomClient = ReturnType<typeof kustomClient>;

export function kustomClient(environment: PaymentEnvironment, creds: KustomCredentials) {
  const base = kustomBaseUrl[environment];
  const authorization = `Basic ${toBase64(`${creds.username}:${creds.password}`)}`;

  /** Idempotensnøkkel bare på Order Management. Checkout API tar ikke imot den. */
  function call(method: "GET" | "POST", path: string, opts: { body?: unknown; idempotencyKey?: string } = {}) {
    return callProvider("Kustom", `${base}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        "User-Agent": "Nettgata/1.0",
        ...(opts.idempotencyKey && { "Kustom-Idempotency-Key": opts.idempotencyKey }),
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
    });
  }

  const id = (value: string) => encodeURIComponent(value);

  const readCheckout = (body: unknown, fallbackId?: string): KustomCheckoutOrder => {
    const o = asRecord(body);
    const orderId = asString(o.order_id) ?? fallbackId;
    if (!orderId) throw new PaymentError("Kustom svarte uten ordre-ID");
    return { orderId, status: (asString(o.status) ?? "ukjent").toLowerCase(), htmlSnippet: asString(o.html_snippet) ?? null };
  };

  return {
    environment,

    /** Lager kassen hos Kustom. Uten idempotensnøkkel (Checkout API har ingen), så kallet sendes bare én gang. */
    async createCheckout(body: KlarnaOrderBody, merchantUrls: KustomMerchantUrls): Promise<KustomCheckoutOrder> {
      const res = await call("POST", "/checkout/v3/orders", {
        body: {
          ...body,
          merchant_urls: merchantUrls,
          // Svarer ikke valideringen vår, stoppes kjøpet i stedet for å slippe gjennom.
          ...(merchantUrls.validation && { options: { require_validate_callback_success: true } }),
        },
      });
      if (!res.ok) throw kustomError(res, "kassen");
      return readCheckout(res.body);
    },

    /** Kassen slik den står nå, med en fersk html_snippet. 404 betyr at den er utløpt (48 timer). */
    async getCheckout(orderId: string): Promise<KustomCheckoutOrder> {
      const res = await call("GET", `/checkout/v3/orders/${id(orderId)}`);
      if (!res.ok) throw kustomError(res, "oppslaget av kassen");
      return readCheckout(res.body, orderId);
    },

    /** Ordren i Order Management. Den finnes først når kunden har fullført kjøpet. */
    async getOrder(orderId: string): Promise<KustomOrder> {
      const res = await call("GET", `/ordermanagement/v1/orders/${id(orderId)}`);
      if (!res.ok) throw kustomError(res, "oppslaget av ordren");
      const o = asRecord(res.body);
      const orderAmountOre = asNumber(o.order_amount) ?? -1;
      return {
        orderId,
        status: asString(o.status) ?? "UKJENT",
        fraudStatus: asString(o.fraud_status) ?? "UKJENT",
        orderAmountOre,
        originalOrderAmountOre: asNumber(o.original_order_amount) ?? orderAmountOre,
        capturedOre: asNumber(o.captured_amount) ?? 0,
        refundedOre: asNumber(o.refunded_amount) ?? 0,
        remainingAuthorizedOre: asNumber(o.remaining_authorized_amount) ?? 0,
        currency: (asString(o.purchase_currency) ?? "").toUpperCase(),
        reference1: asText(o.merchant_reference1),
        reference2: asText(o.merchant_reference2),
      };
    },

    /** Forteller Kustom at ordren er mottatt. Da slutter Kustom å sende push. */
    async acknowledge(orderId: string, idempotencyKey: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/acknowledge`, { idempotencyKey });
      if (!res.ok) throw kustomError(res, "kvitteringen av ordren");
    },

    async capture(
      orderId: string,
      amountOre: number,
      idempotencyKey: string,
      shipping?: { company: string; trackingNumber: string; trackingUri: string | null },
    ): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/captures`, {
        idempotencyKey,
        body: {
          captured_amount: amountOre,
          ...(shipping && {
            shipping_info: [
              {
                shipping_company: shipping.company,
                tracking_number: shipping.trackingNumber,
                ...(shipping.trackingUri && { tracking_uri: shipping.trackingUri }),
              },
            ],
          }),
        },
      });
      if (!res.ok) throw kustomError(res, "trekket");
    },

    async refund(orderId: string, amountOre: number, idempotencyKey: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/refunds`, { idempotencyKey, body: { refunded_amount: amountOre } });
      if (!res.ok) throw kustomError(res, "refusjonen");
    },

    /** Kansellerer en ordre der ingenting er trukket. */
    async cancelOrder(orderId: string, idempotencyKey: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/cancel`, { idempotencyKey });
      if (!res.ok) throw kustomError(res, "kanselleringen");
    },

    /** Frigjør det som er igjen av godkjenningen etter et delvis trekk. */
    async releaseRemaining(orderId: string, idempotencyKey: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/release-remaining-authorization`, { idempotencyKey });
      if (!res.ok) throw kustomError(res, "frigjøringen");
    },

    /**
     * «Test tilkoblingen»: slår opp en kasse som ikke finnes. Med riktig brukernavn og passord svarer Kustom 404,
     * med feil (eller nøkler fra det andre miljøet) 401. Ingenting opprettes eller endres.
     */
    async testConnection(): Promise<void> {
      const res = await call("GET", "/checkout/v3/orders/00000000-0000-4000-8000-000000000000");
      if (res.ok || res.status === 404) return;
      if (res.status === 403) {
        throw new PaymentError("Kustom godtok brukernavnet og passordet, men kontoen har ikke tilgang til Kustom Checkout ennå. Ta kontakt med Kustom.", { status: 403 });
      }
      throw kustomError(res, "testen");
    },
  };
}
