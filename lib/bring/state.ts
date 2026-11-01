import { z } from "zod";
import { bringProductIds, bringProducts, bringShippingCode, bringShippingName, type BringProductId } from "./products";

/**
 * Bring-oppsettet slik det ligger i sites.shop.bring. Mybring-brukeren og API-nøkkelen ligger kryptert i secret
 * (lib/bring/crypto.ts). Resten er ikke hemmelig: kundenummer, fraktvalgene i kassen og avsenderadressen.
 *
 * Denne filen er ren og uten hemmeligheter, så lib/shop/settings.ts kan bruke den (den filen lastes også i nettleseren).
 */
export const bringEnvironments = ["test", "production"] as const;
export type BringEnvironment = (typeof bringEnvironments)[number];

/** Kontoen: lagres av «Koble til Bring», og må testes før Bring vises i kassen. */
export const storedBringAccountSchema = z.object({
  environment: z.enum(bringEnvironments),
  /** Kryptert JSON med Mybring-brukeren og API-nøkkelen, formatet v1:iv:ciphertext. Dekrypteres bare på serveren rett før et kall. */
  secret: z.string().startsWith("v1:"),
  /** Mybring-brukeren med det meste skjult, så eieren kjenner den igjen. */
  hint: z.string().max(80),
  /** Kundenummeret hos Bring. Gir butikkens egne priser og trengs for å bestille. */
  customerNumber: z.string().min(1).max(35),
  savedAt: z.string(),
  /** Når testen sist lyktes med akkurat disse nøklene. Null betyr ikke testet eller feilet. */
  testedAt: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
});
export type StoredBringAccount = z.infer<typeof storedBringAccountSchema>;

const text = (max: number, missing: string, tooLong: string) => z.string().trim().min(1, missing).max(max, tooLong);

/** Hvor pakkene sendes fra. Står som avsender på etiketten, og er utgangspunktet for prisen. */
export const bringSenderSchema = z.object({
  name: text(35, "Skriv navnet som skal stå som avsender", "Avsendernavnet kan ha maks 35 tegn"),
  street: text(35, "Skriv gateadressen pakkene sendes fra", "Gateadressen kan ha maks 35 tegn"),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Postnummeret til avsenderen må ha fire siffer"),
  city: text(35, "Skriv poststedet til avsenderen", "Poststedet kan ha maks 35 tegn"),
});
export type BringSender = z.infer<typeof bringSenderSchema>;

const centimeters = z.number().int("Mål pakken i hele centimeter").min(1, "Målene må være minst 1 cm").max(300, "Målene kan være maks 300 cm");

/** Fraktvalgene i kassen: lagres av «Fraktvalg med Bring». */
export const bringShippingSchema = z
  .object({
    /** Bring-tjenestene kassen viser, hver med en fast reservepris (øre) som brukes når Bring ikke svarer eller vekten mangler. */
    products: z
      .array(
        z.object({
          id: z.enum(bringProductIds),
          fallbackOre: z.number().int().min(0, "Reserveprisen kan ikke være negativ").max(1_000_000, "Reserveprisen er for høy"),
        }),
      )
      .max(bringProductIds.length),
    sender: bringSenderSchema,
    /** Vanlig pakkestørrelse. Bring trenger mål for riktig pris på Pakke til hentested og Pakke levert hjem. */
    packageCm: z.object({ length: centimeters, width: centimeters, height: centimeters }).nullable().default(null),
    /** Pakkene leveres på postkontor eller i Post i Butikk. Kan gi en annen pris hos Bring. */
    atPostOffice: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    const ids = s.products.map((p) => p.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Samme Bring-tjeneste er valgt to ganger" });
  });
export type BringShipping = z.infer<typeof bringShippingSchema>;

function bringRecord(shop: unknown): Record<string, unknown> | null {
  if (!shop || typeof shop !== "object") return null;
  const raw = (shop as { bring?: unknown }).bring;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

export function readBringAccount(shop: unknown): StoredBringAccount | null {
  const parsed = storedBringAccountSchema.safeParse(bringRecord(shop));
  return parsed.success ? parsed.data : null;
}

export function readBringShipping(shop: unknown): BringShipping | null {
  const parsed = bringShippingSchema.safeParse(bringRecord(shop));
  return parsed.success ? parsed.data : null;
}

export type BringCheckoutOption = { code: string; product: BringProductId; name: string; fallbackOre: number; maxWeightGrams: number };

/** Det kassen trenger for å vise Bring. Sier ingenting om nøklene eller kundenummeret. */
export type BringCheckout = { environment: BringEnvironment; options: BringCheckoutOption[] };

/** Bring-valgene kassen kan vise: kontoen er koblet til og testet, og butikken har valgt minst én tjeneste. */
export function bringCheckout(shop: unknown): BringCheckout | null {
  const account = readBringAccount(shop);
  const shipping = readBringShipping(shop);
  if (!account?.testedAt || !shipping || shipping.products.length === 0) return null;
  return {
    environment: account.environment,
    options: shipping.products.map((p) => ({
      code: bringShippingCode(p.id),
      product: p.id,
      name: bringShippingName(p.id),
      fallbackOre: p.fallbackOre,
      maxWeightGrams: bringProducts[p.id].maxWeightGrams,
    })),
  };
}
