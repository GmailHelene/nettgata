/** Bildeformater vi tar imot. SVG er bevisst utelatt, fordi det kan inneholde skript. */
export const imageTypes = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;
export type ImageContentType = keyof typeof imageTypes;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** <siteId>/<mediaId>.<ext> */
export const mediaKeyPattern = new RegExp(`^${uuid}/${uuid}\\.(webp|jpg|png|gif|avif)$`);
/** Slik lagres et bilde i innholdet: /media/<key> */
export const mediaSrcPattern = new RegExp(`^/media/${uuid}/${uuid}\\.(webp|jpg|png|gif|avif)$`);

/**
 * Finner bildetypen fra de første bytene i filen, ikke fra det nettleseren påstår.
 * Slik kan ingen laste opp HTML eller skript forkledd som bilde.
 */
export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  const ascii = (i: number, text: string) => at(i, ...Array.from(text, (c) => c.charCodeAt(0)));
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(4, "ftypavif") || ascii(4, "ftypavis")) return "image/avif";
  return null;
}
