import type { Db } from "@/db";
import { auditLog, media } from "@/db/schema";
import { imageTypes, MAX_IMAGE_BYTES, sniffImageType } from "@/lib/media-types";
import type { MediaStore } from "@/lib/storage";

export class MediaError extends Error {}

/** Validerer og lagrer et bilde. Returnerer stien som brukes i innholdet. */
export async function saveImage(
  db: Db,
  store: MediaStore,
  input: { siteId: string; userId: string; bytes: Uint8Array; width?: number; height?: number; alt?: string },
) {
  if (input.bytes.byteLength === 0) throw new MediaError("Filen er tom");
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new MediaError("Bildet er større enn 5 MB");
  const contentType = sniffImageType(input.bytes);
  if (!contentType) throw new MediaError("Filtypen støttes ikke. Bruk JPG, PNG, WebP, GIF eller AVIF.");

  const id = crypto.randomUUID();
  const key = `${input.siteId}/${id}.${imageTypes[contentType]}`;
  const dimension = (n?: number) => (n && Number.isInteger(n) && n > 0 && n < 20000 ? n : null);
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
