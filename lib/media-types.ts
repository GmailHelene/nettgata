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
 * Mindre utgaver som lagres ved opplasting, så mobilen slipper å hente hele bildet. Originalen er
 * maks 2000 px bred. Bilder lastet opp før dette har bare originalen, og bilderuten svarer da med den.
 */
export const VARIANT_WIDTHS = [640, 1280] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

/**
 * Ikonet i nettleserfanen (favicon) lagres som et vanlig PNG-bilde på 180 px (apple-touch-icon), pluss en utgave
 * på 48 px til fanen, med samme navn og «-w48». Google vil ha favicon i et multiplum av 48 px. Se lib/favicon.ts.
 */
export const ICON_VARIANT_WIDTH = 48;

/** Alle filer i lageret: originalen og de mindre utgavene (…-w640.webp), og PDF-filer. Brukes av bilderuten. */
export const mediaFileKeyPattern = new RegExp(
  `^${uuid}/${uuid}((-w(${[...VARIANT_WIDTHS, ICON_VARIANT_WIDTH].join("|")}))?\\.(webp|jpg|png|gif|avif)|\\.pdf)$`,
);

/**
 * Nedlastbare filer, som PDF-meny og brosjyre. Bare PDF, og typen sjekkes fra innholdet som for bilder.
 * Filene får ingen mindre utgaver og vises aldri som bilde.
 */
export const PDF_CONTENT_TYPE = "application/pdf";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Slik lagres en fil i innholdet: /media/<siteId>/<id>.pdf */
export const fileSrcPattern = new RegExp(`^/media/${uuid}/${uuid}\\.pdf$`);

/** PDF-filer starter alltid med «%PDF-». Alt annet avvises, uansett hva nettleseren sier filen er. */
export function sniffPdf(bytes: Uint8Array): boolean {
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((v, i) => bytes[i] === v);
}

/** <id>.webp blir <id>-w640.webp. Samme filtype som originalen. */
export function variantKey(key: string, width: VariantWidth | typeof ICON_VARIANT_WIDTH): string {
  return key.replace(/\.(\w+)$/, `-w${width}.$1`);
}

/** Originalen til en mindre utgave, eller null hvis nøkkelen allerede er en original. */
export function originalKey(fileKey: string): string | null {
  const original = fileKey.replace(/-w\d+(\.\w+)$/, "$1");
  return original === fileKey ? null : original;
}

/**
 * srcset for et bilde fra eget lager. GIF får ingen, fordi de mindre utgavene ville mistet animasjonen.
 * Bredden 2000w er taket for originalen. Er originalen mindre, svarer bilderuten med den.
 */
export function mediaSrcSet(src: string): string | undefined {
  if (!mediaSrcPattern.test(src) || src.endsWith(".gif")) return undefined;
  return [...VARIANT_WIDTHS.map((w) => `${variantKey(src, w)} ${w}w`), `${src} 2000w`].join(", ");
}

/** Liten utgave til miniatyrer i studioet. Bilder fra før har bare originalen, og ruten svarer da med den. */
export function mediaThumb(src: string): string {
  return mediaSrcPattern.test(src) && !src.endsWith(".gif") ? variantKey(src, 640) : src;
}

/** Det viktigste i bildet, i prosent fra venstre og fra toppen. Beholdes når bildet beskjæres. */
export type ImageFocus = { x: number; y: number };

/** object-position for fokuspunktet. Ugyldige verdier gir ingenting, og bildet sentreres som før. */
export function focusStyle(focus: unknown): { objectPosition: string } | undefined {
  if (!focus || typeof focus !== "object") return undefined;
  const { x, y } = focus as Record<string, unknown>;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  return valid(x) && valid(y) ? { objectPosition: `${x}% ${y}%` } : undefined;
}

const mediaSrcAnywhere = new RegExp(`/media/(${uuid}/${uuid}\\.(?:webp|jpg|png|gif|avif|pdf))`, "g");

/** Alle bilde- og filnøkler i et innhold (side, vare, logo), uansett hvor dypt i strukturen de ligger. */
export function mediaKeysIn(value: unknown): Set<string> {
  const json = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return new Set(Array.from(json.matchAll(mediaSrcAnywhere), (m) => m[1]));
}

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
