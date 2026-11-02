/**
 * Import av gamle adresser fra sitemap.xml når en kunde flytter fra en gammel nettside. Kunden limer inn adressen
 * til sitemapen eller laster opp filen. Vi lister de gamle stiene, foreslår den nye siden som ligner mest, og kunden
 * bekrefter før omdirigeringene lagres (lib/redirects.ts).
 *
 * Henting fra nettet er en SSRF-risiko: serveren henter en adresse kunden har skrevet. Derfor:
 * - bare http og https, bare standardporter, ingen brukernavn i adressen
 * - bare offentlige vertsnavn: ikke localhost, interne navn uten punktum eller private og reserverte IP-adresser
 * - videresendinger følges manuelt, maks tre, og hver ny adresse sjekkes på samme måte
 * - tidsgrense per forespørsel og maks størrelse på svaret
 * - sitemap-indeks følges bare ett nivå ned, og bare et begrenset antall filer
 * På Cloudflare Workers kan fetch heller ikke nå private nett, så et vertsnavn som peker til en intern adresse,
 * stoppes også der.
 */

import { MAX_REDIRECTS, normalizeFrom } from "@/lib/redirects";

export class SitemapError extends Error {}

export const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 8000;
/** Hvor mange sitemap-filer en indeks kan peke til før vi stopper. */
export const MAX_CHILD_SITEMAPS = 10;
/** Flere gamle adresser enn det kan uansett ikke lagres som omdirigeringer. */
export const MAX_OLD_PATHS = MAX_REDIRECTS;
const MAX_HOPS = 3;

export type ParsedSitemap = { kind: "urlset" | "index"; locs: string[] };

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return entities[e.toLowerCase()] ?? "";
    })
    .trim();
}

/**
 * Leser <loc> fra en sitemap eller sitemap-indeks. Bare tekstsøk, ingen XML-tolker, så eksterne entiteter og
 * DTD-er (XXE) aldri blir lest. Navnerom foran taggene (<sm:loc>) godtas.
 */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const body = xml.replace(/<!--[\s\S]*?-->/g, "");
  const isIndex = /<(?:[\w-]+:)?sitemapindex[\s>]/i.test(body);
  if (!isIndex && !/<(?:[\w-]+:)?urlset[\s>]/i.test(body)) {
    throw new SitemapError("Fant ingen sitemap i filen. Den skal starte med <urlset> eller <sitemapindex>.");
  }
  const locs = Array.from(body.matchAll(/<(?:[\w-]+:)?loc>([\s\S]*?)<\/(?:[\w-]+:)?loc>/gi), (m) => decodeXml(m[1])).filter(Boolean);
  return { kind: isIndex ? "index" : "urlset", locs };
}

/** IPv4 som fire tall, eller null. URL-tolkeren har allerede gjort om «2130706433» og «0x7f.1» til vanlig form. */
function ipv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.every((n) => n <= 255) ? nums : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Vertsnavn som er trygge å hente fra: offentlige domenenavn og offentlige IPv4-adresser. IPv6-adresser avvises. */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || host.includes(":")) return false;
  const ip = ipv4(host);
  if (ip) return !isPrivateIpv4(ip);
  if (!host.includes(".")) return false;
  if (/\.(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion)$/.test(host) || host === "localhost") return false;
  return /^[a-z0-9.-]+$/.test(host);
}

/** Sjekker en adresse før den hentes. Gir URL-en eller kaster en feil kunden kan lese. */
export function assertFetchableUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SitemapError("Adressen ser ikke riktig ut. Den skal starte med https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SitemapError("Adressen må starte med https:// eller http://");
  if (url.username || url.password) throw new SitemapError("Adressen kan ikke ha brukernavn eller passord");
  if (url.port && url.port !== "80" && url.port !== "443") throw new SitemapError("Adressen kan ikke ha eget portnummer");
  if (!isPublicHost(url.hostname)) throw new SitemapError("Sitemapen må ligge på en offentlig nettside");
  return url;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Leser svaret, men aldri mer enn grensen. Content-Length kan mangle eller lyve, så bytene telles underveis. */
async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) throw new SitemapError("Sitemapen er for stor (maks 5 MB)");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new SitemapError("Sitemapen er for stor (maks 5 MB)");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Henter én sitemap med alle sperrene over. */
export async function fetchSitemapText(
  input: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; maxBytes?: number } = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  let url = assertFetchableUrl(input);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
        headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5", "user-agent": "Nettgata-flytting/1.0" },
      });
    } catch (err) {
      if (err instanceof SitemapError) throw err;
      throw new SitemapError("Fikk ikke svar fra nettsiden. Sjekk adressen, eller last opp sitemap.xml i stedet.");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new SitemapError("Nettsiden sendte videre uten å si hvor");
      url = assertFetchableUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new SitemapError(`Nettsiden svarte med feil (${res.status}). Sjekk adressen, eller last opp sitemap.xml i stedet.`);
    return readLimited(res, opts.maxBytes ?? MAX_SITEMAP_BYTES);
  }
  throw new SitemapError("Nettsiden sendte videre for mange ganger");
}

