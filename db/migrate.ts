import "dotenv/config";
import { runScript } from "./run-script";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    // MIGRATIONS_DIR kan peke på en fastfrosset kopi av drizzle/, så en migrering som er under arbeid ikke blir med.
    await migrate(drizzle(neon(url)), { migrationsFolder: process.env.MIGRATIONS_DIR || "drizzle" });
  } else {
    // Lastes bare lokalt, så produksjonsmigreringen ikke er avhengig av skjemafilene.
    const { createPgliteDb } = await import("./pglite");
    await createPgliteDb(".data/pglite");
  }
  console.log("Migrering ferdig");
}

runScript(main);
