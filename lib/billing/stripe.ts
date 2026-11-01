/**
 * Liten Stripe-klient med fetch. Stripe-pakken er stor, og alt som legges i Workeren gjør den tregere å starte.
 * Vi bruker bare en håndfull kall: priser, skattesatser, kunder, Checkout, kundeportalen og abonnementer.
 *
 * API-versjonen er låst, så svarene har samme form selv om kontoens standardversjon endres.
 * Webhooken i Stripe bør stå på samme versjon (se docs/BETALING-PLATTFORM.md).
 */
export const STRIPE_API_VERSION = "2026-09-30.endive";

const API = "https://api.stripe.com";

export type StripeParamValue = string | number | boolean | null | undefined | StripeParams | StripeParamValue[];
export type StripeParams = { [key: string]: StripeParamValue };

/**
 * Stripe tar imot skjemakoding med klammer: line_items[0][price]=price_123, metadata[siteId]=abc.
 * Lister får indeks, som i Stripe sine egne biblioteker. Tomme verdier (undefined, null) sendes ikke.
 */
export function encodeForm(params: StripeParams): URLSearchParams {
  const out = new URLSearchParams();
  const add = (name: string, value: StripeParamValue) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((v, i) => add(`${name}[${i}]`, v));
    else if (typeof value === "object") for (const [key, v] of Object.entries(value)) add(`${name}[${key}]`, v);
    else out.append(name, String(value));
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return out;
}

export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

export type StripeMode = "test" | "live" | "ukjent";

/** Nøkkelen sier om vi er i testmodus, uten at den vises noe sted. Gjelder også begrensede nøkler (rk_). */
export function keyMode(key: string): StripeMode {
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return "ukjent";
}

export interface StripeClient {
  readonly mode: StripeMode;
  get<T>(path: string, params?: StripeParams): Promise<T>;
  post<T>(path: string, params?: StripeParams, options?: { idempotencyKey?: string }): Promise<T>;
}

export function createStripeClient(secretKey: string, options: { fetch?: typeof fetch; timeoutMs?: number } = {}): StripeClient {
  // Slås opp ved hvert kall, så tester kan bytte ut fetch.
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(method: "GET" | "POST", path: string, params: StripeParams | undefined, idempotencyKey?: string): Promise<T> {
    const encoded = params ? encodeForm(params).toString() : "";
    const url = method === "GET" && encoded ? `${API}${path}?${encoded}` : `${API}${path}`;
    const headers: Record<string, string> = { authorization: `Bearer ${secretKey}`, "stripe-version": STRIPE_API_VERSION };
    if (method === "POST") headers["content-type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    let res: Response;
    try {
      res = await doFetch(url, { method, headers, body: method === "POST" ? encoded : undefined, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new StripeApiError(0, `Fikk ikke kontakt med Stripe (${err instanceof Error ? err.message : String(err)})`);
    }
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (!res.ok) {
      throw new StripeApiError(res.status, `Stripe svarte ${res.status}: ${body?.error?.message ?? "ukjent feil"}`, body?.error?.code);
    }
    return body as T;
  }

  return {
    mode: keyMode(secretKey),
    get: (path, params) => request("GET", path, params),
    post: (path, params, opts) => request("POST", path, params, opts?.idempotencyKey),
  };
}

/** null når STRIPE_SECRET_KEY mangler. Da sier studioet at kortbetaling ikke er slått på. */
export function getStripe(): StripeClient | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? createStripeClient(key) : null;
}

const REQUIRED = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

/** Hemmelighetene som mangler på Workeren. Vises bare for plattformadmin. */
export function missingBillingConfig(): string[] {
  return REQUIRED.filter((key) => !process.env[key]?.trim());
}

/** Et felt som enten er en id eller et utvidet objekt, avhengig av expand. */
export type StripeRef = string | { id: string } | null | undefined;

export function refId(ref: StripeRef): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : (ref.id ?? null);
}

// ---------- Formene vi leser. Bare feltene koden bruker. ----------

export type StripeList<T> = { object: "list"; data: T[]; has_more: boolean };

export type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  lookup_key: string | null;
  type: "one_time" | "recurring";
  recurring: { interval: string; interval_count: number } | null;
  tax_behavior?: "exclusive" | "inclusive" | "unspecified" | null;
};

export type StripeTaxRate = {
  id: string;
  active: boolean;
  percentage: number;
  inclusive: boolean;
  country: string | null;
  jurisdiction: string | null;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  mode: string;
  status: "open" | "complete" | "expired" | null;
  payment_status: string;
  client_reference_id: string | null;
  customer: StripeRef;
  subscription: StripeRef;
  metadata: Record<string, string> | null;
};

export type StripeSubscriptionItem = {
  id: string;
  price: StripePrice;
  /** Fra API-versjon 2025-03-31.basil ligger perioden på hver linje, ikke på abonnementet. */
  current_period_end?: number;
};

export type StripeSubscription = {
  id: string;
  status: string;
  customer: StripeRef;
  metadata: Record<string, string> | null;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  /** Bare i eldre API-versjoner. */
  current_period_end?: number;
  items: { data: StripeSubscriptionItem[] };
};

export type StripeInvoice = {
  id: string;
  /** Fra 2025-03-31.basil: abonnementet ligger under parent.subscription_details. */
  parent?: { subscription_details?: { subscription?: StripeRef; metadata?: Record<string, string> | null } | null } | null;
  /** Eldre API-versjoner. */
  subscription?: StripeRef;
};

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: Record<string, unknown> };
};
