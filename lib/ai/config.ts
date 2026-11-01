/**
 * Faste tall for AI-teamet (tillegget til 249 kr i måneden). Se docs/AI-TEAMET.md.
 * Prisene er Anthropic sine listepriser for Claude Opus 5.5 i dollar per million tokens (oktober 2026).
 */

export const AI_MODEL = "claude-opus-5-5";

/** Opus 5.5 tenker alltid. Middels innsats holder for forslag og gir lavere pris enn høy. */
export const AI_EFFORT = "medium" as const;

/** Rom for tenkning og svar. Svaret er sjelden mer enn 4 000 tokens. */
export const AI_MAX_TOKENS = 16_000;

const USD_PER_MILLION = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

/** Satt litt over dagens kurs, så kostnaden heller overvurderes enn undervurderes. */
export const NOK_PER_USD = 11.5;

/** Kostnadstaket per nettsted per kalendermåned, i øre. Nås det, stopper AI-teamet til neste måned. */
export const MONTHLY_CAP_ORE = 4_000;

/** Antatt pris for en kjøring som ikke er ferdig ennå, i øre. Brukes så taket holder også mens batcher venter. */
export const RUN_ESTIMATE_ORE = 300;

/** Så mange ganger i døgnet kan kunden be om nye forslag selv. */
export const MANUAL_RUNS_PER_DAY = 3;

/** Så mange forslag kan en kjøring gi. */
export const MAX_SUGGESTIONS_PER_RUN = 8;

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Kostnaden i hele øre, rundet opp. Batch API koster halvparten. */
export function costOre(usage: TokenUsage, batch: boolean): number {
  const usd =
    (usage.input_tokens * USD_PER_MILLION.input +
      usage.output_tokens * USD_PER_MILLION.output +
      (usage.cache_read_input_tokens ?? 0) * USD_PER_MILLION.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * USD_PER_MILLION.cacheWrite) /
    1_000_000;
  return Math.ceil(usd * (batch ? 0.5 : 1) * NOK_PER_USD * 100);
}
