import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sites } from "@/db/schema";
import { fetchPickupPoints, type PickupPoint } from "./client";
import { loadBringAccess } from "./config";
import { readBringShipping } from "./state";

/**
 * Hentesteder for Pakke til hentested (5800). Kaster aldri: svarer ikke Bring, eller har butikken ikke slått på
 * tjenesten, er listen tom, og pakken går til nærmeste hentested som før. Samme postnummer gir samme liste i ti minutter,
 * per serverprosess, så kassen og ordren ikke spør Bring på nytt.
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 300;
const cache = new Map<string, { at: number; points: PickupPoint[] }>();

/** Brukes av tester. */
export function clearPickupPointCache() {
  cache.clear();
}

export async function findPickupPoints(db: Db, siteId: string, postalCode: string, now = Date.now()): Promise<PickupPoint[]> {
  if (!/^\d{4}$/.test(postalCode)) return [];
  try {
    const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
    const shipping = site ? readBringShipping(site.shop) : null;
    if (!site || !shipping?.products.some((p) => p.id === "5800")) return [];
    const access = await loadBringAccess(site);
    if (!access) return [];

    const key = JSON.stringify([site.id, access.environment, access.savedAt, postalCode]);
    const hit = cache.get(key);
    if (hit && now - hit.at <= TTL_MS) return hit.points;
    const points = await fetchPickupPoints(access.credentials, postalCode);
    // Et tomt svar huskes ikke, så en midlertidig feil ikke blir stående.
    if (points.length) {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now, points });
    }
    return points;
  } catch (err) {
    // Meldingen fra Bring inneholder aldri nøkler. Forespørselen logges ikke.
    console.warn("Bring ga ikke hentesteder, pakken går til nærmeste hentested:", err instanceof Error ? err.message : "ukjent feil");
    return [];
  }
}
