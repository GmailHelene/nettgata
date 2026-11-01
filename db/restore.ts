import "dotenv/config";
import { readFile } from "node:fs/promises";
import type { Db } from "./index";
import { createPgliteDb } from "./pglite";
import { runScript } from "./run-script";
import { openBackup, restoreBackup } from "@/lib/backup";

/**
 * Gjenoppretter databasen fra en nattlig sikkerhetskopi. Bare for nødsituasjoner:
 * alt som ligger i måldatabasen fra før, slettes.
 *
 * 1. Hent kopien fra R2:
 *    npx wrangler r2 object get plattformen-media/sikkerhetskopi/2026-11-01.json.gz.enc --file kopi.enc --remote
 * 2. Lag en ny, tom database (for eksempel en ny gren i Neon) og migrer den til samme versjon.
 * 3. Kopien er kryptert med en nøkkel avledet fra SESSION_SECRET. Hent den som gjaldt da kopien ble tatt,
 *    fra Bitwarden, og sett den bare i terminalen du kjører fra (aldri i en fil):
 *    $env:SESSION_SECRET = "..."
 * 4. Kjør: RESTORE_FILE=kopi.enc RESTORE_CONFIRM=ja DATABASE_URL=<ny database> npx tsx db/restore.ts
 *    Uten DATABASE_URL brukes den lokale databasen i .data/pglite. Eldre kopier (.json.gz) virker også.
 */
async function main() {
  const file = process.env.RESTORE_FILE?.trim();
  if (!file) throw new Error("Sett RESTORE_FILE til sikkerhetskopien (.json.gz.enc eller .json.gz).");
  if (process.env.RESTORE_CONFIRM !== "ja") throw new Error("Dette sletter alt i måldatabasen. Sett RESTORE_CONFIRM=ja for å fortsette.");

  const backup = await openBackup(new Uint8Array(await readFile(file)));
  const url = process.env.DATABASE_URL?.trim();
  let db: Db;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url)) as unknown as Db;
  } else {
    db = await createPgliteDb(".data/pglite");
  }
  const result = await restoreBackup(db, backup);
  console.log(`Gjenopprettet ${result.rows} rader i ${result.tables} tabeller fra kopien tatt ${backup.createdAt}.`);
}

runScript(main);
