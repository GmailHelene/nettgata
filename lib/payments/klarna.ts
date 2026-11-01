import { allocateDiscount } from "@/lib/shop/discounts";
import { vatOf } from "@/lib/shop/money";
import { asNumber, asRecord, asString, callProvider, PaymentError, safeRedirect, type ProviderResponse } from "./common";
import type { PaymentEnvironment } from "./state";

/**
 * Klarna Payments med Hosted Payment Page (HPP): kunden sendes til Klarnas egen betalingsside, så butikken
 * slipper JavaScript fra Klarna. Ordren lages hos Klarna fra authorization_token når HPP-økten er fullført,
 * og trekkes (capture) med Order Management API når varene sendes. Europeiske adresser.
 */
export type KlarnaCredentials = { username: string; password: string };

export const klarnaBaseUrl: Record<PaymentEnvironment, string> = {
  test: "https://api.playground.klarna.com",
  production: "https://api.klarna.com",
};

export type KlarnaOrderLine = {
  type: "physical" | "shipping_fee";
  reference?: string;
  name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total_amount: number;
  total_discount_amount: number;
  total_tax_amount: number;
};

export type KlarnaOrderBody = {
  purchase_country: "NO";
  purchase_currency: "NOK";
  locale: "nb-NO";
  order_amount: number;
  order_tax_amount: number;
  order_lines: KlarnaOrderLine[];
  merchant_reference1: string;
  merchant_reference2: string;
};

type OrderForKlarna = { id: string; number: number; totalOre: number; discountOre: number; shippingOre: number; shipping: { name: string } };
type LineForKlarna = { id: string; name: string; variantLabel: string | null; sku: string | null; quantity: number; unitPriceOre: number; vatRate: number; totalOre: number };

/**
 * Varelinjene slik Klarna vil ha dem: beløp i øre med MVA, sats i hundredeler (25 % = 2500), rabatten fordelt på
 * linjene og frakten fordelt på MVA-satsene på samme måte som i resten av butikken (lib/shop/orders.ts).
 * Brukes både når økten lages og når ordren legges inn, så de to alltid er like.
 */
export function klarnaOrderBody(order: OrderForKlarna, rawLines: LineForKlarna[]): KlarnaOrderBody {
  // Fast rekkefølge, så økten og ordren får nøyaktig samme linjer.
  const lines = [...rawLines].sort((a, b) => a.id.localeCompare(b.id));
  const discounts = allocateDiscount(
    lines.map((l) => l.totalOre),
    order.discountOre,
  );
  const goods: KlarnaOrderLine[] = lines.map((l, i) => {
    const total = l.totalOre - discounts[i];
    return {
      type: "physical",
      ...(l.sku && { reference: l.sku.slice(0, 64) }),
      name: (l.variantLabel ? `${l.name} (${l.variantLabel})` : l.name).slice(0, 255),
      quantity: l.quantity,
      unit_price: l.unitPriceOre,
      tax_rate: l.vatRate * 100,
      total_amount: total,
      total_discount_amount: discounts[i],
      total_tax_amount: vatOf(total, l.vatRate),
    };
  });

  const shippingShares = allocateDiscount(
    goods.map((g) => g.total_amount),
    order.shippingOre,
  );
  const shippingByRate = new Map<number, number>();
  lines.forEach((l, i) => shippingByRate.set(l.vatRate, (shippingByRate.get(l.vatRate) ?? 0) + shippingShares[i]));
  // Er alle varene gratis, kan ikke frakten fordeles etter varebeløpet. Da følger den høyeste satsen.
  const unallocated = order.shippingOre - shippingShares.reduce((sum, s) => sum + s, 0);
  if (unallocated > 0) {
    const top = Math.max(25, ...lines.map((l) => l.vatRate));
    shippingByRate.set(top, (shippingByRate.get(top) ?? 0) + unallocated);
  }
  const rates = [...shippingByRate.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[0] - a[0]);
  const shipping: KlarnaOrderLine[] = rates.map(([rate, amount]) => ({
    type: "shipping_fee",
    name: (rates.length > 1 ? `${order.shipping.name} (${rate} % mva)` : order.shipping.name).slice(0, 255),
    quantity: 1,
    unit_price: amount,
    tax_rate: rate * 100,
    total_amount: amount,
    total_discount_amount: 0,
    total_tax_amount: vatOf(amount, rate),
  }));

  const orderLines = [...goods, ...shipping];
  const orderAmount = orderLines.reduce((sum, l) => sum + l.total_amount, 0);
  // Summen skal alltid stemme. Gjør den ikke det, er noe galt, og da sendes ingenting til Klarna.
  if (orderAmount !== order.totalOre) throw new PaymentError("Ordresummen stemmer ikke med varelinjene. Betalingen er ikke startet.");
  return {
    purchase_country: "NO",
    purchase_currency: "NOK",
    locale: "nb-NO",
    order_amount: orderAmount,
    order_tax_amount: orderLines.reduce((sum, l) => sum + l.total_tax_amount, 0),
    order_lines: orderLines,
    merchant_reference1: String(order.number),
    merchant_reference2: order.id,
  };
}

