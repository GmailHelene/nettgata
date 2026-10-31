import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, media, organizations, pages, sites, users } from "@/db/schema";
import { validatePageContent } from "@/lib/content/registry";
import type { PageContent } from "@/lib/content/types";
import { deleteMedia, listMedia, MediaError, mediaUsage, saveImage, setMediaAlt } from "@/lib/media";
import { mediaKeyPattern, mediaKeysIn, mediaSrcPattern, sniffImageType } from "@/lib/media-types";
import { publishPage, restoreVersion, saveDraft } from "@/lib/publishing";
import { createProduct } from "@/lib/shop/catalog";
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

describe("bildebiblioteket", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let store: ReturnType<typeof memoryStore>;
  const upload = async () => (await saveImage(db, store, { siteId, userId, bytes: WEBP, width: 800, height: 600 })).src;
  const idOf = async (src: string) => (await db.select().from(media).where(eq(media.key, src.slice("/media/".length))))[0].id;
  const heroWith = (src: string): PageContent => ({
    seo: {},
    sections: [{ id: "h", type: "hero", variant: "bilde", props: { overskrift: "Hei", bilde: { src, alt: "Nytt bad" } } }],
  });
  const plain = { seo: {}, sections: [{ id: "t", type: "tekst", variant: "standard", props: { brodtekst: "Hei" } }] };

  beforeEach(async () => {
    db = await createPgliteDb();
    store = memoryStore();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "S", slug: "s", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme })
      .returning();
    siteId = site.id;
    userId = user.id;
  });

  it("finner bildenøkler uansett hvor dypt de ligger, og ingenting annet", async () => {
    const a = await upload();
    const b = await upload();
    const keys = mediaKeysIn({ x: [{ y: { src: a } }], z: `tekst ${b} mer`, bad: "/media/x.webp", evil: "/media/../../etc/passwd" });
    expect([...keys].sort()).toEqual([a, b].map((s) => s.slice("/media/".length)).sort());
    expect(mediaKeysIn(null).size).toBe(0);
  });

  it("viser hvor hvert bilde brukes: side, vare og logo", async () => {
    const [onPage, onProduct, logo, unused] = [await upload(), await upload(), await upload(), await upload()];
    const [page] = await db.insert(pages).values({ siteId, path: "/", title: "Forside", draft: heroWith(onPage) }).returning();
    const product = await createProduct(
      db,
      siteId,
      { name: "Lue", vatRate: 25, status: "active", images: [{ src: onProduct, alt: "Blå lue" }], variants: [{ optionValues: [], priceOre: 20000, stock: null }] },
      userId,
    );
    await db.update(sites).set({ layout: { logo: { src: logo, alt: "Logo" } } }).where(eq(sites.id, siteId));

    const usage = await mediaUsage(db, siteId);
    const labels = (src: string) => (usage.get(src.slice("/media/".length)) ?? []).map((u) => u.label);
    expect(labels(onPage)).toEqual(["Siden «Forside»"]);
    expect(usage.get(onPage.slice("/media/".length))?.[0].href).toBe(`/studio/nettsted/${siteId}/side/${page.id}`);
    expect(labels(onProduct)).toEqual(["Varen «Lue»"]);
    expect(usage.get(onProduct.slice("/media/".length))?.[0].href).toBe(`/studio/nettsted/${siteId}/varer/${product.id}`);
    expect(labels(logo)).toEqual(["Logoen"]);
    expect(labels(unused)).toEqual([]);
  });

  it("sletter bare bilder som ikke er i bruk, og fjerner dem fra lageret", async () => {
    const used = await upload();
    const unused = await upload();
    await db.insert(pages).values({ siteId, path: "/", title: "Forside", draft: heroWith(used) });

    await expect(deleteMedia(db, store, { siteId, mediaId: await idOf(used), userId })).rejects.toThrow(/Siden «Forside»/);
    expect(store.objects.has(used.slice("/media/".length))).toBe(true);

    await deleteMedia(db, store, { siteId, mediaId: await idOf(unused), userId });
    expect(store.objects.has(unused.slice("/media/".length))).toBe(false);
    expect((await listMedia(db, siteId)).map((m) => m.src)).toEqual([used]);
    const logged = await db.select().from(auditLog).where(eq(auditLog.action, "media.deleted"));
    expect(logged.map((l) => l.detail?.key)).toEqual([unused.slice("/media/".length)]);

    await expect(deleteMedia(db, store, { siteId, mediaId: "ikke-en-id", userId })).rejects.toBeInstanceOf(MediaError);
  });

  it("et slettet bilde fra en eldre versjon kan ikke publiseres igjen", async () => {
    const old = await upload();
    const [page] = await db.insert(pages).values({ siteId, path: "/om", title: "Om oss", draft: heroWith(old) }).returning();
    const v1 = await publishPage(db, page.id, userId);
    await saveDraft(db, page.id, { title: "Om oss", content: plain }, userId);
    await publishPage(db, page.id, userId);

    // Bildet finnes bare i versjon 1 nå, så det kan slettes.
    await deleteMedia(db, store, { siteId, mediaId: await idOf(old), userId });
    await expect(restoreVersion(db, page.id, v1.id, userId)).rejects.toThrow(/slettet fra bildebiblioteket/);
    await saveDraft(db, page.id, { title: "Om oss", content: heroWith(old) }, userId);
    await expect(publishPage(db, page.id, userId)).rejects.toThrow(/slettet fra bildebiblioteket/);
  });

  it("lagrer en standard beskrivelse, men bare for eget nettsted", async () => {
    const src = await upload();
    const mediaId = await idOf(src);
    await setMediaAlt(db, { siteId, mediaId, alt: "  Rørlegger monterer servant  " });
    expect((await listMedia(db, siteId))[0].alt).toBe("Rørlegger monterer servant");
    const [org] = await db.insert(organizations).values({ name: "Annen" }).returning();
    const [other] = await db.insert(sites).values({ orgId: org.id, name: "A", slug: "a", industryPack: "handverker", theme: demoTheme }).returning();
    await expect(setMediaAlt(db, { siteId: other.id, mediaId, alt: "Tatt over" })).rejects.toThrow(/Fant ikke/);
    await expect(deleteMedia(db, store, { siteId: other.id, mediaId, userId })).rejects.toThrow(/Fant ikke/);
  });
});
