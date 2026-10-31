import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, media, pageVersions, pages, products, sites } from "@/db/schema";
import { imageTypes, MAX_IMAGE_BYTES, mediaKeysIn, sniffImageType, VARIANT_WIDTHS, variantKey } from "@/lib/media-types";
import type { MediaStore } from "@/lib/storage";

export class MediaError extends Error {}

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

export type MediaItem = {
  id: string;
  src: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  createdAt: string;
};

/** Alle bildene til nettstedet, nyeste først. */
export async function listMedia(db: Db, siteId: string): Promise<MediaItem[]> {
  const rows = await db.select().from(media).where(eq(media.siteId, siteId)).orderBy(desc(media.createdAt));
  return rows.map((r) => ({
    id: r.id,
    src: `/media/${r.key}`,
    size: r.size,
    width: r.width,
    height: r.height,
    alt: r.alt,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type MediaUsage = { label: string; href: string };

/**
 * Hvor hvert bilde brukes nå, per nøkkel: kladden og den publiserte versjonen av hver side, varene og
 * logoen. Eldre versjoner teller ikke. Går noen tilbake til en av dem, stopper publiseringen hvis bildet
 * er slettet (se missingMedia).
 */
export async function mediaUsage(db: Db, siteId: string): Promise<Map<string, MediaUsage[]>> {
  const base = `/studio/nettsted/${siteId}`;
  const [pageRows, productRows, siteRows] = await Promise.all([
    db
      .select({ id: pages.id, title: pages.title, draft: pages.draft, published: pageVersions.content })
      .from(pages)
      .leftJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
      .where(eq(pages.siteId, siteId)),
    db.select({ id: products.id, name: products.name, images: products.images }).from(products).where(eq(products.siteId, siteId)),
    db.select({ layout: sites.layout }).from(sites).where(eq(sites.id, siteId)),
  ]);
  const usage = new Map<string, MediaUsage[]>();
  const add = (keys: Iterable<string>, entry: MediaUsage) => {
    for (const key of keys) usage.set(key, [...(usage.get(key) ?? []), entry]);
  };
  for (const p of pageRows) {
    add(new Set([...mediaKeysIn(p.draft), ...mediaKeysIn(p.published)]), { label: `Siden «${p.title}»`, href: `${base}/side/${p.id}` });
  }
  for (const p of productRows) add(mediaKeysIn(p.images), { label: `Varen «${p.name}»`, href: `${base}/varer/${p.id}` });
  for (const s of siteRows) add(mediaKeysIn(s.layout), { label: "Logoen", href: `${base}/innstillinger` });
  return usage;
}

/** Bilder innholdet viser til som ikke finnes i nettstedets bibliotek, for eksempel fordi de er slettet. */
export async function missingMedia(db: Db, siteId: string, content: unknown): Promise<string[]> {
  const keys = [...mediaKeysIn(content)];
  if (!keys.length) return [];
  const found = await db
    .select({ key: media.key })
    .from(media)
    .where(and(eq(media.siteId, siteId), inArray(media.key, keys)));
  const existing = new Set(found.map((f) => f.key));
  return keys.filter((key) => !existing.has(key));
}

/** Standard beskrivelse (alt-tekst). Brukes når bildet velges fra biblioteket. */
export async function setMediaAlt(db: Db, input: { siteId: string; mediaId: string; alt: string }) {
  if (!isUuid(input.mediaId)) throw new MediaError("Fant ikke bildet");
  const [row] = await db
    .update(media)
    .set({ alt: input.alt.trim().slice(0, 200) })
    .where(and(eq(media.id, input.mediaId), eq(media.siteId, input.siteId)))
    .returning({ id: media.id });
  if (!row) throw new MediaError("Fant ikke bildet");
}

/**
 * Sletter bildet for godt, også fra lageret. Går bare når det ikke er i bruk, så ingen side
 * eller vare får et bilde som mangler.
 */
export async function deleteMedia(db: Db, store: MediaStore, input: { siteId: string; mediaId: string; userId: string }) {
  if (!isUuid(input.mediaId)) throw new MediaError("Fant ikke bildet");
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, input.mediaId), eq(media.siteId, input.siteId)))
    .limit(1);
  if (!row) throw new MediaError("Fant ikke bildet");
  const usedIn = (await mediaUsage(db, input.siteId)).get(row.key) ?? [];
  if (usedIn.length) {
    throw new MediaError(`Bildet brukes fortsatt: ${usedIn.map((u) => u.label).join(", ")}. Ta det ut der først.`);
  }
  // Filene slettes før raden. Feiler noe midt i, står bildet fortsatt i biblioteket og kan slettes på nytt,
  // i stedet for å ligge usynlig igjen i lageret. Mindre utgaver som ikke finnes, er ingen feil.
  for (const width of VARIANT_WIDTHS) await store.delete(variantKey(row.key, width));
  await store.delete(row.key);
  await db.delete(media).where(eq(media.id, row.id));
  await db.insert(auditLog).values({ siteId: input.siteId, userId: input.userId, action: "media.deleted", detail: { key: row.key } });
}

/**
 * Validerer og lagrer et bilde, med de mindre utgavene nettleseren har laget. Returnerer stien som brukes
 * i innholdet. En mindre utgave som ikke er gyldig, hoppes over: bilderuten svarer da med originalen.
 */
export async function saveImage(
  db: Db,
  store: MediaStore,
  input: {
    siteId: string;
    userId: string;
    bytes: Uint8Array;
    width?: number;
    height?: number;
    alt?: string;
    variants?: { width: number; bytes: Uint8Array }[];
  },
) {
  if (input.bytes.byteLength === 0) throw new MediaError("Filen er tom");
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new MediaError("Bildet er større enn 5 MB");
  const contentType = sniffImageType(input.bytes);
  if (!contentType) throw new MediaError("Filtypen støttes ikke. Bruk JPG, PNG, WebP, GIF eller AVIF.");

  const id = crypto.randomUUID();
  const key = `${input.siteId}/${id}.${imageTypes[contentType]}`;
  const dimension = (n?: number) => (n && Number.isInteger(n) && n > 0 && n < 20000 ? n : null);
  for (const variant of input.variants ?? []) {
    const width = VARIANT_WIDTHS.find((w) => w === variant.width);
    const valid =
      width !== undefined &&
      variant.bytes.byteLength > 0 &&
      variant.bytes.byteLength <= MAX_IMAGE_BYTES &&
      // Samme filtype som originalen, så filendelsen stemmer.
      sniffImageType(variant.bytes) === contentType;
    if (valid) await store.put(variantKey(key, width), variant.bytes, contentType);
  }
  await store.put(key, input.bytes, contentType);
  await db.insert(media).values({
    id,
    siteId: input.siteId,
    key,
    contentType,
    size: input.bytes.byteLength,
    width: dimension(input.width),
    height: dimension(input.height),
    alt: (input.alt ?? "").trim().slice(0, 200),
    uploadedBy: input.userId,
  });
  await db.insert(auditLog).values({ siteId: input.siteId, userId: input.userId, action: "media.uploaded", detail: { key } });
  return { id, src: `/media/${key}` };
}
