/** Alle beløp er i øre. «12 900 kr» for hele kroner, «129,50 kr» ellers. */
export function formatNok(ore: number): string {
  const whole = ore % 100 === 0;
  const amount = new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(ore / 100);
  return `${amount} kr`;
}

/** Leser «129», «129,50» eller «1 299.00» som øre. Returnerer null ved ugyldig verdi. */
export function parseNok(input: string): number | null {
  const cleaned = input.replace(/\s|kr/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** MVA-delen av et beløp inkludert MVA. */
export function vatOf(totalOre: number, ratePercent: number): number {
  return Math.round((totalOre * ratePercent) / (100 + ratePercent));
}

export const vatRates = [25, 15, 12, 0] as const;
