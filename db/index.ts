import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let dbPromise: Promise<Db> | null = null;

/**
 * Produksjon: Neon over HTTP (virker i Cloudflare Workers).
 * Lokalt uten DATABASE_URL: PGlite i .data/, migrert automatisk ved første kall.
 */
export function getDb(): Promise<Db> {
  dbPromise ??= createDb();
  return dbPromise;
}

/** Brukes av tester for å kjøre mot en egen database i minnet. */
export function setDbForTests(db: Db) {
  dbPromise = Promise.resolve(db);
}

async function createDb(): Promise<Db> {
  // trim(): verdier limt inn via terminal kan få med linjeskift.
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as Db;
  }
  // NODE_ENV byttes ut med en fast verdi ved bygging. I produksjon blir grenen død kode,
  // slik at PGlite (flere MB WebAssembly) aldri havner i Cloudflare-pakken.
  if (process.env.NODE_ENV !== "production") {
    const { createPgliteDb } = await import("./pglite");
    return createPgliteDb(".data/pglite");
  }
  throw new Error("DATABASE_URL mangler i produksjon");
}

export { schema };
