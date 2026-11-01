import type { StripeEvent } from "./stripe";

/**
 * Sjekker at en webhook faktisk kommer fra Stripe. Uten denne kunne hvem som helst sende en falsk
 * «betalt»-hendelse og få et abonnement uten å betale.
 *
 * Stripe-Signature ser slik ut: t=1700000000,v1=<hex>,v1=<hex>. v1 er HMAC-SHA256 av «t.rå-innhold» med
 * webhook-hemmeligheten (hele whsec_-strengen) som nøkkel. Mens en hemmelighet byttes, sendes én v1 per
 * hemmelighet, så det holder at én stemmer. Tidsstempelet er med i signaturen, og en gammel hendelse
 * avvises, så en oppfanget melding ikke kan spilles av igjen senere.
 */

/** Samme som Stripe sine egne biblioteker: fem minutter. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureFailure = "mangler" | "format" | "signatur" | "tidspunkt";

export class WebhookSignatureError extends Error {
  constructor(
    readonly reason: SignatureFailure,
    message: string,
  ) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function parseHeader(header: string): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1") signatures.push(value);
  }
  return timestamp !== null && signatures.length ? { timestamp, signatures } : null;
}

/**
 * Returnerer hendelsen når signaturen stemmer og den er fersk. Kaster WebhookSignatureError ellers.
 * payload må være det rå innholdet slik Stripe sendte det, ikke JSON som er lest og skrevet på nytt.
 */
export async function verifyStripeSignature(
  payload: string | Uint8Array,
  header: string | null,
  secret: string,
  options: { toleranceSeconds?: number; now?: Date } = {},
): Promise<StripeEvent> {
  if (!header) throw new WebhookSignatureError("mangler", "Mangler Stripe-Signature");
  const parsed = parseHeader(header);
  if (!parsed) throw new WebhookSignatureError("format", "Stripe-Signature har feil format");

  const body = typeof payload === "string" ? encoder.encode(payload) : payload;
  const prefix = encoder.encode(`${parsed.timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let valid = false;
  for (const candidate of parsed.signatures) {
    const bytes = hexToBytes(candidate);
    // verify sammenligner i konstant tid, så svartiden røper ikke hvor mye av signaturen som stemte.
    if (bytes && (await crypto.subtle.verify("HMAC", key, bytes, signed))) {
      valid = true;
      break;
    }
  }
  if (!valid) throw new WebhookSignatureError("signatur", "Signaturen stemmer ikke");

  const tolerance = options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    throw new WebhookSignatureError("tidspunkt", "Hendelsen er for gammel, eller klokka går feil");
  }

  let event: unknown;
  try {
    event = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new WebhookSignatureError("format", "Innholdet er ikke gyldig JSON");
  }
  const e = event as Partial<StripeEvent> | null;
  if (!e || typeof e.id !== "string" || typeof e.type !== "string" || !e.data || typeof e.data.object !== "object" || !e.data.object) {
    throw new WebhookSignatureError("format", "Innholdet er ikke en hendelse fra Stripe");
  }
  return e as StripeEvent;
}
