import { packImages } from "./bilder";
import type { PageContent } from "@/lib/content/types";
import type { SiteLayout } from "@/lib/site-layout";
import { servicePacks } from "./bransjer";
import { handverker } from "./handverker";
import { nettbutikk, shopVariants } from "./nettbutikk";

export type PackInput = { name: string; city: string };

export type PackPage = { path: string; title: string; showInMenu: boolean; content: PageContent };

/**
 * En bransjepakke er ferdig innhold, ikke et prisnivå: sider, seksjoner, tekstutkast og schema.org-type.
 * Utseendet velges separat blant temaene (lib/themes.ts), og alle temaer kan brukes med alle pakker.
 */
export type Pack = {
  key: string;
  label: string;
  description: string;
  /** schema.org-type for strukturerte data, f.eks. HomeAndConstructionBusiness. */
  schemaType: string;
  /** Nettbutikk-pakker gir varer, kurv og kasse. Standard er vanlig nettside. */
  kind?: "nettside" | "nettbutikk";
  /** Temaene som passer best for bransjen. Det første er forhåndsvalgt. */
  themes: string[];
  /** Ferdig toppstripe og bunntekst for bransjen. Kunden kan endre alt under Utseende. */
  layout?: Partial<SiteLayout>;
  pages: (input: PackInput) => PackPage[];
};

/** Temaet med oppbygging som passer bransjen best. Står først i listen, og er derfor forhåndsvalgt for nye nettsteder. */
const bestLayout: Record<string, string> = {
  rorlegger: "vakt",
  elektriker: "vakt",
  taktekker: "vakt",
  bilverksted: "vakt",
  handverker: "vakt",
  snekker: "prosjektet",
  maler: "prosjektet",
  anlegg: "prosjektet",
  frisor: "delt",
  hudpleie: "delt",
  massasje: "delt",
  kafe: "menykortet",
  restaurant: "menykortet",
  catering: "menykortet",
  bakeri: "gardsdisken",
  lokalmat: "gardsdisken",
  fysioterapeut: "lokalkontor",
  kiropraktor: "lokalkontor",
  psykolog: "lokalkontor",
  tannlege: "lokalkontor",
  regnskap: "lokalkontor",
  advokat: "lokalkontor",
  renhold: "lokalkontor",
  pt: "timeplan",
  treningssenter: "timeplan",
  yoga: "timeplan",
  kurs: "timeplan",
  fotograf: "sidemeny",
  kunstner: "sidemeny",
  designer: "sidemeny",
  musiker: "plakaten",
  arrangement: "plakaten",
  idrettslag: "avisen",
  lag: "avisen",
  nettbutikk: "hylla",
  klaer: "hylla",
};

/** Pakkene som ikke lages i factory.ts, får toppbildet sitt her. */
const withHeroImage = (pack: Pack): Pack => {
  const hero = packImages[pack.key]?.hero;
  if (!hero || !["handverker", "nettbutikk", "klaer", "interior", "lokalmat"].includes(pack.key)) return pack;
  return {
    ...pack,
    pages: (input) =>
      pack.pages(input).map((page) => ({
        ...page,
        content: { ...page.content, sections: page.content.sections.map((s) => (s.type === "hero" ? { ...s, variant: "bilde", props: { ...s.props, bilde: hero } } : s)) },
      })),
  };
};

const withBestLayout = (pack: Pack): Pack => {
  const best = bestLayout[pack.key];
  return withHeroImage(best ? { ...pack, themes: [best, ...pack.themes.filter((t) => t !== best)] } : pack);
};

export const packs: Record<string, Pack> = Object.fromEntries(
  [handverker, nettbutikk, ...shopVariants, ...servicePacks].map((pack) => [pack.key, withBestLayout(pack)]),
);

export function getPack(key: string): Pack | null {
  return packs[key] ?? null;
}

/** Ukjente eller fjernede pakker faller tilbake til en nøytral type, så siden fortsatt får strukturerte data. */
export function schemaTypeFor(packKey: string): string {
  return getPack(packKey)?.schemaType ?? "LocalBusiness";
}
