const DAY = 24 * 60 * 60 * 1000;
export const REFERENCE_DAYS = 30;
/**
 * Hvor lenge et avslag vises som «før»-pris etter at prisen ble satt ned. Etter dette er
 * den nye prisen ordinær pris. Valgt forsiktig; sjekkes mot regelverksradaren før lansering.
 */
export const SHOW_REDUCTION_DAYS = 30;

export type PricePoint = { priceOre: number; createdAt: Date };

/**
 * Førpris etter markedsføringsloven: laveste pris de siste 30 dagene før prisen ble satt ned.
 * Kunden skriver aldri inn en «før»-pris selv; den regnes ut av prishistorikken.
 * Returnerer null når det ikke er et ekte avslag å vise.
 */
export function beforePrice(history: PricePoint[], now = new Date()): number | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const current = sorted[sorted.length - 1];
  const changedAt = current.createdAt.getTime();
  if (now.getTime() - changedAt > SHOW_REDUCTION_DAYS * DAY) return null;

  const windowStart = changedAt - REFERENCE_DAYS * DAY;
  const earlier = sorted.slice(0, -1);
  // Prisen som gjaldt da vinduet startet, pluss alle endringer inne i vinduet.
  const inEffectAtStart = [...earlier].reverse().find((p) => p.createdAt.getTime() <= windowStart);
  const inWindow = earlier.filter((p) => p.createdAt.getTime() > windowStart);
  const candidates = [...(inEffectAtStart ? [inEffectAtStart] : []), ...inWindow].map((p) => p.priceOre);
  if (candidates.length === 0) return null;

  const lowest = Math.min(...candidates);
  return lowest > current.priceOre ? lowest : null;
}
