import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { getSecret } from "@/lib/secret";
import type { MediaStore } from "@/lib/storage";

/**
 * Sikkerhetskopi av hele databasen, hver natt (custom-worker.ts -> /api/cron/sikkerhetskopi).
 * Alle tabellene i db/schema.ts tas med automatisk, så nye tabeller ikke glemmes. Filen komprimeres og
 * krypteres (AES-GCM) og lagres i R2 under sikkerhetskopi/. Bilderuten deler bare ut bilde-ID-er, og selv om
 * bøtta skulle bli åpen ved en feil, er kopien uleselig uten SESSION_SECRET.
 * Gjenoppretting: db/restore.ts. Testet i tests/sikkerhetskopi.test.ts.
 */

export const BACKUP_PREFIX = "sikkerhetskopi/";
/** Så mange netter tilbake vi beholder. Neon har i tillegg sin egen historikk. */
export const BACKUP_KEEP = 30;

export type Backup = { version: 1; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));

/** Foreldre før barn, så fremmednøklene stemmer når dataene legges inn igjen. */
export function tablesInInsertOrder(): PgTable[] {
  const byName = new Map(tables.map((t) => [getTableName(t), t]));
  const done = new Set<string>();
  const ordered: PgTable[] = [];
  const visit = (table: PgTable, path: Set<string>) => {
    const name = getTableName(table);
    if (done.has(name) || path.has(name)) return;
    path.add(name);
    for (const fk of getTableConfig(table).foreignKeys) {
      const parent = getTableName(fk.reference().foreignTable);
      if (parent !== name && byName.has(parent)) visit(byName.get(parent)!, path);
    }
    done.add(name);
    ordered.push(table);
  };
  for (const table of tables) visit(table, new Set());
  return ordered;
}

/**
 * Tabeller som ikke kopieres. Besøkskodene i statistikken skal bare finnes én dag (lib/statistikk.ts),
 * og en kopi som lagres i 30 dager ville brutt det. Mangler de etter en gjenoppretting, telles dagens besøkende litt for høyt.
 */
const NOT_BACKED_UP = new Set(["visit_hashes"]);

export async function createBackup(db: Db, now = new Date()): Promise<Backup> {
  const result: Backup = { version: 1, createdAt: now.toISOString(), tables: {} };
  for (const table of tablesInInsertOrder()) {
    if (NOT_BACKED_UP.has(getTableName(table))) continue;
    result.tables[getTableName(table)] = (await db.select().from(table)) as Record<string, unknown>[];
  }
  return result;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export function backupKey(date: Date): string {
  return `${BACKUP_PREFIX}${date.toISOString().slice(0, 10)}.json.gz.enc`;
}

/** Kopiene har passordhasher, krypterte betalingsnøkler og ordretokens, så de krypteres før de lagres. */
const MAGIC = new TextEncoder().encode("NGB1");

let backupKeyPromise: Promise<CryptoKey> | null = null;
function encryptionKey(): Promise<CryptoKey> {
  // Egen etikett, så nøkkelen aldri er den samme som for økter eller betalingsnøkler.
  backupKeyPromise ??= (async () => {
    const base = await crypto.subtle.importKey("raw", new Uint8Array(getSecret()), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("nettgata-sikkerhetskopi"), info: new TextEncoder().encode("sikkerhetskopi-v1") },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return backupKeyPromise;
}

export async function sealBackup(gzipped: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), gzipped as BufferSource));
  const out = new Uint8Array(MAGIC.length + iv.length + sealed.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(sealed, MAGIC.length + iv.length);
  return out;
}

/** Leser en lagret kopi. Kopier fra før krypteringen (bare gzip) leses som før. */
export async function openBackup(data: Uint8Array): Promise<Backup> {
  const sealed = MAGIC.every((byte, i) => data[i] === byte);
  let gzipped = data;
  if (sealed) {
    const iv = data.slice(MAGIC.length, MAGIC.length + 12);
    try {
      gzipped = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(), data.slice(MAGIC.length + 12)));
    } catch {
      throw new Error("Kunne ikke dekryptere sikkerhetskopien. Bruk SESSION_SECRET som gjaldt da kopien ble tatt.");
    }
  }
  return JSON.parse(await gunzip(gzipped)) as Backup;
}

const isBackupFile = (key: string) => key.endsWith(".json.gz.enc") || key.endsWith(".json.gz");

/** Lager kopien, lagrer den og sletter kopier eldre enn de siste BACKUP_KEEP. */
export async function runNightlyBackup(db: Db, store: MediaStore, now = new Date()) {
  const backup = await createBackup(db, now);
  const data = await sealBackup(await gzip(JSON.stringify(backup)));
  const key = backupKey(now);
  await store.put(key, data, "application/octet-stream");
  // Navnet starter med datoen, så vanlig sortering gir eldste først. Gamle ukrypterte kopier telles med og forsvinner etter 30 netter.
  const keys = (await store.list(BACKUP_PREFIX)).filter(isBackupFile).sort();
  const old = keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP));
  for (const k of old) await store.delete(k);
  const rows = Object.values(backup.tables).reduce((sum, list) => sum + list.length, 0);
  return { key, bytes: data.byteLength, tables: Object.keys(backup.tables).length, rows, removed: old.length };
}

/** JSON gjør datoer om til tekst. Tilbake til Date for kolonnene som er tidspunkter. */
function revive(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const column = columns[key];
    if (!column) continue;
    out[key] = column.dataType === "date" && typeof value === "string" ? new Date(value) : value;
  }
  return out;
}

/**
 * Legger en kopi inn i en database med samme skjema (migrert til samme versjon). Alt som ligger der fra før,
 * slettes først, så bruk den bare mot en ny database eller i en nødsituasjon. Se db/restore.ts.
 */
export async function restoreBackup(db: Db, backup: Backup) {
  if (backup.version !== 1) throw new Error(`Ukjent versjon av sikkerhetskopien: ${String(backup.version)}`);
  const ordered = tablesInInsertOrder();
  const names = ordered.map((t) => `"${getTableName(t)}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${names} CASCADE`));
  let rows = 0;
  for (const table of ordered) {
    const list = backup.tables[getTableName(table)] ?? [];
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200).map((row) => revive(table, row));
      if (chunk.length) await db.insert(table).values(chunk);
      rows += chunk.length;
    }
  }
  return { tables: ordered.length, rows };
}
