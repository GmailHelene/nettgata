import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { inquiries, pages, rateLimitEvents, sites, users } from "@/db/schema";
import { runRetention } from "@/lib/retention";
import { BACKUP_KEEP, backupKey, createBackup, openBackup, restoreBackup, runNightlyBackup, tablesInInsertOrder, type Backup } from "@/lib/backup";
import { createSiteFromPack } from "@/lib/sites";
import type { MediaStore, StoredObject } from "@/lib/storage";

function memoryStore(): MediaStore & { objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    async put(key, data, contentType) {
      objects.set(key, { body: data, contentType, size: data.byteLength });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

let db: Db;
let userId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x", isPlatformAdmin: true }).returning();
  userId = user.id;
  const site = await createSiteFromPack(db, { name: "Salong Test", packKey: "frisor", themeKey: "atelier", info: demoInfo, ownerId: userId });
  await db.insert(inquiries).values({ siteId: site.id, name: "Kari", email: "kari@test.no", message: "Har dere ledig time?" });
});

describe("sikkerhetskopi", () => {
  it("legger foreldre før barn, så fremmednøklene stemmer ved gjenoppretting", () => {
    const names = tablesInInsertOrder().map((t) => (t as unknown as { [k: symbol]: string })[Symbol.for("drizzle:Name")]);
    expect(names.indexOf("organizations")).toBeLessThan(names.indexOf("sites"));
    expect(names.indexOf("sites")).toBeLessThan(names.indexOf("pages"));
    expect(names.indexOf("sites")).toBeLessThan(names.indexOf("inquiries"));
  });

  it("tar med alt og kan gjenopprettes i en ny database, med datoer og innhold intakt", async () => {
    const backup = JSON.parse(JSON.stringify(await createBackup(db))) as Backup;
    expect(backup.tables.sites).toHaveLength(1);
    expect(backup.tables.pages.length).toBeGreaterThan(2);

    const fresh = await createPgliteDb();
    const result = await restoreBackup(fresh, backup);
    expect(result.rows).toBeGreaterThan(5);
    const [site] = await fresh.select().from(sites);
    expect(site.name).toBe("Salong Test");
    expect(site.theme.preset).toEqual({ theme: "atelier", palette: "pudder" });
    expect(site.createdAt).toBeInstanceOf(Date);
    const restoredPages = await fresh.select().from(pages).where(eq(pages.siteId, site.id));
    const originalPages = await db.select().from(pages).where(eq(pages.siteId, site.id));
    expect(restoredPages.map((p) => p.draft)).toEqual(originalPages.map((p) => p.draft));
    expect((await fresh.select().from(inquiries))[0].message).toBe("Har dere ledig time?");
  });

  it("gjenoppretting tømmer måldatabasen først, så ingenting blir dobbelt", async () => {
    const backup = JSON.parse(JSON.stringify(await createBackup(db))) as Backup;
    await restoreBackup(db, backup);
    await restoreBackup(db, backup);
    expect(await db.select().from(sites)).toHaveLength(1);
  });

  it("lagrer komprimert hver natt og beholder bare de siste kopiene", async () => {
    const store = memoryStore();
    const first = new Date("2026-10-01T01:30:00Z");
    for (let day = 0; day < BACKUP_KEEP + 3; day++) {
      await runNightlyBackup(db, store, new Date(first.getTime() + day * 86_400_000));
    }
    const keys = await store.list("sikkerhetskopi/");
    expect(keys).toHaveLength(BACKUP_KEEP);
    expect(keys[0]).toBe(backupKey(new Date(first.getTime() + 3 * 86_400_000)));
    const latest = store.objects.get(keys.at(-1)!)!;
    expect(latest.contentType).toBe("application/octet-stream");
    // Kopien er kryptert (AES-GCM), ikke bare komprimert: den starter ikke som gzip, og en endret byte avvises.
    const body = latest.body as Uint8Array;
    expect(new TextDecoder().decode(body.slice(0, 4))).toBe("NGB1");
    const tampered = body.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(openBackup(tampered)).rejects.toThrow(/dekryptere/);
    const parsed = await openBackup(body);
    expect(parsed.tables.inquiries[0].message).toBe("Har dere ledig time?");
  });

  it("leser også kopier fra før krypteringen (bare gzip)", async () => {
    const backup = await createBackup(db);
    const stream = new Blob([JSON.stringify(backup)]).stream().pipeThrough(new CompressionStream("gzip"));
    const old = new Uint8Array(await new Response(stream).arrayBuffer());
    expect((await openBackup(old)).createdAt).toBe(backup.createdAt);
  });

  it("sletter gamle henvendelser og forsøk etter reglene, men ingenting nyere", async () => {
    const now = new Date("2027-12-01T02:00:00Z");
    const [site] = await db.select().from(sites);
    await db.insert(inquiries).values([
      { siteId: site.id, name: "Gammel", message: "Fra i fjor", createdAt: new Date("2026-11-15T10:00:00Z") },
      { siteId: site.id, name: "Ny", message: "Fra i høst", createdAt: new Date("2027-10-01T10:00:00Z") },
    ]);
    await db.insert(rateLimitEvents).values([
      { key: "login-ip:a", createdAt: new Date("2027-11-28T00:00:00Z") },
      { key: "login-ip:b", createdAt: new Date("2027-11-30T12:00:00Z") },
    ]);
    const result = await runRetention(db, now);
    expect(result.rateLimits).toBe(1);
    const names = (await db.select().from(inquiries)).map((i) => i.name).sort();
    expect(names).toEqual(["Ny"]);
  });
});
