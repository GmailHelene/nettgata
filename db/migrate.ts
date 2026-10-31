import "dotenv/config";
import { runScript } from "./run-script";
import { createPgliteDb } from "./pglite";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
  } else {
    await createPgliteDb(".data/pglite");
  }
  console.log("Migrering ferdig");
}

runScript(main);
