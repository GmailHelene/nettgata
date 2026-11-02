import { and, desc, eq, inArray, like } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, media, pageVersions, pages, products, sites } from "@/db/schema";
import {
  fileSrcPattern,
  ICON_VARIANT_WIDTH,
  imageTypes,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  mediaKeysIn,
  PDF_CONTENT_TYPE,
  sniffImageType,
  sniffPdf,
  VARIANT_WIDTHS,
  variantKey,
} from "@/lib/media-types";
import type { MediaStore } from "@/lib/storage";
import { readSiteLayout } from "@/lib/site-layout";
import { assertStorageRoom, LimitError } from "@/lib/selvbetjening/grenser";

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

/** Alle bildene til nettstedet, nyeste først. PDF-filer ligger i samme tabell, men er ikke bilder. */
export async function listMedia(db: Db, siteId: string): Promise<MediaItem[]> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.siteId, siteId), like(media.contentType, "image/%")))
    .orderBy(desc(media.createdAt));
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

export type MediaFile = { id: string; src: string; name: string; size: number; createdAt: string };

/** PDF-filene til nettstedet (meny, brosjyre), nyeste først. Filnavnet ligger i alt-feltet (se saveFile). */
export async function listFiles(db: Db, siteId: string): Promise<MediaFile[]> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.siteId, siteId), eq(media.contentType, PDF_CONTENT_TYPE)))
    .orderBy(desc(media.createdAt));
  return rows.map((r) => ({ id: r.id, src: `/media/${r.key}`, name: r.alt || "fil.pdf", size: r.size, createdAt: r.createdAt.toISOString() }));
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
  for (const s of siteRows) {
    // Alt i oppsettet teller, også det som ikke kan leses. Ikonet i fanen får egen merkelapp.
    const icon = mediaKeysIn(readSiteLayout(s.layout).favicon);
    add([...mediaKeysIn(s.layout)].filter((key) => !icon.has(key)), { label: "Logoen", href: `${base}/innstillinger` });
    add(icon, { label: "Ikonet i nettleserfanen", href: `${base}/innstillinger` });
  }
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
  // PDF-filer ligger i samme tabell og følger samme regel: de kan bare slettes når ingenting bruker dem.
  const what = row.contentType === PDF_CONTENT_TYPE ? "Filen" : "Bildet";
  const usedIn = (await mediaUsage(db, input.siteId)).get(row.key) ?? [];
  if (usedIn.length) {
    throw new MediaError(`${what} brukes fortsatt: ${usedIn.map((u) => u.label).join(", ")}. Ta ${what === "Filen" ? "den" : "det"} ut der først.`);
  }
  // Filene slettes før raden. Feiler noe midt i, står bildet fortsatt i biblioteket og kan slettes på nytt,
  // i stedet for å ligge usynlig igjen i lageret. Mindre utgaver som ikke finnes, er ingen feil.
  if (row.contentType !== PDF_CONTENT_TYPE) {
    for (const width of VARIANT_WIDTHS) await store.delete(variantKey(row.key, width));
    // Ikonet i nettleserfanen har en utgave på 48 px (lib/favicon.ts).
    if (row.contentType === "image/png") await store.delete(variantKey(row.key, ICON_VARIANT_WIDTH));
  }
  await store.delete(row.key);
  await db.delete(media).where(eq(media.id, row.id));
  await db.insert(auditLog).values({ siteId: input.siteId, userId: input.userId, action: "media.deleted", detail: { key: row.key } });
}

/** Grensen for lagring på ubetalte nettsteder (lib/selvbetjening/grenser.ts), som en vanlig feil ved opplasting. */
async function roomFor(db: Db, siteId: string, bytes: number) {
  try {
    await assertStorageRoom(db, siteId, bytes);
  } catch (err) {
    if (err instanceof LimitError) throw new MediaError(err.message);
    throw err;
  }
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
  await roomFor(db, input.siteId, input.bytes.byteLength);

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

/** Rydder filnavnet, så det kan vises og brukes i Content-Disposition uten å bryte overskriften. */
export function cleanFileName(name: string): string {
  const base = name.replace(/[\x00-\x1f\x7f"\\/]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return base || "fil.pdf";
}

/**
 * Lagrer en PDF, for eksempel en meny eller brosjyre. Filtypen sjekkes fra innholdet. Filnavnet lagres
 * i alt-feltet, fordi PDF-er ikke har noen beskrivelse, så biblioteket har noe å vise.
 */
export async function saveFile(db: Db, store: MediaStore, input: { siteId: string; userId: string; bytes: Uint8Array; name: string }) {
  if (input.bytes.byteLength === 0) throw new MediaError("Filen er tom");
  if (input.bytes.byteLength > MAX_FILE_BYTES) throw new MediaError("Filen er større enn 10 MB");
  if (!sniffPdf(input.bytes)) throw new MediaError("Bare PDF-filer kan lastes opp her.");
  await roomFor(db, input.siteId, input.bytes.byteLength);

  const id = crypto.randomUUID();
  const key = `${input.siteId}/${id}.pdf`;
  const name = cleanFileName(input.name);
  await store.put(key, input.bytes, PDF_CONTENT_TYPE);
  await db.insert(media).values({
    id,
    siteId: input.siteId,
    key,
    contentType: PDF_CONTENT_TYPE,
    size: input.bytes.byteLength,
    alt: name,
    uploadedBy: input.userId,
  });
  await db.insert(auditLog).values({ siteId: input.siteId, userId: input.userId, action: "media.uploaded", detail: { key } });
  return { id, src: `/media/${key}`, name, size: input.bytes.byteLength };
}

/**
 * Sletter en PDF ut fra adressen, for eksempel den gamle menyen når kunden har lastet opp en ny.
 * Samme regel som i biblioteket: brukes den fortsatt et sted (også i den publiserte versjonen), stopper det.
 */
export async function deleteFileBySrc(db: Db, store: MediaStore, input: { siteId: string; src: string; userId: string }) {
  if (!fileSrcPattern.test(input.src)) throw new MediaError("Fant ikke filen");
  const key = input.src.slice("/media/".length);
  const [row] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.siteId, input.siteId), eq(media.key, key), eq(media.contentType, PDF_CONTENT_TYPE)))
    .limit(1);
  if (!row) throw new MediaError("Fant ikke filen");
  await deleteMedia(db, store, { siteId: input.siteId, mediaId: row.id, userId: input.userId });
}
