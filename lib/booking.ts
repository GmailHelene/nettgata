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
