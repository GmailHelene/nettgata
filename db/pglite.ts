import type { Db } from "./index";
import * as schema from "./schema";

/** Lokal Postgres i prosessen. Bare for utvikling, tester og skript, aldri i produksjon. */
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
