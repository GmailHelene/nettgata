import "dotenv/config";
import { createPgliteDb } from "./index";

async function main() {
  const url = process.env.DATABASE_URL;
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

main()
  .then(() => process.exit(0))
  .catch((err) => {
  console.error(err);
  process.exit(1);
});
