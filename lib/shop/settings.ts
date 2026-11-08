import { z } from "zod";
import type { BringProductId } from "@/lib/bring/products";
import { bringCheckout, type BringCheckout } from "@/lib/bring/state";
import { readyProviders, type ReadyProviders } from "@/lib/payments/state";

/**
 * Betalingsmåter. Vipps og Klarna krever butikkens egen avtale, og vises i kassen først når nøklene er lagt inn
 * og koblingen er testet under Betaling i studioet. Klarna dekker kort, faktura og delbetaling. Kustom (tidligere
 * Klarna Checkout) er en egen kasse der kunden velger betalingsmåte inne i Kustom.
 * «stripe» er kort, med en Stripe-konto butikken kobler til med en knapp under Betaling.
 * «kort» er fra før Klarna kom. Den vises aldri, men står her så gamle innstillinger fortsatt kan leses.
 * «test» finnes bare utenfor produksjon, så hele kjøpsflyten kan prøves uten ekte penger.
 */
export const paymentMethods = ["vipps", "stripe", "klarna", "kustom", "kort", "faktura", "ved-henting", "test"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentLabels: Record<PaymentMethod, string> = {
  vipps: "Vipps",
  klarna: "Klarna",
  stripe: "Kort",
  kustom: "Kustom",
  kort: "Kort",
  faktura: "Faktura",
  "ved-henting": "Betal ved henting",
  test: "Testbetaling (bare i utvikling)",
};

/** Hva kunden må gjøre for å betale. Vises på ordresiden og i ordrebekreftelsen. */
export const paymentInstructions: Partial<Record<PaymentMethod, string>> = {
  "ved-henting": "Du betaler når du henter varene.",
  faktura: "Du får faktura fra butikken.",
  test: "Dette var en testbetaling. Ingen penger er trukket.",
};

/** Kunden sendes videre til Vipps eller Klarna og betaler der. Om ordren er betalt, avgjøres alltid av Vipps eller Klarna. */
export const onlinePaymentMethods = ["vipps", "stripe", "klarna", "kustom"] as const satisfies readonly PaymentMethod[];
export type OnlinePaymentMethod = (typeof onlinePaymentMethods)[number];

export function isOnlinePayment(method: string): method is OnlinePaymentMethod {
  return method === "vipps" || method === "stripe" || method === "klarna" || method === "kustom";
}

const shippingOptionSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]{1,30}$/, "Kode kan bare ha små bokstaver, tall og bindestrek"),
  name: z.string().trim().min(1, "Fraktvalget må ha et navn").max(60),
  priceOre: z.number().int().min(0).max(1_000_000),
  /** Hent selv trenger ikke leveringsadresse. */
  requiresAddress: z.boolean().default(true),
});
export type ShippingOption = z.infer<typeof shippingOptionSchema>;

export const shopSettingsSchema = z.object({
  shippingOptions: z
    .array(shippingOptionSchema)
    .min(1, "Butikken må ha minst ett fraktvalg")
    .max(10)
    .default([
      { code: "hent", name: "Hent selv", priceOre: 0, requiresAddress: false },
      { code: "post", name: "Sendes med posten", priceOre: 9900, requiresAddress: true },
    ]),
  freeShippingOverOre: z.number().int().min(0).nullable().default(null),
  /**
   * Betalingsmåtene butikken håndterer selv. Vipps og Klarna styres fra Betaling i studioet, ikke herfra,
   * så listen kan være tom når butikken bare tar betalt med dem. Studioet sjekker at kassen har minst én måte.
   */
  paymentMethods: z.array(z.enum(paymentMethods)).max(10).default(["ved-henting"]),
  /** Siden med kjøpsvilkår som kunden må godta i kassen. */
  termsPath: z.string().regex(/^\/[a-z0-9æøå/-]*$/).default("/kjopsvilkar"),
  /** Varianter med så få eller færre på lager vises under «Lite på lager» i oversikten. */
  lowStockAt: z.number().int().min(0).max(10_000).default(3),
});

export type ShopSettings = z.infer<typeof shopSettingsSchema> & {
  /**
   * Vipps og Klarna som er klare til bruk: nøklene er lagt inn og koblingen er testet. Avledes fra betalingsoppsettet
   * hver gang innstillingene leses, og lagres aldri herfra. Inneholder aldri nøkler.
   */
  online?: ReadyProviders;
  /**
   * Fraktvalgene med Bring: kontoen er koblet til og testet, og butikken har valgt tjenester under Frakt med Bring.
   * Avledes fra sites.shop.bring hver gang innstillingene leses, og lagres aldri herfra. Inneholder aldri nøkler.
   */
  bringShipping?: BringCheckout | null;
};

/** Leser butikkinnstillingene. Betalingsnøklene og Bring-nøklene som ligger i samme felt, blir aldri med. */
export function readShopSettings(raw: unknown): ShopSettings {
  const parsed = shopSettingsSchema.safeParse(raw ?? {});
  const settings = parsed.success ? parsed.data : shopSettingsSchema.parse({});
  return { ...settings, online: readyProviders(raw), bringShipping: bringCheckout(raw) };
}

/**
 * Et fraktvalg i kassen. Fraktvalg av typen Bring har bring satt: prisen hentes fra Bring for handlekurvens vekt og
 * kundens postnummer, og priceOre er butikkens faste reservepris når Bring ikke svarer eller vekten mangler.
 */
export type CheckoutShippingOption = ShippingOption & { bring?: { product: BringProductId; maxWeightGrams: number } };

/** Butikkens faste fraktvalg, og Bring-valgene etter dem. Et fast valg med samme kode går foran. */
export function checkoutShippingOptions(settings: ShopSettings): CheckoutShippingOption[] {
  const taken = new Set(settings.shippingOptions.map((o) => o.code));
  const bring = (settings.bringShipping?.options ?? [])
    .filter((o) => !taken.has(o.code))
    .map((o) => ({ code: o.code, name: o.name, priceOre: o.fallbackOre, requiresAddress: true, bring: { product: o.product, maxWeightGrams: o.maxWeightGrams } }));
  return [...settings.shippingOptions, ...bring];
}

/** Betalingsmåtene som faktisk kan brukes nå, i den rekkefølgen kassen viser dem. */
export function availablePaymentMethods(settings: ShopSettings): PaymentMethod[] {
  const online = onlinePaymentMethods.filter((m) => settings.online?.[m]);
  const own = settings.paymentMethods.filter((m, i, all) => {
    if (all.indexOf(m) !== i) return false;
    if (m === "test") return process.env.NODE_ENV !== "production";
    // Vipps og Klarna kommer fra betalingsoppsettet over. «kort» er erstattet av Klarna.
    return m === "faktura" || m === "ved-henting";
  });
  return [...online, ...own];
}
