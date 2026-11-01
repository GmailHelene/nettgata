/**
 * Bring-tjenestene butikken kan tilby i kassen, med Bring sine tjeneste-ID-er (developer.bring.com/api/services).
 * Denne filen er ren og uten hemmeligheter, så den kan lastes i nettleseren.
 *
 * Vektgrensene er fra Bring sine egne dokumenter (se docs/BRING.md):
 * - Pakke hjem i postkassen: inntil 5 kg, lengde maks 45 cm (vilkår gjeldende fra 26.01.2026)
 * - Pakke til hentested og Pakke hjem pluss: maksimum virkelig vekt 35 kg (prislister fra 1. juli 2026)
 */
export const bringProducts = {
  "3584": {
    name: "Pakke i postkassen",
    bringName: "Pakke hjem i postkassen",
    description: "Små pakker rett i postkassen. Maks 5 kg og 45 cm lang.",
    maxWeightGrams: 5_000,
  },
  "5800": {
    name: "Pakke til hentested",
    bringName: "Pakke til hentested",
    description: "Kunden henter pakken på nærmeste hentested. Maks 35 kg.",
    maxWeightGrams: 35_000,
  },
  "5600": {
    name: "Pakke levert hjem",
    bringName: "Pakke hjem pluss",
    description: "Levert hjem på døra, også på kveldstid. Maks 35 kg.",
    maxWeightGrams: 35_000,
  },
} as const;

export type BringProductId = keyof typeof bringProducts;
export const bringProductIds = Object.keys(bringProducts) as [BringProductId, ...BringProductId[]];

export function isBringProduct(id: unknown): id is BringProductId {
  return typeof id === "string" && id in bringProducts;
}

/** Koden fraktvalget får i kassen og på ordren, for eksempel «bring-5800». */
export const bringShippingCode = (product: BringProductId) => `bring-${product}`;

/** Navnet kunden ser i kassen, på kvitteringen og i e-posten. */
export const bringShippingName = (product: BringProductId) => `${bringProducts[product].name} (Bring)`;
