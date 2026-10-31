import type { ImageValue } from "./fields";
import type { PageContent } from "./types";
import { mediaSrcPattern, variantKey } from "@/lib/media-types";

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
    const found = find(section.props);
    if (found) return found;
  }
  return null;
}

/** Delingsbildet hentes i 1280 px, nær det Facebook og LinkedIn anbefaler. Bilder fra før får originalen. */
export function shareImageSrc(src: string): string {
  return src.endsWith(".gif") ? src : variantKey(src, 1280);
}

/**
 * «Fiks nå»: én linje per ting som gjør siden svakere i Google eller når den deles.
 * Ingen poengsum. Bare det som faktisk kan rettes, med hvorfor.
 */
export function seoHints(input: { pageTitle: string; siteName: string; content: PageContent }): string[] {
  const { content } = input;
  // Eldre innhold kan mangle seo helt. Det regnes som tomt.
  const seo = content.seo ?? {};
  const hints: string[] = [];
  // Overskriften i den første seksjonen blir sidens H1 (se Heading). Mangler den, har siden ingen.
  const firstHeading = content.sections[0]?.props.overskrift;
  if (typeof firstHeading !== "string" || !firstHeading.trim()) {
    hints.push("Siden har ingen hovedoverskrift (H1). Gi den første seksjonen en overskrift, så forstår Google hva siden handler om.");
  }
  const title = effectiveTitle(seo.title, input.pageTitle, input.siteName);
  if (title.length > GOOGLE_TITLE_CHARS) {
    hints.push(`Tittelen er ${title.length} tegn. Google viser rundt ${GOOGLE_TITLE_CHARS}, så slutten blir borte.`);
  }
  const description = seo.description?.trim() ?? "";
  if (!description) {
    hints.push("Skriv en beskrivelse. Uten den velger Google selv en tekstbit fra siden.");
  } else if (description.length > GOOGLE_DESCRIPTION_CHARS) {
    hints.push(`Beskrivelsen er ${description.length} tegn. Google viser rundt ${GOOGLE_DESCRIPTION_CHARS}.`);
  }
  if (!seo.image && !firstContentImage(content)) {
    hints.push("Siden har ingen bilder. Velg et delingsbilde, så ser lenken bedre ut når den deles på Facebook eller i meldinger.");
  }
  return hints;
}