export type KlarnaHppStatus = "WAITING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "BACK" | "ERROR" | "DISABLED";

export type KlarnaOrder = {
  orderId: string;
  status: string;
  fraudStatus: string;
  orderAmountOre: number;
  originalOrderAmountOre: number;
  capturedOre: number;
  refundedOre: number;
  remainingAuthorizedOre: number;
  currency: string;
};

/** Feilsvar fra Klarna ({ error_code, error_messages, correlation_id }) blir en melding eieren forstår. */
function klarnaError(res: ProviderResponse, action: string): PaymentError {
  const body = asRecord(res.body);
  const code = asString(body.error_code);
  const messages = Array.isArray(body.error_messages) ? body.error_messages.filter((m): m is string => typeof m === "string") : [];
  if (res.status === 401) {
    return new PaymentError(
      "Klarna godtok ikke brukernavnet og passordet. Sjekk at de er limt inn riktig, og at de hører til miljøet du har valgt (test eller produksjon).",
      { status: 401, code },
    );
  }
  const detail = [code, messages.join(" ")].filter(Boolean).join(": ").slice(0, 200);
  return new PaymentError(`Klarna avviste ${action} (${res.status}${detail ? `: ${detail}` : ""})`, { status: res.status, code });
}

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

export type KlarnaClient = ReturnType<typeof klarnaClient>;

