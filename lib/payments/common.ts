import { ShopError } from "@/lib/shop/catalog";
import type { PaymentEnvironment } from "./state";

/**
 * Feil fra Vipps eller Klarna, med en melding som kan vises til butikkeieren eller kunden.
 * Meldingen inneholder aldri nøkler. Den arver ShopError, så studioets handlinger viser den som den er.
 */
export class PaymentError extends ShopError {
  constructor(
    message: string,
    readonly info: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

const TIMEOUT_MS = 15_000;

export type ProviderResponse = { status: number; ok: boolean; body: unknown };

/**
 * Kaller Vipps eller Klarna. Nettverksfeil og tidsavbrudd blir PaymentError. Svaret leses som JSON når det finnes.
 * Forespørselen logges aldri, fordi hodene inneholder nøkler.
 */
export async function callProvider(name: string, url: string, init: RequestInit): Promise<ProviderResponse> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new PaymentError(`Fikk ikke kontakt med ${name}. Prøv igjen om litt.`, { status: 0 });
  }
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: res.status, ok: res.ok, body };
}

export const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
export const asString = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);
export const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/**
 * Hva ordren er knyttet til hos Vipps eller Klarna, lagret i orders.payment_ref:
 * - vipps:<miljø>:<referanse>
 * - klarna:<miljø>:hpp:<økt-ID> før kunden har betalt, klarna:<miljø>:order:<ordre-ID> etterpå
 * - kustom:<miljø>:<ordre-ID> (samme ID i Checkout API og Order Management)
 * Miljøet lagres, så en ordre betalt i testmiljøet aldri trekkes eller refunderes med produksjonsnøklene.
 */
export type PaymentRef =
  | { provider: "vipps"; environment: PaymentEnvironment; reference: string }
  | { provider: "klarna"; environment: PaymentEnvironment; kind: "hpp" | "order"; id: string }
  | { provider: "kustom"; environment: PaymentEnvironment; id: string };

export function formatPaymentRef(ref: PaymentRef): string {
  if (ref.provider === "vipps") return `vipps:${ref.environment}:${ref.reference}`;
  if (ref.provider === "kustom") return `kustom:${ref.environment}:${ref.id}`;
  return `klarna:${ref.environment}:${ref.kind}:${ref.id}`;
}

export function parsePaymentRef(value: string | null | undefined): PaymentRef | null {
  if (!value) return null;
  const vipps = /^vipps:(test|production):([A-Za-z0-9-]{8,64})$/.exec(value);
  if (vipps) return { provider: "vipps", environment: vipps[1] as PaymentEnvironment, reference: vipps[2] };
  // Bare trygge tegn, fordi ID-en brukes i adressen til API-kallene.
  const klarna = /^klarna:(test|production):(hpp|order):([A-Za-z0-9-]{1,100})$/.exec(value);
  if (klarna) return { provider: "klarna", environment: klarna[1] as PaymentEnvironment, kind: klarna[2] as "hpp" | "order", id: klarna[3] };
  const kustom = /^kustom:(test|production):([A-Za-z0-9-]{1,100})$/.exec(value);
  if (kustom) return { provider: "kustom", environment: kustom[1] as PaymentEnvironment, id: kustom[2] };
  return null;
}

// Fast navnerom for Nettgata. Samme navn gir alltid samme nøkkel, så et nytt forsøk på samme handling aldri blir to.
const NAMESPACE = "5e0b7c1a-8d2f-4f6e-9a3b-c4d5e6f70812";

/** UUID versjon 5 (RFC 4122) av et navn. Klarna anbefaler UUID som idempotensnøkkel. */
export async function idempotencyUuid(name: string): Promise<string> {
  const ns = Uint8Array.from(NAMESPACE.replace(/-/g, "").match(/../g)!, (h) => parseInt(h, 16));
  const data = new Uint8Array([...ns, ...new TextEncoder().encode(name)]);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", data)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Sammenligner uten å avsløre hvor mange tegn som stemte, via tiden det tar. */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Bare https-adresser fra betalingsløsningen sendes videre til kunden. */
export function safeRedirect(name: string, url: unknown): string {
  try {
    if (typeof url === "string" && new URL(url).protocol === "https:") return url;
  } catch {
    // faller gjennom til feilen under
  }
  throw new PaymentError(`${name} svarte uten gyldig betalingsadresse`);
}