/** Gamle stier fra en liste med fulle adresser. Forsiden og duplikater hoppes over. */
export function oldPathsFrom(locs: string[]): string[] {
  const paths = new Set<string>();
  for (const loc of locs) {
    const path = normalizeFrom(loc);
    if (path && path !== "/") paths.add(path);
    if (paths.size >= MAX_OLD_PATHS) break;
  }
  return [...paths];
}

/**
 * Henter alle gamle stier, fra adresse eller opplastet fil. En sitemap-indeks følges ett nivå ned
 * (indekser i indeksen hoppes over), og bare de første MAX_CHILD_SITEMAPS filene.
 */
export async function collectOldPaths(
  source: { url: string } | { xml: string },
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<{ paths: string[]; skippedSitemaps: number }> {
  const xml = "xml" in source ? source.xml : await fetchSitemapText(source.url, opts);
  if (xml.length > MAX_SITEMAP_BYTES) throw new SitemapError("Sitemapen er for stor (maks 5 MB)");
  const top = parseSitemapXml(xml);
  if (top.kind === "urlset") return { paths: oldPathsFrom(top.locs), skippedSitemaps: 0 };

  const children = top.locs.slice(0, MAX_CHILD_SITEMAPS);
  const locs: string[] = [];
  let skipped = top.locs.length - children.length;
  for (const child of children) {
    try {
      const parsed = parseSitemapXml(await fetchSitemapText(child, opts));
      if (parsed.kind === "index") skipped++;
      else locs.push(...parsed.locs);
    } catch (err) {
      if (!(err instanceof SitemapError)) throw err;
      skipped++;
    }
    if (locs.length >= MAX_OLD_PATHS) break;
  }
  return { paths: oldPathsFrom(locs), skippedSitemaps: skipped };
}

/** Ord i en sti eller tittel: små bokstaver, æ, ø og å skrevet om, filendelser og tall-ID-er fjernet. */
export function slugWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\?.*$/, "")
    .replace(/\.(html?|php|aspx?|jsp)$/, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !["index", "www", "no", "nb", "page", "side"].includes(w));
}

/** Likhet mellom to ordlister, 0 til 1 (Dice på bokstavpar), så «tjeneste» og «tjenester» ligner. */
export function similarity(a: string[], b: string[]): number {
  const pairs = (words: string[]) => {
    const text = words.join(" ");
    const out = new Map<string, number>();
    for (let i = 0; i < text.length - 1; i++) {
      const pair = text.slice(i, i + 2);
      if (pair.includes(" ")) continue;
      out.set(pair, (out.get(pair) ?? 0) + 1);
    }
    return out;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let total = 0;
  let shared = 0;
  for (const n of pa.values()) total += n;
  for (const n of pb.values()) total += n;
  for (const [pair, n] of pa) shared += Math.min(n, pb.get(pair) ?? 0);
  return total ? (2 * shared) / total : 0;
}

export type ImportRow = {
  /** Gammel sti, som den lagres i omdirigeringene. */
  from: string;
  /** Foreslått ny side, eller null når ingen ligner nok. */
  suggestion: string | null;
  /** Adressen finnes allerede på det nye nettstedet. Da trengs ingen omdirigering. */
  exists: boolean;
};

const MIN_SIMILARITY = 0.5;

/**
 * Foreslår ny side for hver gammel sti. Siste del av stien sammenlignes med siste del av hver ny sti og med
 * sidetittelen, og den beste over terskelen vinner. Ingen forslag er bedre enn et feil forslag.
 */
export function suggestRedirects(oldPaths: string[], pages: { path: string; title: string }[]): ImportRow[] {
  const existing = new Set(pages.map((p) => p.path));
  const candidates = pages.map((p) => ({
    path: p.path,
    words: [slugWords(p.path.split("/").filter(Boolean).pop() ?? ""), slugWords(p.title)],
  }));
  return oldPaths.map((from) => {
    if (existing.has(from)) return { from, suggestion: null, exists: true };
    const segments = from.replace(/\?.*$/, "").split("/").filter(Boolean);
    const words = slugWords(segments.pop() ?? "");
    let best: { path: string; score: number } | null = null;
    if (words.length) {
      for (const c of candidates) {
        const score = Math.max(...c.words.map((w) => similarity(words, w)));
        if (score >= MIN_SIMILARITY && (!best || score > best.score)) best = { path: c.path, score };
      }
    }
    return { from, suggestion: best?.path ?? null, exists: false };
  });
}
