/** Valgene i «Få nettside»-skjemaet på nettgata.no. Egen fil, fordi en «use server»-fil bare kan eksportere funksjoner. */
export const needs = { nettside: "Nettside", nettbutikk: "Nettbutikk", usikker: "Usikker, vil ha råd" } as const;
export type Need = keyof typeof needs;
