import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/** Hvor lenge et svar gjenbrukes. Neon sovner etter 5 minutter uten trafikk, så et kall hvert 5. minutt ville holdt databasen våken døgnet rundt. */
const CACHE_SECONDS = 20 * 60;
const CACHE_KEY = "https://nettgata.no/__helse-cache";

/**
 * For oppetidsvarsling (UptimeRobot): svarer 200 når appen og databasen virker, og 503 når databasen ikke svarer.
 * Databasen spørres høyst én gang per 20 minutter, ellers gjenbrukes siste svar fra Cloudflare-cachen.
 * Viser ingen detaljer som kan hjelpe en angriper.
 */
export async function GET() {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  try {
    const hit = await cache?.match(CACHE_KEY);
    if (hit) return new Response(hit.body, { status: hit.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    // Uten cache spørres databasen direkte.
  }

  const started = Date.now();
  let status = 200;
  let body: Record<string, unknown>;
  try {
    const db = await getDb();
    await Promise.race([db.execute(sql`select 1`), new Promise((_, reject) => setTimeout(() => reject(new Error("tidsavbrudd")), 5000))]);
    body = { status: "ok", ms: Date.now() - started };
  } catch (err) {
    // Drizzle pakker inn databasefeilen, så den egentlige årsaken ligger i `cause`. Bare navn, kode og melding logges.
    const cause = (err as { cause?: { name?: string; code?: string; message?: string } })?.cause;
    console.error("Helsesjekken feilet", cause ? `${cause.name ?? "Feil"} ${cause.code ?? ""}: ${cause.message ?? ""}` : err);
    status = 503;
    body = { status: "feil" };
  }

  // Feil caches kortere, så varselet om at siden er oppe igjen ikke kommer 20 minutter for sent.
  const maxAge = status === 200 ? CACHE_SECONDS : 120;
  try {
    await cache?.put(CACHE_KEY, new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": `max-age=${maxAge}` } }));
  } catch {
    // Klarer vi ikke lagre, går det bare et ekstra kall neste gang.
  }
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
