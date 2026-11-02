/**
 * «Del på Facebook» ved AI-teamets innleggsforslag. Ingen Meta-app, ingen API og ingen sporing: knappen kopierer
 * teksten og åpner Facebooks egen delingsside med adressen til nettstedet. Facebook fyller ikke inn tekst selv
 * (forhåndsutfylt tekst er ikke lov etter plattformreglene deres), så kopieringen er det som gjør at det virker.
 */

export const FACEBOOK_SHARER = "https://www.facebook.com/sharer/sharer.php";

/** Delingslenken til Facebook for en side på nettstedet. Null hvis adressen ikke er en vanlig http- eller https-adresse. */
export function facebookShareUrl(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  url.hash = "";
  return `${FACEBOOK_SHARER}?u=${encodeURIComponent(url.toString())}`;
}

/** Siden innlegget handler om hvis den er publisert, ellers forsiden. */
export function sharePageUrl(siteUrl: string, pagePath: string | null): string {
  const base = siteUrl.replace(/\/+$/, "");
  if (!pagePath) return `${base}/`;
  const path = pagePath.replace(/^\/+/, "");
  return path ? `${base}/${path}` : `${base}/`;
}
