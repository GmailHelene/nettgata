import type { PageContent } from "@/lib/content/types";
import type { SiteLayout } from "@/lib/site-layout";
import type { Theme } from "@/lib/theme";
import { handverker } from "./handverker";
import { nettbutikk } from "./nettbutikk";

export type PackInput = { name: string; city: string };

export type PackPage = { path: string; title: string; showInMenu: boolean; content: PageContent };

/**
 * En bransjepakke er ferdig oppsett, ikke et prisnivå: sider, seksjoner,
 * tekstutkast, schema.org-type og designretninger som passer bransjen.
 */
export type Pack = {
  key: string;
  label: string;
  description: string;
  /** schema.org-type for strukturerte data, f.eks. HomeAndConstructionBusiness. */
  schemaType: string;
  /** Nettbutikk-pakker gir varer, kurv og kasse. Standard er vanlig nettside. */
  kind?: "nettside" | "nettbutikk";
  designs: { key: string; label: string; theme: Theme }[];
  /** Ferdig toppstripe og bunntekst for bransjen. Kunden kan endre alt under Utseende. */
  layout?: Partial<SiteLayout>;
  pages: (input: PackInput) => PackPage[];
};

export const packs: Record<string, Pack> = {
  [handverker.key]: handverker,
  [nettbutikk.key]: nettbutikk,
};

export function getPack(key: string): Pack | null {
  return packs[key] ?? null;
}

/** Ukjente eller fjernede pakker faller tilbake til en nøytral type, så siden fortsatt får strukturerte data. */
export function schemaTypeFor(packKey: string): string {
  return getPack(packKey)?.schemaType ?? "LocalBusiness";
}
