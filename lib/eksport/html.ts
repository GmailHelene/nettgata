import { mediaFileKeyPattern } from "@/lib/media-types";

/**
 * Gjør de publiserte sidene om til statiske HTML-filer som kan åpnes fra en mappe eller legges ut et annet sted.
 * Sidene hentes ferdig rendret fra nettstedet (samme HTML som besøkende får), og her skrives adressene om:
 * - CSS og fonter (/_next/static/...) og bilder (/media/...) blir relative stier til filer i ZIP-en
 * - lenker mellom sidene blir relative lenker til index.html i riktig mappe
 * - lenker til det som ikke kan være statisk (handlekurv, kasse, skjema) går til det levende nettstedet
 * JavaScript fjernes. Sidene er lesbare uten, men handlekurv, skjema og timebestilling virker bare på nettstedet.
 */

/** Mappen i ZIP-en der den statiske kopien ligger. */
export const SITE_DIR = "nettsted";

/** Filen en side lagres som, relativt til SITE_DIR. «/» blir index.html, «/om-oss» blir om-oss/index.html. */
export function fileForPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/index.html` : "index.html";
}

/** Hvor mange mapper ned en fil ligger, relativt til SITE_DIR. */
const depthOf = (file: string) => file.split("/").length - 1;

function relative(fromFile: string, toFile: string): string {
  return "../".repeat(depthOf(fromFile)) + toFile;
}

export type Asset = { kind: "static"; path: string } | { kind: "media"; key: string };

export type RewriteOptions = {
  /** /vis/<slug> når sidene hentes via plattformens adresse, ellers tom. */
  basePath: string;
  /** Stiene som eksporteres som egne filer, for eksempel «/» og «/om-oss». */
  pages: Set<string>;
  /** Adressen til det levende nettstedet, for lenker som ikke kan være statiske. */
  liveUrl: string;
};

const decodeAmp = (value: string) => value.replace(/&amp;/g, "&");

/**
 * Én adresse fra HTML eller CSS. Gir den nye adressen og eventuelt en fil som må hentes.
 * `fromFile` er filen adressen står i, relativt til SITE_DIR.
 */
export function rewriteUrl(raw: string, fromFile: string, options: RewriteOptions): { url: string; asset?: Asset } {
  const value = decodeAmp(raw.trim());
  if (!value.startsWith("/") || value.startsWith("//")) return { url: raw };
  const hashAt = value.indexOf("#");
  const hash = hashAt === -1 ? "" : value.slice(hashAt);
  const withoutHash = hashAt === -1 ? value : value.slice(0, hashAt);
  const [pathname, query = ""] = withoutHash.split("?");

  if (pathname.startsWith("/_next/static/")) {
    const file = pathname.slice(1);
    return { url: relative(fromFile, file), asset: { kind: "static", path: pathname } };
  }
  if (pathname.startsWith("/media/")) {
    const key = pathname.slice("/media/".length);
    if (mediaFileKeyPattern.test(key)) return { url: relative(fromFile, `media/${key}`), asset: { kind: "media", key } };
    return { url: raw };
  }

  // Lenker inne på nettstedet. Via plattformens adresse starter de med /vis/<slug>.
  let sitePath: string | null = pathname;
  if (options.basePath) {
    if (pathname === options.basePath) sitePath = "/";
    else if (pathname.startsWith(`${options.basePath}/`)) sitePath = pathname.slice(options.basePath.length);
    else sitePath = null;
  }
  if (sitePath === null) return { url: raw };
  const normalized = sitePath.length > 1 ? sitePath.replace(/\/+$/, "") : sitePath;
  if (!query && options.pages.has(normalized)) return { url: relative(fromFile, fileForPath(normalized)) + hash };
  return { url: `${options.liveUrl.replace(/\/+$/, "")}${normalized === "/" ? "/" : normalized}${query ? `?${query}` : ""}${hash}`.replace(/&/g, "&amp;") };
}

/** Skriver om én side. Gir HTML-en og filene den trenger. */
export function rewriteHtml(html: string, file: string, options: RewriteOptions): { html: string; assets: Asset[] } {
  const assets: Asset[] = [];
  const take = (raw: string) => {
    const result = rewriteUrl(raw, file, options);
    if (result.asset) assets.push(result.asset);
    return result.url;
  };

  let out = html
    // JavaScript fra Next.js trengs ikke i en statisk kopi, og ville prøvd å laste resten av appen.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*\bas="script"[^>]*>/gi, "")
    .replace(/<link\b[^>]*\brel="(?:modulepreload|preload)"[^>]*\.js[^>]*>/gi, "")
    .replace(/<noscript>([\s\S]*?)<\/noscript>/gi, "$1");

  out = out.replace(/\b(href|src)="([^"]*)"/gi, (_m, attr: string, value: string) => `${attr}="${take(value)}"`);
  out = out.replace(/\b(srcset|imagesrcset)="([^"]*)"/gi, (_m, attr: string, value: string) => {
    const list = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [url, ...descriptor] = part.split(/\s+/);
        return [take(url), ...descriptor].join(" ");
      });
    return `${attr}="${list.join(", ")}"`;
  });
  // Bakgrunnsbilder i style-attributter: url(/media/...) eller url(&quot;/media/...&quot;).
  out = out.replace(/url\((&quot;|["'])?(\/[^"'&)]+)(&quot;|["'])?\)/g, (_m, open: string | undefined, url: string, close: string | undefined) => {
    return `url(${open ?? ""}${take(url)}${close ?? ""})`;
  });
  return { html: out, assets };
}

/**
 * Skriver om url(...) i en CSS-fil fra /_next/static. Relative adresser (../media/font.woff2) løses opp mot
 * CSS-filens egen sti, så fontene hentes og ligger på samme sted i forhold til filen som før.
 */
export function rewriteCss(css: string, cssPath: string): { css: string; assets: Asset[] } {
  const assets: Asset[] = [];
  const file = cssPath.slice(1);
  const out = css.replace(/url\((["']?)([^"')]+)\1\)/g, (match, quote: string, url: string) => {
    if (/^(data:|https?:|#)/.test(url)) return match;
    const resolved = new URL(url, `https://x${cssPath}`).pathname;
    if (!resolved.startsWith("/_next/static/")) return match;
    assets.push({ kind: "static", path: resolved });
    return `url(${quote}${relative(file, resolved.slice(1))}${quote})`;
  });
  return { css: out, assets };
}
