/**
 * Plattformens ekstra adresser (nettgata.com, www.nettgata.no) sender alltid videre til hovedadressen.
 * Kjøres i custom-worker.ts før Next.js starter, så videresendingen koster nesten ingenting.
 * Uten innstillinger (tomme variabler) gjør den ingenting.
 */
export function platformRedirect(requestUrl: string, aliases: string | undefined, canonicalHost: string | undefined): string | null {
  const target = (canonicalHost ?? "").trim().toLowerCase();
  if (!target) return null;
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase();
  const list = (aliases ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (host === target || !list.includes(host)) return null;
  return `https://${target}${url.pathname}${url.search}`;
}
