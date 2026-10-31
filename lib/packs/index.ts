import type { PageContent } from "@/lib/content/types";
import type { Theme } from "@/lib/theme";
import { handverker } from "./handverker";

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
  designs: { key: string; label: string; theme: Theme }[];
  pages: (input: PackInput) => PackPage[];
};

export const packs: Record<string, Pack> = {
  [handverker.key]: handverker,
};

export function getPack(key: string): Pack | null {
  return packs[key] ?? null;
}

/** Ukjente eller fjernede pakker faller tilbake til en nøytral type, så siden fortsatt får strukturerte data. */
export function schemaTypeFor(packKey: string): string {
  return getPack(packKey)?.schemaType ?? "LocalBusiness";
}