export function klarnaClient(environment: PaymentEnvironment, creds: KlarnaCredentials) {
  const base = klarnaBaseUrl[environment];
  const authorization = `Basic ${toBase64(`${creds.username}:${creds.password}`)}`;

  function call(method: "GET" | "POST" | "DELETE", path: string, opts: { body?: unknown; idempotencyKey?: string } = {}) {
    return callProvider("Klarna", `${base}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        "User-Agent": "Nettgata/1.0",
        ...(opts.idempotencyKey && { "Klarna-Idempotency-Key": opts.idempotencyKey }),
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
    });
  }

  const id = (value: string) => encodeURIComponent(value);

  return {
    environment,

    async createPaymentSession(body: KlarnaOrderBody): Promise<{ sessionId: string }> {
      const res = await call("POST", "/payments/v1/sessions", { body: { acquiring_channel: "ECOMMERCE", intent: "buy", ...body } });
      if (!res.ok) throw klarnaError(res, "betalingsøkten");
      const sessionId = asString(asRecord(res.body).session_id);
      if (!sessionId) throw new PaymentError("Klarna svarte uten økt-ID");
      return { sessionId };
    },

    /**
     * Klarnas betalingsside for økten. Alle utfall sender kunden tilbake til samme adresse hos oss,
     * og vi leser alltid utfallet fra Klarna, aldri fra adressen.
     */
    async createHppSession(paymentSessionId: string, returnUrl: string): Promise<{ sessionId: string; redirectUrl: string }> {
      const res = await call("POST", "/hpp/v1/sessions", {
        body: {
          payment_session_url: `${base}/payments/v1/sessions/${id(paymentSessionId)}`,
          merchant_urls: { success: returnUrl, cancel: returnUrl, back: returnUrl, failure: returnUrl, error: returnUrl },
          options: { place_order_mode: "NONE" },
        },
      });
      if (!res.ok) throw klarnaError(res, "betalingssiden");
      const body = asRecord(res.body);
      const sessionId = asString(body.session_id);
      if (!sessionId) throw new PaymentError("Klarna svarte uten økt-ID for betalingssiden");
      return { sessionId, redirectUrl: safeRedirect("Klarna", body.redirect_url) };
    },

    async readHppSession(sessionId: string): Promise<{ status: KlarnaHppStatus | string; authorizationToken?: string }> {
      const res = await call("GET", `/hpp/v1/sessions/${id(sessionId)}`);
      if (!res.ok) throw klarnaError(res, "oppslaget");
      const body = asRecord(res.body);
      return { status: asString(body.status) ?? "UKJENT", authorizationToken: asString(body.authorization_token) };
    },

    /** Stenger betalingssiden, så kunden ikke kan betale en ordre som er kansellert hos oss. */
    async disableHppSession(sessionId: string): Promise<void> {
      const res = await call("DELETE", `/hpp/v1/sessions/${id(sessionId)}`);
      if (!res.ok && res.status !== 404) throw klarnaError(res, "stengingen av betalingssiden");
    },

    /** Legger inn ordren hos Klarna. Samme idempotensnøkkel gir samme ordre, også om kallet sendes to ganger. */
    async createOrder(authorizationToken: string, body: KlarnaOrderBody, idempotencyKey: string): Promise<{ orderId: string; fraudStatus: string }> {
      const res = await call("POST", `/payments/v1/authorizations/${id(authorizationToken)}/order`, { body, idempotencyKey });
      if (!res.ok) throw klarnaError(res, "ordren");
      const out = asRecord(res.body);
      const orderId = asString(out.order_id);
      if (!orderId) throw new PaymentError("Klarna svarte uten ordre-ID");
      return { orderId, fraudStatus: asString(out.fraud_status) ?? "UKJENT" };
    },

    /** Frigjør en godkjenning som aldri blir til en ordre. */
    async cancelAuthorization(authorizationToken: string): Promise<void> {
      const res = await call("DELETE", `/payments/v1/authorizations/${id(authorizationToken)}`);
      if (!res.ok && res.status !== 404) throw klarnaError(res, "frigjøringen");
    },

    async getOrder(orderId: string): Promise<KlarnaOrder> {
      const res = await call("GET", `/ordermanagement/v1/orders/${id(orderId)}`);
      if (!res.ok) throw klarnaError(res, "oppslaget av ordren");
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
        currency: asString(o.purchase_currency) ?? "",
      };
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
      if (!res.ok) throw klarnaError(res, "trekket");
    },

    async refund(orderId: string, amountOre: number, idempotencyKey: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/refunds`, { idempotencyKey, body: { refunded_amount: amountOre } });
      if (!res.ok) throw klarnaError(res, "refusjonen");
    },

    /** Kansellerer en ordre der ingenting er trukket. */
    async cancelOrder(orderId: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/cancel`);
      if (!res.ok) throw klarnaError(res, "kanselleringen");
    },

    /** Frigjør det som er igjen av godkjenningen etter et delvis trekk. */
    async releaseRemaining(orderId: string): Promise<void> {
      const res = await call("POST", `/ordermanagement/v1/orders/${id(orderId)}/release-remaining-authorization`);
      if (!res.ok) throw klarnaError(res, "frigjøringen");
    },

    /**
     * «Test tilkoblingen»: slår opp en betalingsøkt som ikke finnes. Med riktig brukernavn og passord svarer Klarna
     * 404, med feil svarer Klarna 401. Ingenting opprettes eller endres.
     */
    async testConnection(): Promise<void> {
      const res = await call("GET", "/payments/v1/sessions/00000000-0000-4000-8000-000000000000");
      if (res.ok || res.status === 404) return;
      if (res.status === 403) {
        throw new PaymentError("Klarna godtok brukernavnet og passordet, men kontoen har ikke tilgang til Klarna Payments ennå. Ta kontakt med Klarna.", {
          status: 403,
        });
      }
      throw klarnaError(res, "testen");
    },
  };
}
