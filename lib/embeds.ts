import type { PageContent } from "@/lib/content/types";

/**
 * Innhold fra andre tjenester (kart og video). Ingenting her lastes før den besøkende trykker,
 * så ingen får IP-adressen eller setter informasjonskapsler før det.
 */

/**
 * Video-ID-en fra en YouTube-lenke, eller null. Godtar vanlige lenker, korte youtu.be-lenker,
 * Shorts og innbyggingslenker. ID-en er alltid 11 tegn, så den kan trygt settes inn i en adresse.
 */
export function youtubeId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname);
      id = m ? m[1] : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Adressen som spiller av videoen. youtube-nocookie.com lagrer ikke informasjonskapsler før videoen spilles. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

/** Lenker til kartet. Brukes både før og etter at kartet er åpnet, så adressen alltid kan slås opp. */
export function mapLinks(address: string) {
  const q = encodeURIComponent(address);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    osm: `https://www.openstreetmap.org/search?query=${q}`,
    // Udokumentert adresse, men den eneste som virker med bare adressen og uten API-nøkkel (sjekket 2. november 2026).
    // Googles dokumenterte Maps Embed API (google.com/maps/embed/v1/place) krever nøkkel og faktureringskonto, og
    // OpenStreetMap sin innbygging (export/embed.html) trenger koordinater, som vi ikke har uten geokoding.
    // Slutter den å virke, viser rammen en feil, og lenkene under kartet virker fortsatt.
    embed: `https://maps.google.com/maps?q=${q}&output=embed`,
  };
}

/**
 * Hvilke tjenester de publiserte sidene henter innhold fra når den besøkende trykker. Personvernerklæringen
 * nevner bare det som faktisk er i bruk. Avslåtte seksjoner og kart som bare har lenker, teller ikke.
 */
export function embeddedServices(contents: readonly PageContent[]): { kart: boolean; video: boolean } {
  const sections = contents.flatMap((c) => c.sections ?? []).filter((s) => !s.hidden);
  return {
    kart: sections.some((s) => s.type === "kart" && s.variant !== "lenker"),
    video: sections.some((s) => s.type === "video" && typeof s.props.lenke === "string" && youtubeId(s.props.lenke) !== null),
  };
}
