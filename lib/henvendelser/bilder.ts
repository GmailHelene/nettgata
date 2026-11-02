import { SignJWT, jwtVerify } from "jose";
import { and, count, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { inquiryImages, sites } from "@/db/schema";
import type { PageContent } from "@/lib/content/types";
import { imageFormField, readFormFields, type FormField } from "@/lib/content/form-fields";
import { sniffImageType, type ImageContentType } from "@/lib/media-types";
import { getPublishedPage } from "@/lib/publishing";
import { hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import type { MediaStore } from "@/lib/storage";

/**
 * Bilder i tilbudsforespørsler (felttypen «bilder» i kontaktskjemaet). Mest for håndverkere, som vil se jobben før de
 * gir pris. Hvem som helst kan laste opp, så alt er bundet og begrenset:
 *
 * - Opplastingsnøkkelen lages bare når den publiserte siden har et skjema med bildefelt. Den er signert med
 *   SESSION_SECRET, gjelder ett nettsted, én side og ett skjema, og kan brukes til opplasting i to timer.
 * - Typen sjekkes fra innholdet i filen. Bare JPEG, PNG og WebP, aldri SVG. Høyst fem bilder per nøkkel.
 * - Grenser per IP-adresse og per nettsted (lib/rate-limit.ts).
 * - Filene ligger under henvendelser/<siteId>/ i lageret. Bilderuten (/media) svarer aldri på dem, bare
 *   studioruten /studio/api/henvendelse-bilde/<id>, og bare for eier og redaktør av nettstedet.
 * - Bilder som ikke blir sendt med et skjema, og bilder fra slettede henvendelser, slettes av ryddejobben
 *   (cleanupInquiryImages) etter et døgn.
 */

export const MAX_INQUIRY_IMAGES = 5;
/** Før nettleseren gjør bildet mindre. Bilder over dette avvises med en gang, uten at noe sendes. */
export const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;
/** Etter at nettleseren har gjort bildet mindre (maks 2000 px). Et vanlig mobilbilde blir 300 KB til 1,5 MB. */
export const MAX_INQUIRY_IMAGE_BYTES = 5 * 1024 * 1024;
/** Hvor lenge nøkkelen kan brukes til å laste opp. */
export const UPLOAD_TOKEN_MINUTES = 120;
/** Hvor lenge bildene kan knyttes til en henvendelse. Etter det regnes de som forlatt og slettes. */
export const ORPHAN_HOURS = 24;

export const INQUIRY_IMAGE_PREFIX = "henvendelser/";
const AUDIENCE = "henvendelse-bilder";

const allowedTypes: Partial<Record<ImageContentType, string>> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const INQUIRY_IMAGE_TYPES = Object.keys(allowedTypes) as ImageContentType[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Feil som kan vises til den som laster opp. `status` er HTTP-svaret i opplastingsruten. */
export class InquiryImageError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** JPEG, PNG eller WebP etter de første bytene i filen. Alt annet, også SVG, GIF og HTML, gir null. */
export function sniffInquiryImage(bytes: Uint8Array): ImageContentType | null {
  const type = sniffImageType(bytes);
  return type && allowedTypes[type] ? type : null;
}

/** De egne feltene i kontaktskjemaet slik de står på den publiserte siden. Ukjent side eller seksjon gir ingen felt. */
export async function publishedFormFields(db: Db, siteId: string, path: string, sectionId: string): Promise<FormField[]> {
  if (!sectionId || sectionId.length > 64) return [];
  const page = await getPublishedPage(db, siteId, path);
  const section = page?.content.sections.find((s) => s.id === sectionId && s.type === "kontakt" && s.variant === "skjema" && !s.hidden);
  return section ? readFormFields(section.props) : [];
}

/** Bruker noen av de publiserte sidene bildefeltet? Personvernerklæringen nevner bildene bare da. */
export function usesInquiryImages(contents: readonly PageContent[]): boolean {
  return contents
    .flatMap((c) => c.sections ?? [])
    .some((s) => s.type === "kontakt" && s.variant === "skjema" && !s.hidden && imageFormField(readFormFields(s.props)) !== null);
}

// ---------- Nøkkelen ----------

export type UploadToken = { uploadId: string; siteId: string; path: string; sectionId: string };

async function sign(t: UploadToken, now: Date): Promise<string> {
  return new SignJWT({ s: t.siteId, p: t.path, f: t.sectionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(t.uploadId)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .sign(getSecret());
}

/**
 * Leser nøkkelen. `maxMinutes` er hvor gammel den kan være: kort for opplasting, et døgn for å knytte bildene
 * til henvendelsen, så den som skriver lenge ikke mister bildene sine.
 */
export async function readUploadToken(token: string, maxMinutes: number, now = new Date()): Promise<UploadToken | null> {
  if (!token || token.length > 1000) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE, algorithms: ["HS256"], currentDate: now, maxTokenAge: `${maxMinutes}m` });
    const { sub, s, p, f } = payload;
    if (!isUuid(sub) || !isUuid(s) || typeof p !== "string" || typeof f !== "string") return null;
    // Nøkler fra framtiden godtas ikke. jose sjekker bare alderen bakover.
    if ((payload.iat ?? 0) * 1000 > now.getTime() + 60_000) return null;
    return { uploadId: sub, siteId: s, path: p, sectionId: f };
  } catch {
    return null;
  }
}

/** Gir en ny nøkkel hvis den publiserte siden har et skjema med bildefelt. Kalles når den besøkende velger det første bildet. */
export async function createUploadToken(db: Db, input: { siteId: string; path: string; sectionId: string }, now = new Date()): Promise<string> {
  if (!isUuid(input.siteId) || input.path.length > 300) throw new InquiryImageError("Skjemaet er ikke tilgjengelig", 404);
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  const fields = site ? await publishedFormFields(db, site.id, input.path, input.sectionId) : [];
  if (!imageFormField(fields)) throw new InquiryImageError("Skjemaet tar ikke imot bilder", 404);
  return sign({ uploadId: crypto.randomUUID(), siteId: input.siteId, path: input.path, sectionId: input.sectionId }, now);
}

// ---------- Opplasting ----------

/**
 * Lagrer ett bilde. Sjekker nøkkelen, at skjemaet fortsatt har bildefeltet, størrelse, type, antall og grensene.
 * `ipKey` er koden for IP-adressen (clientKey), aldri adressen selv.
 */
export async function saveInquiryImage(
  db: Db,
  store: MediaStore,
  input: { token: string; bytes: Uint8Array; ipKey: string },
  now = new Date(),
): Promise<{ id: string }> {
  const token = await readUploadToken(input.token, UPLOAD_TOKEN_MINUTES, now);
  if (!token) throw new InquiryImageError("Opplastingen er utløpt. Last inn siden på nytt og prøv igjen.", 403);
  if (input.bytes.byteLength === 0) throw new InquiryImageError("Bildet er tomt");
  if (input.bytes.byteLength > MAX_INQUIRY_IMAGE_BYTES) throw new InquiryImageError("Bildet er for stort", 413);
  const type = sniffInquiryImage(input.bytes);
  if (!type) throw new InquiryImageError("Filen er ikke et bilde vi kan ta imot. Bruk JPG, PNG eller WebP.", 415);

  // Siden kan ha blitt endret etter at nøkkelen ble laget.
  if (!imageFormField(await publishedFormFields(db, token.siteId, token.path, token.sectionId))) {
    throw new InquiryImageError("Skjemaet tar ikke imot bilder", 404);
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(inquiryImages)
    .where(and(eq(inquiryImages.siteId, token.siteId), eq(inquiryImages.uploadId, token.uploadId)));
  if (n >= MAX_INQUIRY_IMAGES) throw new InquiryImageError(`Du kan legge ved høyst ${MAX_INQUIRY_IMAGES} bilder`);

  const allowed =
    (await hit(db, `inquiry-image-ip:${input.ipKey}`, rules.inquiryImagePerIp, now)) &&
    (await hit(db, `inquiry-image-site:${token.siteId}`, rules.inquiryImagePerSite, now));
  if (!allowed) throw new InquiryImageError("Du har lastet opp mange bilder på kort tid. Prøv igjen om litt.", 429);

  const id = crypto.randomUUID();
  const key = `${INQUIRY_IMAGE_PREFIX}${token.siteId}/${id}.${allowedTypes[type]}`;
  await store.put(key, input.bytes, type);
  await db.insert(inquiryImages).values({ id, siteId: token.siteId, uploadId: token.uploadId, key, contentType: type, size: input.bytes.byteLength, createdAt: now });
  return { id };
}

/** Den besøkende fjerner et bilde før skjemaet er sendt. Virker bare med samme nøkkel, og bare før bildet er sendt. */
export async function removePendingImage(db: Db, store: MediaStore, input: { token: string; imageId: string }, now = new Date()): Promise<boolean> {
  const token = await readUploadToken(input.token, ORPHAN_HOURS * 60, now);
  if (!token || !isUuid(input.imageId)) return false;
  const [row] = await db
    .delete(inquiryImages)
    .where(
      and(
        eq(inquiryImages.id, input.imageId),
        eq(inquiryImages.siteId, token.siteId),
        eq(inquiryImages.uploadId, token.uploadId),
        isNull(inquiryImages.inquiryId),
      ),
    )
    .returning({ key: inquiryImages.key });
  if (!row) return false;
  await store.delete(row.key);
  return true;
}

// ---------- Når skjemaet sendes ----------

/**
 * Sjekker bildene som følger med skjemaet: samme nettsted, side og skjema som nøkkelen, lastet opp med den, og
 * ikke sendt før. Id-er som ikke stemmer, hoppes over i stillhet. Det er bare den samme nettleseren som har dem.
 */
export async function pendingImages(
  db: Db,
  input: { siteId: string; path: string; sectionId: string; token: string; ids: string[] },
  now = new Date(),
): Promise<{ uploadId: string; ids: string[] } | null> {
  const ids = [...new Set(input.ids.filter(isUuid))].slice(0, MAX_INQUIRY_IMAGES);
  if (!ids.length) return null;
  const token = await readUploadToken(input.token, ORPHAN_HOURS * 60, now);
  if (!token || token.siteId !== input.siteId || token.path !== input.path || token.sectionId !== input.sectionId) return null;
  const rows = await db
    .select({ id: inquiryImages.id })
    .from(inquiryImages)
    .where(
      and(
        inArray(inquiryImages.id, ids),
        eq(inquiryImages.siteId, input.siteId),
        eq(inquiryImages.uploadId, token.uploadId),
        isNull(inquiryImages.inquiryId),
      ),
    );
  const found = new Set(rows.map((r) => r.id));
  const valid = ids.filter((id) => found.has(id));
  return valid.length ? { uploadId: token.uploadId, ids: valid } : null;
}

/** Knytter bildene til henvendelsen. Gir tilbake hvor mange som ble knyttet. */
export async function attachImages(db: Db, siteId: string, inquiryId: string, pending: { uploadId: string; ids: string[] }): Promise<number> {
  const rows = await db
    .update(inquiryImages)
    .set({ inquiryId })
    .where(
      and(
        inArray(inquiryImages.id, pending.ids),
        eq(inquiryImages.siteId, siteId),
        eq(inquiryImages.uploadId, pending.uploadId),
        isNull(inquiryImages.inquiryId),
      ),
    )
    .returning({ id: inquiryImages.id });
  return rows.length;
}

// ---------- Studioet ----------

/** Bildene er personopplysninger. Utvikler ser at de finnes, men bare eier og redaktør kan åpne dem. */
export function canViewInquiryImages(role: "owner" | "editor" | "developer"): boolean {
  return role === "owner" || role === "editor";
}

/** Bildene til henvendelsene, per henvendelse, i den rekkefølgen de ble lastet opp. */
export async function imagesFor(db: Db, siteId: string, inquiryIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!inquiryIds.length) return map;
  const rows = await db
    .select({ id: inquiryImages.id, inquiryId: inquiryImages.inquiryId, createdAt: inquiryImages.createdAt })
    .from(inquiryImages)
    .where(and(eq(inquiryImages.siteId, siteId), inArray(inquiryImages.inquiryId, inquiryIds)))
    .orderBy(inquiryImages.createdAt, inquiryImages.id);
  for (const r of rows) map.set(r.inquiryId!, [...(map.get(r.inquiryId!) ?? []), r.id]);
  return map;
}

/** Ett bilde for studioruten, bare hvis det hører til en henvendelse på nettstedet. */
export async function attachedImage(db: Db, imageId: string) {
  if (!isUuid(imageId)) return null;
  const [row] = await db
    .select()
    .from(inquiryImages)
    .where(and(eq(inquiryImages.id, imageId), isNotNull(inquiryImages.inquiryId)))
    .limit(1);
  return row ?? null;
}

export const inquiryImageSrc = (imageId: string) => `/studio/api/henvendelse-bilde/${imageId}`;

/** Filnavnet i «Last ned alt»: henvendelser/<henvendelse>-<bilde>.jpg, så bildene til én henvendelse ligger etter hverandre. */
export function inquiryImageFileName(img: { id: string; inquiryId: string | null; key: string }): string {
  const ext = img.key.split(".").pop() ?? "jpg";
  return `henvendelser/${(img.inquiryId ?? "uten").slice(0, 8)}-${img.id.slice(0, 8)}.${ext}`;
}

// ---------- Sletting ----------

async function deleteRows(db: Db, store: MediaStore, rows: { id: string; key: string }[]) {
  // Filen først. Feiler lageret, står raden igjen, og ryddejobben prøver på nytt.
  for (const row of rows) await store.delete(row.key);
  if (rows.length) await db.delete(inquiryImages).where(inArray(inquiryImages.id, rows.map((r) => r.id)));
}

/** Sletter bildene til henvendelsene, før henvendelsene selv slettes. */
export async function deleteInquiryImages(db: Db, store: MediaStore, siteId: string, inquiryIds: string[]): Promise<number> {
  if (!inquiryIds.length) return 0;
  const rows = await db
    .select({ id: inquiryImages.id, key: inquiryImages.key })
    .from(inquiryImages)
    .where(and(eq(inquiryImages.siteId, siteId), inArray(inquiryImages.inquiryId, inquiryIds)));
  await deleteRows(db, store, rows);
  return rows.length;
}

const CLEANUP_BATCH = 500;

/**
 * Ryddejobben (hvert tiende minutt): sletter bilder som ikke hører til noen henvendelse og er eldre enn et døgn.
 * Det gjelder bilder fra skjemaer som aldri ble sendt, og bilder fra henvendelser som er slettet av reglene for
 * sletting (lib/retention.ts), der databasen har satt inquiry_id til null.
 */
export async function cleanupInquiryImages(db: Db, store: MediaStore, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ORPHAN_HOURS * 3_600_000);
  const rows = await db
    .select({ id: inquiryImages.id, key: inquiryImages.key })
    .from(inquiryImages)
    .where(and(isNull(inquiryImages.inquiryId), lt(inquiryImages.createdAt, cutoff)))
    .limit(CLEANUP_BATCH);
  await deleteRows(db, store, rows);
  return rows.length;
}
