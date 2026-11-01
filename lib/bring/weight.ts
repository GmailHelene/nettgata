/** Vekten til en linje i handlekurven. weightGrams er variantens egen vekt, ellers varens. Null betyr at vekten mangler. */
export type WeighedLine = { weightGrams: number | null; quantity: number };

/**
 * Totalvekten i gram for handlekurven. Mangler vekten på minst én vare, er totalen ukjent (null),
 * og kassen bruker reserveprisen i stedet for å gjette. Varer uten vekt kan fortsatt selges.
 */
export function cartWeight(lines: WeighedLine[]): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    if (line.weightGrams === null || line.weightGrams === undefined || !Number.isFinite(line.weightGrams) || line.weightGrams < 0) return null;
    total += line.weightGrams * line.quantity;
  }
  // En pakke uten vekt kan ikke prises eller bestilles hos Bring.
  return total > 0 ? total : null;
}

/** «1,2 kg» eller «850 g», for studioet. */
export function formatWeight(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 2 })} kg` : `${grams} g`;
}
