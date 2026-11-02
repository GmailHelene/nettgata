import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import type { Db } from "@/db";
import { auditLog, sites } from "@/db/schema";
import { MediaError, saveImage } from "@/lib/media";
import { ICON_VARIANT_WIDTH, sniffImageType, variantKey } from "@/lib/media-types";
import { readSiteLayout } from "@/lib/site-layout";
import type { MediaStore } from "@/lib/storage";
import { resolveTheme, type Theme } from "@/lib/theme";

/**
 * Ikonet i nettleserfanen (favicon) per nettsted.
 *
 * Kunden laster opp PNG, WebP, ICO eller JPEG i Innstillinger. Nettleseren gjør bildet kvadratisk og lager to PNG-er:
 * 180 px (apple-touch-icon, og det som vises i bildebiblioteket) og 48 px (fanen). Serveren sjekker at begge er PNG i
 * riktig størrelse, så ingen kan sende noe annet. SVG tas ikke imot, som ellers i bildebiblioteket.
 *
 * Uten opplastet ikon brukes en bokstav fra bedriftsnavnet i temafargene. Den lager vi selv, så den kan være SVG.
 */

export const ICON_SIZE = 180;

/** Filtypene opplastingen godtar. ICO og JPEG gjøres om til PNG i nettleseren før de sendes. */
export const FAVICON_ACCEPT = "image/png,image/webp,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico";

/** Bredde og høyde fra PNG-hodet (IHDR), eller null hvis det ikke er en PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (sniffImageType(bytes) !== "image/png" || bytes.byteLength < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Stien til 48-pikslersutgaven av et lagret ikon. */
export function smallIconSrc(src: string): string {
  return variantKey(src, ICON_VARIANT_WIDTH);
}

/**
 * Pakker PNG-bilder i en ICO-fil. ICO kan inneholde PNG direkte (siden Windows Vista), så ingenting må tegnes om.
 * Brukes til /favicon.ico, som noen nettlesere og tjenester henter uten å lese siden.
 */
export function buildIco(images: { bytes: Uint8Array; size: number }[]): Uint8Array {
  const headerSize = 6 + 16 * images.length;
  const total = headerSize + images.reduce((sum, i) => sum + i.bytes.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type 1 = ikon
  view.setUint16(4, images.length, true);
  let offset = headerSize;
  images.forEach((image, i) => {
    const entry = 6 + 16 * i;
    // 0 betyr 256 px.
    out[entry] = image.size >= 256 ? 0 : image.size;
    out[entry + 1] = image.size >= 256 ? 0 : image.size;
    view.setUint16(entry + 4, 1, true); // fargeplan
    view.setUint16(entry + 6, 32, true); // biter per piksel
    view.setUint32(entry + 8, image.bytes.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    out.set(image.bytes, offset);
    offset += image.bytes.byteLength;
  });
  return out;
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Første bokstav eller tall i navnet, med stor bokstav. «Åsheim Bakeri» gir «Å». */
export function initialOf(name: string): string {
  const match = name.trim().match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase("nb-NO") : "N";
}

/** Reserveikonet: bokstaven i knappetekstfargen på primærfargen, samme par som temaet har sjekket kontrasten på. */
export function letterIconSvg(name: string, theme: Partial<Theme> | null | undefined): string {
  const t = resolveTheme(theme);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="14" fill="${t.primary}"/>`,
    `<text x="32" y="44" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-size="36" font-weight="700" fill="${t.onPrimary}">${escapeXml(initialOf(name))}</text>`,
    `</svg>`,
  ].join("");
}

/** Lenkene i <head>. Bildeadressene virker både på eget domene og under /vis/, så de brukes direkte. */
export function siteIcons(site: { name: string; theme: Partial<Theme> | null; layout: unknown }): NonNullable<Metadata["icons"]> {
  const favicon = readSiteLayout(site.layout).favicon;
  if (favicon) {
    return {
      icon: [
        { url: smallIconSrc(favicon.src), sizes: `${ICON_VARIANT_WIDTH}x${ICON_VARIANT_WIDTH}`, type: "image/png" },
        { url: favicon.src, sizes: `${ICON_SIZE}x${ICON_SIZE}`, type: "image/png" },
      ],
      apple: [{ url: favicon.src, sizes: `${ICON_SIZE}x${ICON_SIZE}` }],
    };
  }
  return { icon: [{ url: `data:image/svg+xml,${encodeURIComponent(letterIconSvg(site.name, site.theme))}`, type: "image/svg+xml" }] };
}

/**
 * Lagrer et nytt ikon: 180 px som vanlig bilde i biblioteket (samme vei som andre bilder, saveImage), 48 px ved
 * siden av, og peker nettstedet dit. Det gamle ikonet blir liggende i biblioteket og kan slettes der når det ikke
 * brukes lenger.
 */
export async function saveFavicon(db: Db, store: MediaStore, input: { siteId: string; userId: string; icon: Uint8Array; small: Uint8Array }) {
  const big = pngSize(input.icon);
  const small = pngSize(input.small);
  if (!big || big.width !== ICON_SIZE || big.height !== ICON_SIZE) throw new MediaError("Ikonet må være et kvadratisk PNG-bilde på 180 px");
  if (!small || small.width !== ICON_VARIANT_WIDTH || small.height !== ICON_VARIANT_WIDTH) {
    throw new MediaError("Den lille utgaven av ikonet må være et PNG-bilde på 48 px");
  }
  const [site] = await db.select({ layout: sites.layout }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) throw new MediaError("Fant ikke nettstedet");

  const saved = await saveImage(db, store, {
    siteId: input.siteId,
    userId: input.userId,
    bytes: input.icon,
    width: ICON_SIZE,
    height: ICON_SIZE,
    alt: "Ikon i nettleserfanen",
  });
  await store.put(smallIconSrc(saved.src).replace(/^\/media\//, ""), input.small, "image/png");
  // Slås sammen med det som er lagret, så ingenting annet i oppsettet endres.
  await db.update(sites).set({ layout: { ...site.layout, favicon: { src: saved.src } } }).where(eq(sites.id, input.siteId));
  await db.insert(auditLog).values({ siteId: input.siteId, userId: input.userId, action: "site.favicon_updated", detail: { src: saved.src } });
  return saved.src;
}

/** Går tilbake til bokstavikonet. Bildet blir liggende i biblioteket. */
export async function removeFavicon(db: Db, input: { siteId: string; userId: string }) {
  const [site] = await db.select({ layout: sites.layout }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) throw new MediaError("Fant ikke nettstedet");
  await db.update(sites).set({ layout: { ...site.layout, favicon: null } }).where(eq(sites.id, input.siteId));
  await db.insert(auditLog).values({ siteId: input.siteId, userId: input.userId, action: "site.favicon_removed" });
}
