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
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL mangler i produksjon");
  }
  return createPgliteDb(".data/pglite");
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

export { schema };
