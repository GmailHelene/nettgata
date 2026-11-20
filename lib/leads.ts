/** Valgene i «Få nettside»-skjemaet på nettgata.no. Egen fil, fordi en «use server»-fil bare kan eksportere funksjoner. */
export const needs = { nettside: "Nettside", nettbutikk: "Nettbutikk", usikker: "Usikker, vil ha råd", sjekk: "Gratis sjekk av nettsiden" } as const;
export type Need = keyof typeof needs;

/** Valgene i «Få nettside»-skjemaet. Gratis sjekk har sitt eget skjema på /gratis-sjekk. */
export const leadFormNeeds = ["nettside", "nettbutikk", "usikker"] as const satisfies readonly Need[];
