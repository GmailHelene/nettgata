import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { media, organizations, sites, users } from "@/db/schema";
import { validatePageContent } from "@/lib/content/registry";
import { MediaError, saveImage } from "@/lib/media";
import { mediaKeyPattern, mediaSrcPattern, sniffImageType } from "@/lib/media-types";
import type { MediaStore, StoredObject } from "@/lib/storage";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBPVP8 ");
const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

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
  };
}

describe("filtype fra innholdet", () => {
  it("kjenner igjen bilder og avviser alt annet", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(HTML)).toBeNull();
    expect(sniffImageType(SVG)).toBeNull();
  });
});

describe("lagring av bilder", () => {
  let db: Db;
  let siteId: string;
  let userId: string;

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db.insert(sites).values({ orgId: org.id, name: "S", slug: "s", industryPack: "handverker", theme: demoTheme }).returning();
    siteId = site.id;
    userId = user.id;
  });

  it("lagrer med riktig type og nøkkel, uavhengig av filnavn", async () => {
    const store = memoryStore();
    const { src } = await saveImage(db, store, { siteId, userId, bytes: WEBP, width: 800, height: 600 });
    expect(src).toMatch(mediaSrcPattern);
    const key = src.replace("/media/", "");
    expect(key).toMatch(mediaKeyPattern);
    expect(key.startsWith(`${siteId}/`)).toBe(true);
    expect(store.objects.get(key)?.contentType).toBe("image/webp");
    const [row] = await db.select().from(media).where(eq(media.key, key));
    expect(row).toMatchObject({ width: 800, height: 600, contentType: "image/webp" });
  });

  it("avviser forkledde filer, tomme filer og for store filer", async () => {
    const store = memoryStore();
    await expect(saveImage(db, store, { siteId, userId, bytes: HTML })).rejects.toBeInstanceOf(MediaError);
    await expect(saveImage(db, store, { siteId, userId, bytes: SVG })).rejects.toBeInstanceOf(MediaError);
    await expect(saveImage(db, store, { siteId, userId, bytes: new Uint8Array() })).rejects.toThrow(/tom/);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    await expect(saveImage(db, store, { siteId, userId, bytes: big })).rejects.toThrow(/5 MB/);
    expect(store.objects.size).toBe(0);
  });
});

describe("bildefelt i innholdet", () => {
  const src = "/media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
  const page = (bilde: unknown) => ({
    seo: {},
    sections: [{ id: "b", type: "bildetekst", variant: "bilde-venstre", props: { brodtekst: "Tekst", bilde } }],
  });

  it("krever alt-tekst, med mindre bildet er markert som pynt", () => {
    expect(validatePageContent(page({ src, alt: "Nytt bad i Åmot" })).ok).toBe(true);
    expect(validatePageContent(page({ src, alt: "", decorative: true })).ok).toBe(true);
    const missingAlt = validatePageContent(page({ src, alt: "" }));
    expect(missingAlt.ok).toBe(false);
    if (!missingAlt.ok) expect(missingAlt.errors[0].message).toMatch(/alt-tekst/);
  });

  it("godtar bare bilder fra eget lager", () => {
    for (const bad of ["https://evil.example/x.png", "javascript:alert(1)", "/media/../../etc/passwd", "/media/x.webp"]) {
      expect(validatePageContent(page({ src: bad, alt: "x" })).ok).toBe(false);
    }
  });

  it("påkrevd bilde kan ikke mangle, valgfritt kan", () => {
    expect(validatePageContent(page(null)).ok).toBe(false);
    const hero = { seo: {}, sections: [{ id: "h", type: "hero", variant: "standard", props: { overskrift: "Hei" } }] };
    expect(validatePageContent(hero).ok).toBe(true);
  });
});
