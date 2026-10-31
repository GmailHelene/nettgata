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

/**
 * http:// sendes til https:// på alle adresser, også kundenes egne domener. Innloggingen bruker en
 * informasjonskapsel som bare sendes over https, og ingen side skal kunne vises ukryptert.
 * Cloudflares egne sertifikatsjekker under /.well-known/ og lokal utvikling får være i fred.
 */
export function httpsRedirect(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  if (url.protocol !== "http:") return null;
  if (url.pathname.startsWith("/.well-known/")) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) return null;
  url.protocol = "https:";
  return url.toString();
}
