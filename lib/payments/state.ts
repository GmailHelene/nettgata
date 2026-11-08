import { z } from "zod";

/**
 * Vipps og Klarna: kunden sendes videre og betaler der, og pengene går rett til butikken.
 * Hver butikk har egen avtale og egne nøkler. Plattformen rører aldri pengene.
 *
 * Denne filen er ren og uten hemmeligheter, så lib/shop/settings.ts kan bruke den
 * (den filen lastes også i nettleseren).
 */
export const keyProviders = ["vipps", "klarna", "kustom"] as const;
/** Løsningene der butikken limer inn egne nøkler. Stripe kobles til med en knapp i stedet (stripeConnectSchema under). */
export type KeyProvider = (typeof keyProviders)[number];

export const onlineProviders = [...keyProviders, "stripe"] as const;
export type OnlineProvider = (typeof onlineProviders)[number];

export const paymentEnvironments = ["test", "production"] as const;
export type PaymentEnvironment = (typeof paymentEnvironments)[number];

export const providerNames: Record<OnlineProvider, string> = { vipps: "Vipps", klarna: "Klarna", kustom: "Kustom", stripe: "Stripe" };

/**
 * Slik ligger oppsettet i sites.shop.paymentProviders.<vipps|klarna|kustom>. Nøklene ligger kryptert i secret
 * (lib/payments/crypto.ts). Resten er ikke hemmelig.
 */
export const storedProviderSchema = z.object({
  environment: z.enum(paymentEnvironments),
  /** Kryptert JSON med nøklene, formatet v1:iv:ciphertext. Dekrypteres bare på serveren rett før et kall. */
  secret: z.string().startsWith("v1:"),
  /** De fire siste tegnene i klient-ID-en eller brukernavnet, så eieren kjenner igjen nøklene. */
  hint: z.string().max(4),
  savedAt: z.string(),
  /** Når testen sist lyktes med akkurat disse nøklene. Null betyr ikke testet eller feilet. */
  testedAt: z.string().nullable().default(null),
  /** Forklaring fra siste test som feilet. */
  lastError: z.string().nullable().default(null),
});
export type StoredProvider = z.infer<typeof storedProviderSchema>;

export function readStoredProvider(shop: unknown, provider: KeyProvider): StoredProvider | null {
  if (!shop || typeof shop !== "object") return null;
  const all = (shop as { paymentProviders?: unknown }).paymentProviders;
  if (!all || typeof all !== "object") return null;
  const parsed = storedProviderSchema.safeParse((all as Record<string, unknown>)[provider]);
  return parsed.success ? parsed.data : null;
}

/**
 * Kort med Stripe (Connect). Butikken får sin egen Stripe-konto gjennom Stripes egen registrering, og betalingene skjer
 * direkte på den kontoen. Plattformen har bare konto-ID-en, som ikke er hemmelig, og rører aldri pengene.
 */
export const stripeConnectSchema = z.object({
  accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
  environment: z.enum(paymentEnvironments),
  /** Stripe har godkjent kontoen for kortbetaling. Først da vises kort i kassen. */
  chargesEnabled: z.boolean().default(false),
  /** Eieren er ferdig med skjemaet hos Stripe. Stripe kan fortsatt være i gang med kontrollen. */
  detailsSubmitted: z.boolean().default(false),
  connectedAt: z.string(),
});
export type StripeConnect = z.infer<typeof stripeConnectSchema>;

export function readStripeConnect(shop: unknown): StripeConnect | null {
  if (!shop || typeof shop !== "object") return null;
  const parsed = stripeConnectSchema.safeParse((shop as { stripeConnect?: unknown }).stripeConnect);
  return parsed.success ? parsed.data : null;
}

export type ReadyProviders = Partial<Record<OnlineProvider, { environment: PaymentEnvironment }>>;

/** Løsningene kassen kan vise: nøklene er lagt inn og koblingen er testet. Sier ingenting om selve nøklene. */
export function readyProviders(shop: unknown): ReadyProviders {
  const ready: ReadyProviders = {};
  for (const provider of keyProviders) {
    const stored = readStoredProvider(shop, provider);
    if (stored?.testedAt) ready[provider] = { environment: stored.environment };
  }
  const stripe = readStripeConnect(shop);
  if (stripe?.chargesEnabled) ready.stripe = { environment: stripe.environment };
  return ready;
}
