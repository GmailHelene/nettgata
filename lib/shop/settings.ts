import { z } from "zod";

/**
 * Betalingsmåter. Vipps og kort krever avtale per butikk og vises først når de er koblet til.
 * «test» finnes bare utenfor produksjon, så hele kjøpsflyten kan prøves uten ekte penger.
 */
export const paymentMethods = ["vipps", "kort", "faktura", "ved-henting", "test"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentLabels: Record<PaymentMethod, string> = {
  vipps: "Vipps",
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
  paymentMethods: z.array(z.enum(paymentMethods)).min(1).default(["ved-henting"]),
  /** Siden med kjøpsvilkår som kunden må godta i kassen. */
  termsPath: z.string().regex(/^\/[a-z0-9æøå/-]*$/).default("/kjopsvilkar"),
  /** Varianter med så få eller færre på lager vises under «Lite på lager» i oversikten. */
  lowStockAt: z.number().int().min(0).max(10_000).default(3),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export function readShopSettings(raw: unknown): ShopSettings {
  const parsed = shopSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : shopSettingsSchema.parse({});
}

/** Betalingsmåtene som faktisk kan brukes nå. */
export function availablePaymentMethods(settings: ShopSettings): PaymentMethod[] {
  return settings.paymentMethods.filter((m) => {
    if (m === "test") return process.env.NODE_ENV !== "production";
    // Vipps og kort kobles til i neste steg; til da er de ikke valgbare i kassen.
    return m !== "vipps" && m !== "kort";
  });
}
