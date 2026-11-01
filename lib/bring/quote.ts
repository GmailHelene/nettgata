import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sites } from "@/db/schema";
import { fetchQuotes, type ProductQuote, type QuoteInput } from "./client";
import { loadBringAccess } from "./config";
import type { BringProductId } from "./products";
import { readBringShipping } from "./state";

export type BringPrice = {
  /** Fraktprisen kunden betaler, i øre med MVA, før butikkens egne regler om gratis frakt. */
  priceOre: number;
  /** bring: prisen kom fra Bring. reserve: butikkens faste reservepris. */
  source: "bring" | "reserve";
  /** Hvorfor reserveprisen ble brukt: vekt mangler på minst én vare, eller Bring ga ikke pris. */
  reason: "vekt" | "bring" | null;
  deliveryDays: number | null;
};

export type QuoteOption = { code: string; product: BringProductId; fallbackOre: number };

/**
 * Samme handlekurv og postnummer gir samme pris i ti minutter, så kassen ikke spør Bring på nytt for hver endring,
 * og ordren får prisen kunden så. Bare svar der alle tjenestene fikk pris, huskes. Minnet er per serverprosess.
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 300;
const cache = new Map<string, { at: number; quotes: Record<string, ProductQuote> }>();

/** Brukes av tester. */
export function clearBringQuoteCache() {
  cache.clear();
}

function cached(key: string, now: number) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.quotes;
}

function remember(key: string, quotes: Record<string, ProductQuote>, now: number) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: now, quotes });
}

/**
 * Pris for hvert Bring-valg, for handlekurvens vekt og kundens postnummer. Kaster aldri: mangler vekten, eller
 * svarer ikke Bring, får valget butikkens reservepris, så kassen aldri stopper.
 */
export async function quoteBring(
  db: Db,
  siteId: string,
  options: QuoteOption[],
  weightGrams: number | null,
  toPostalCode: string,
  now = Date.now(),
): Promise<Record<string, BringPrice>> {
  const reserve = (reason: "vekt" | "bring"): Record<string, BringPrice> =>
    Object.fromEntries(options.map((o) => [o.code, { priceOre: o.fallbackOre, source: "reserve", reason, deliveryDays: null }]));
  if (options.length === 0) return {};
  if (weightGrams === null) return reserve("vekt");

  try {
    const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
    const shipping = site ? readBringShipping(site.shop) : null;
    const access = site ? await loadBringAccess(site) : null;
    if (!site || !shipping || !access) return reserve("bring");

    const products = [...new Set(options.map((o) => o.product))].sort();
    const input: QuoteInput = {
      fromPostalCode: shipping.sender.postalCode,
      toPostalCode,
      weightGrams,
      packageCm: shipping.packageCm,
      products,
      customerNumber: access.customerNumber,
      atPostOffice: shipping.atPostOffice,
    };
    const key = JSON.stringify([site.id, access.environment, access.savedAt, input]);
    let quotes = cached(key, now);
    if (!quotes) {
      // Kort frist: kassen venter heller på reserveprisen enn på et tregt svar.
      quotes = await fetchQuotes(access.credentials, input, { timeoutMs: 8_000 });
      if (products.every((p) => quotes![p]?.priceOre)) remember(key, quotes, now);
    }
    const result: Record<string, BringPrice> = {};
    for (const o of options) {
      const q = quotes[o.product];
      result[o.code] = q?.priceOre
        ? { priceOre: q.priceOre, source: "bring", reason: null, deliveryDays: q.deliveryDays }
        : { priceOre: o.fallbackOre, source: "reserve", reason: "bring", deliveryDays: null };
    }
    return result;
  } catch (err) {
    // Meldingen fra Bring inneholder aldri nøkler. Forespørselen logges ikke.
    console.warn("Bring ga ikke pris, kassen bruker reserveprisen:", err instanceof Error ? err.message : "ukjent feil");
    return reserve("bring");
  }
}
