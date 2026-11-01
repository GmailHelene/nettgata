import { isSafeHref } from "@/lib/content/fields";
import type { PageContent } from "@/lib/content/types";

/**
 * Bookingsystemer som kan bygges inn på nettstedet (seksjonen «Timebestilling»). Andre lenker vises som en vanlig
 * knapp. Om innbyggingen faktisk virker, bestemmer systemet selv, så seksjonen viser alltid en lenke ved siden av.
 */
export const embeddableBookingHosts = [
  "timma.no",
  "fresha.com",
  "resos.com",
  "dinnerbooking.com",
  "calendly.com",
  "spond.com",
  "ticketco.events",
  "hoopla.no",
] as const;

/**
 * Bookingsystemene som er bygget inn på de publiserte sidene, sortert og uten dubletter. Samme regel som seksjonen
 * selv bruker, så personvernerklæringen nevner nøyaktig de systemene den besøkende kan åpne.
 */
export function embeddedBookingHosts(contents: readonly PageContent[]): string[] {
  const hosts = contents.flatMap((content) =>
    content.sections.flatMap((s) => {
      const link = s.type === "bestill" && s.variant === "innebygd" ? s.props.lenke : null;
      const host = typeof link === "string" && isSafeHref(link) ? embeddableHost(link) : null;
      return host ? [host] : [];
    }),
  );
  return [...new Set(hosts)].sort();
}

/** Navnet på systemet lenken går til, eller null hvis den ikke kan bygges inn. Bare https. */
export function embeddableHost(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  return embeddableBookingHosts.find((h) => host === h || host.endsWith(`.${h}`)) ?? null;
}
