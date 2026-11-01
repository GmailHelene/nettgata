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

export const packs: Record<string, Pack> = Object.fromEntries(
  [handverker, nettbutikk, ...shopVariants, ...servicePacks].map((pack) => [pack.key, pack]),
);

export function getPack(key: string): Pack | null {
  return packs[key] ?? null;
}

/** Ukjente eller fjernede pakker faller tilbake til en nøytral type, så siden fortsatt får strukturerte data. */
export function schemaTypeFor(packKey: string): string {
  return getPack(packKey)?.schemaType ?? "LocalBusiness";
}
