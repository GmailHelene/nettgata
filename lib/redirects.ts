/**
 * 301-omdirigeringer når en kunde flytter fra en gammel nettside, så lenker og plassering i Google blir med.
 * Lagres per nettsted (sites.redirects). Brukes bare når adressen ikke finnes på det nye nettstedet, eller når
 * den gamle adressen hadde en spørring som WordPress sine «/?page_id=12».
 */

import { isLocalPath } from "@/lib/content/fields";

export type Redirect = { from: string; to: string };
export const MAX_REDIRECTS = 500;

/** Stier plattformen eier selv. Dit skal ingen omdirigering kunne peke fra. */
const reserved = /^\/(studio|api|media|_next|vis)(\/|$)/;

/**
 * Gammel adresse som sti med eventuell spørring: full URL eller sti, små bokstaver, uten skråstrek til slutt.
 * Gir null for det som ikke kan brukes.
 */
export function normalizeFrom(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://gammel.invalid");
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return null;
  }
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  if (reserved.test(path)) return null;
  const query = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const result = query ? `${path}?${query}` : path;
  return result.length <= 500 ? result : null;
}

/** Ny adresse: en sti på nettstedet eller en full https-adresse. Stier som nettleseren tolker som et annet nettsted, stoppes. */
export function normalizeTo(input: string): string | null {
  const raw = input.trim();
  if (raw.length > 500) return null;
  if (raw.startsWith("/")) return isLocalPath(raw) ? raw : null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Leser en liste med én omdirigering per linje: «gammel ny», «gammel,ny» eller «gammel;ny».
 * Senere linjer for samme gamle adresse vinner. Feil samles per linje, så kunden ser hva som må rettes.
 */
export function parseRedirectList(text: string): { redirects: Redirect[]; errors: string[] } {
  const byFrom = new Map<string, string>();
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.split(/[\s,;]+/).filter(Boolean);
    if (parts.length !== 2) {
      errors.push(`Linje ${i + 1}: skriv gammel og ny adresse, skilt med mellomrom`);
      return;
    }
    const from = normalizeFrom(parts[0]);
    const to = normalizeTo(parts[1]);
    if (!from) errors.push(`Linje ${i + 1}: «${parts[0]}» er ikke en gammel adresse som kan brukes`);
    else if (from === "/") errors.push(`Linje ${i + 1}: forsiden kan ikke sendes videre`);
    else if (!to) errors.push(`Linje ${i + 1}: «${parts[1]}» må starte med / eller https://`);
    else if (to === from) errors.push(`Linje ${i + 1}: adressen sender til seg selv`);
    else byFrom.set(from, to);
  });
  const redirects = [...byFrom].map(([from, to]) => ({ from, to }));
  if (redirects.length > MAX_REDIRECTS) errors.push(`Maks ${MAX_REDIRECTS} omdirigeringer per nettsted`);
  return { redirects: redirects.slice(0, MAX_REDIRECTS), errors };
}

/**
 * Finner målet for en forespørsel. Med spørring: eksakt treff først, så bare stien.
 * `exactOnly` brukes når siden finnes: da sendes bare gamle adresser med nøyaktig samme spørring videre.
 */
export function findRedirect(list: Redirect[] | null | undefined, pathname: string, search = "", exactOnly = false): string | null {
  if (!list?.length) return null;
  const withQuery = normalizeFrom(`${pathname}${search}`);
  const pathOnly = exactOnly ? null : normalizeFrom(pathname);
  for (const key of [withQuery, pathOnly]) {
    const hit = key && list.find((r) => r.from === key);
    // Lagret før regelen ble strengere? En sti som nettleseren ville tolket som et annet nettsted, brukes ikke.
    if (hit) return hit.to.startsWith("/") && !isLocalPath(hit.to) ? null : hit.to;
  }
  return null;
}
