import type { DnsResolver } from "./services";

/**
 * CAA-poster bestemmer hvilke utstedere som får lage sertifikat for et domene. Domeneshop og andre setter ofte
 * bare «letsencrypt.org», mens Cloudflare ellers velger Google Trust Services. Da blir sertifikatet aldri utstedt,
 * og domenet virker bare over http. Derfor velger vi utsteder ut fra kundens egne CAA-poster.
 */

export type CertificateAuthority = "lets_encrypt" | "google" | "ssl_com";

/** Utstederne Cloudflare for SaaS kan bruke, i den rekkefølgen vi foretrekker dem. */
const authorities: [CertificateAuthority, string][] = [
  ["lets_encrypt", "letsencrypt.org"],
  ["google", "pki.goog"],
  ["ssl_com", "ssl.com"],
];

/** «0 issue "letsencrypt.org"» blir { tag: "issue", value: "letsencrypt.org" }. */
export function parseCaa(data: string): { tag: string; value: string } | null {
  const match = /^\d+\s+([a-z0-9]+)\s+"?([^"]*)"?$/i.exec(data.trim());
  return match ? { tag: match[1].toLowerCase(), value: match[2].trim() } : null;
}

/**
 * Utstederen vi kan bruke for vertsnavnet. CAA arves fra nærmeste foreldredomene som har poster, slik
 * utstederne selv leser dem. Uten CAA er alle tillatt. Gir null når CAA sperrer alle tre.
 */
export async function allowedAuthority(resolver: DnsResolver, hostname: string): Promise<CertificateAuthority | null> {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const { answers } = await resolver.lookup(labels.slice(i).join("."), "CAA");
    const records = answers
      .filter((a) => a.type === 257)
      .map((a) => parseCaa(a.data))
      .filter((r): r is { tag: string; value: string } => r !== null);
    if (records.length === 0) continue;
    const issuers = records.filter((r) => r.tag === "issue").map((r) => r.value.split(";")[0].trim().toLowerCase());
    // Bare iodef eller issuewild: ingen begrensning på vanlige sertifikater.
    if (issuers.length === 0) return authorities[0][0];
    return authorities.find(([, domain]) => issuers.includes(domain))?.[0] ?? null;
  }
  return authorities[0][0];
}
