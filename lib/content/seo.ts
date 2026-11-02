import type { ImageValue } from "./fields";
import type { PageContent } from "./types";
import { mediaSrcPattern, variantKey } from "@/lib/media-types";
import { autoDescription, autoTitle, pageTextDescription, readableSlug, slugPath, visibleSections, visibleText, wordCount } from "@/lib/seo/auto";

/** Rundt så mange tegn viser Google av tittel og beskrivelse før resten kuttes. */
export const GOOGLE_TITLE_CHARS = 60;
export const GOOGLE_DESCRIPTION_CHARS = 160;

/** Tittelen Google får: egen SEO-tittel, ellers «Sidetittel | Nettstedet». */
export function effectiveTitle(seoTitle: string | undefined, pageTitle: string, siteName: string): string {
  return seoTitle?.trim() || `${pageTitle} | ${siteName}`;
}

/** Det første ekte bildet på siden, i den rekkefølgen seksjonene står. Eksempelbilder teller ikke. */
export function firstContentImage(content: PageContent): ImageValue | null {
  const find = (value: unknown): ImageValue | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = find(item);
        if (found) return found;
      }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (typeof v.src === "string" && mediaSrcPattern.test(v.src)) return { src: v.src, alt: typeof v.alt === "string" ? v.alt : "" };
    return find(Object.values(v));
  };
  for (const section of content.sections) {
    // Toppseksjonen viser bare bildet i bildevariantene. Et skjult bilde skal ikke bli delingsbildet.
    if (section.type === "hero" && section.variant !== "bilde" && section.variant !== "bakgrunn") continue;
    const found = find(section.props);
    if (found) return found;
  }
  return null;
}

/** Delingsbildet hentes i 1280 px, nær det Facebook og LinkedIn anbefaler. Bilder fra før får originalen. */
export function shareImageSrc(src: string): string {
  return src.endsWith(".gif") ? src : variantKey(src, 1280);
}

export type SeoHintInput = {
  pageTitle: string;
  siteName: string;
  content: PageContent;
  /** Sidens adresse. Uten den regnes siden som en underside, og adressen sjekkes ikke. */
  path?: string;
  /** Bransjeordet og stedet til den automatiske tittelen (lib/seo/auto.ts). */
  keyword?: string;
  place?: string;
  shop?: boolean;
};

/** Tittelen og beskrivelsen Google får: kundens egne, ellers de vi lager av navn, bransje, sted og tekst. */
export function pageSeo(input: SeoHintInput): { title: string; description: string; autoTitle: string; autoDescription: string } {
  const seo = input.content.seo ?? {};
  const path = input.path ?? "/side";
  const title = autoTitle({ pageTitle: input.pageTitle, path, siteName: input.siteName, keyword: input.keyword, place: input.place, shop: input.shop });
  const description = autoDescription({ content: input.content, siteName: input.siteName, pageTitle: input.pageTitle, path, keyword: input.keyword, place: input.place });
  return { title: seo.title?.trim() || title, description: seo.description?.trim() || description, autoTitle: title, autoDescription: description };
}

/** Under så mange ord har Google lite å gå på. */
export const MIN_WORDS = 50;

/** Bilder på siden som verken har alt-tekst eller er merket som pynt. Eksempelbilder telles ikke. */
function imagesWithoutAlt(content: PageContent): number {
  let count = 0;
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;
    const v = value as Record<string, unknown>;
    if (typeof v.src === "string" && mediaSrcPattern.test(v.src) && !v.decorative && !(typeof v.alt === "string" && v.alt.trim())) count++;
    Object.values(v).forEach(walk);
  };
  for (const s of visibleSections(content)) walk(s.props);
  return count;
}

/**
 * «Fiks nå»: én linje per ting som gjør siden svakere i Google eller når den deles.
 * Ingen poengsum. Bare det som faktisk kan rettes, med hvorfor. Ingenting her stopper publisering.
 */
export function seoHints(input: SeoHintInput): string[] {
  const { content } = input;
  // Eldre innhold kan mangle seo helt. Det regnes som tomt.
  const seo = content.seo ?? {};
  const hints: string[] = [];
  // Overskriften i den første synlige seksjonen blir sidens H1 (se Heading). Mangler den, har siden ingen.
  const firstHeading = visibleSections(content)[0]?.props.overskrift;
  if (typeof firstHeading !== "string" || !firstHeading.trim()) {
    hints.push("Siden har ingen hovedoverskrift (H1). Gi den første seksjonen en overskrift, så forstår Google hva siden handler om.");
  }
  const { title } = pageSeo(input);
  if (title.length > GOOGLE_TITLE_CHARS) {
    hints.push(`Tittelen er ${title.length} tegn. Google viser rundt ${GOOGLE_TITLE_CHARS}, så slutten blir borte.`);
  }
  const description = seo.description?.trim() ?? "";
  if (!description) {
    // Uten egen beskrivelse lages den av teksten på siden. Bare når siden ikke har tekst, må kunden skrive selv.
    if (!pageTextDescription(content)) hints.push("Skriv en beskrivelse. Siden har ingen tekst vi kan lage den av, så Google velger selv.");
  } else if (description.length > GOOGLE_DESCRIPTION_CHARS) {
    hints.push(`Beskrivelsen er ${description.length} tegn. Google viser rundt ${GOOGLE_DESCRIPTION_CHARS}.`);
  }
  const words = wordCount(visibleText(content));
  if (words < MIN_WORDS) {
    hints.push(`Siden har ${words} ord. Skriv gjerne litt mer om hva du tilbyr og hvor, minst ${MIN_WORDS} ord, så har Google mer å gå på.`);
  }
  const missingAlt = imagesWithoutAlt(content);
  if (missingAlt) {
    hints.push(
      missingAlt === 1
        ? "Ett bilde mangler alt-tekst. Skriv kort hva bildet viser. Det hjelper både Google og dem som ikke ser bildet."
        : `${missingAlt} bilder mangler alt-tekst. Skriv kort hva bildene viser. Det hjelper både Google og dem som ikke ser bildene.`,
    );
  }
  if (input.path && !readableSlug(input.path)) {
    hints.push(`Adressen ${input.path} har tegn som æ, ø, å eller store bokstaver. ${slugPath(input.path)} er lettere å dele og skrive inn.`);
  }
  if (!seo.image && !firstContentImage(content)) {
    hints.push("Siden har ingen bilder. Velg et delingsbilde, så ser lenken bedre ut når den deles på Facebook eller i meldinger.");
  }
  return hints;
}
