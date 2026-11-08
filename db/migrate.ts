import "dotenv/config";
import { runScript } from "./run-script";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    // MIGRATIONS_DIR kan peke på en fastfrosset kopi av drizzle/, så en migrering som er under arbeid ikke blir med.
    const folder = process.env.MIGRATIONS_DIR || "drizzle";
    const sql = neon(url);
    await migrate(drizzle(sql), { migrationsFolder: folder });
    // Bekreft at alle migreringene faktisk er i databasen, så «ferdig» aldri vises når noe mangler.
    const { readFile } = await import("node:fs/promises");
    const journal = JSON.parse(await readFile(`${folder}/meta/_journal.json`, "utf8")) as { entries: { tag: string; when: number }[] };
    const last = journal.entries.at(-1);
    // Drizzle lagrer «when» fra journalen som created_at, så den nyeste raden må være minst like ny som siste migrering.
    const [{ newest }] = (await sql`select coalesce(max(created_at), 0)::bigint as newest from drizzle.__drizzle_migrations`) as { newest: string }[];
    if (last && Number(newest) < last.when) throw new Error(`Siste migrering, ${last.tag}, er ikke i databasen.`);
    console.log(`Databasen har alle migreringene, til og med ${last?.tag ?? "ingen"}.`);
  } else {
    // Lastes bare lokalt, så produksjonsmigreringen ikke er avhengig av skjemafilene.
    const { createPgliteDb } = await import("./pglite");
    await createPgliteDb(".data/pglite");
  }
  console.log("Migrering ferdig");
}

runScript(main);
