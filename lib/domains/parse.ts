export class DomainError extends Error {}

export type DomainKind = "apex" | "www" | "sub";
export type ParsedDomain = { root: string; entries: { hostname: string; kind: DomainKind }[] };

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(xn--[a-z0-9-]{1,59}|[a-z]{2,63})$/;

/** Domenet selv, eller et under- eller overdomene av det. */
function overlaps(host: string, other: string): boolean {
  return host === other || host.endsWith(`.${other}`) || other.endsWith(`.${host}`);
}

/**
 * Leser det kunden skriver, for eksempel «https://www.Firma.no/om-oss», «firma.no» eller «blåbær.no»,
 * og gir vertsnavnene som skal kobles. Et vanlig domene (to ledd) gir www og hoveddomenet.
 * Et underdomene som butikk.firma.no kobles alene. Æ, ø og å lagres som punycode (xn--), slik nettlesere sender dem.
 */
export function parseDomainInput(input: string, blocked: string[] = []): ParsedDomain {
  const raw = input.trim().toLowerCase();
  if (!raw) throw new DomainError("Skriv inn domenet, for eksempel firmanavn.no");
  if (raw.includes("@")) throw new DomainError("Det ser ut som en e-postadresse. Skriv bare domenet, for eksempel firmanavn.no");
  const text = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#\s]/)[0]
    .replace(/\.$/, "");

  let hostname: string;
  try {
    hostname = new URL(`http://${text}`).hostname.replace(/\.$/, "");
  } catch {
    throw new DomainError("Det ser ikke ut som et gyldig domene. Skriv det slik: firmanavn.no");
  }
  const labels = hostname.split(".");
  const valid = labels.length >= 2 && hostname.length <= 253 && labels.every((l) => LABEL.test(l)) && TLD.test(labels.at(-1)!);
  if (!valid) throw new DomainError("Det ser ikke ut som et gyldig domene. Skriv det slik: firmanavn.no");

  const bare = labels[0] === "www" && labels.length > 2 ? labels.slice(1).join(".") : hostname;
  if (blocked.some((b) => b && overlaps(bare, b))) throw new DomainError("Dette domenet hører til plattformen og kan ikke kobles til et nettsted");

  if (bare.split(".").length === 2) {
    return {
      root: bare,
      entries: [
        { hostname: `www.${bare}`, kind: "www" },
        { hostname: bare, kind: "apex" },
      ],
    };
  }
  return { root: bare, entries: [{ hostname: bare, kind: "sub" }] };
}

// Punycode (RFC 3492), bare dekoding, så «xn--blbr-roah.no» kan vises som «blåbær.no» i studioet.
const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;

function adapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return Math.floor(k + ((BASE - T_MIN + 1) * d) / (d + 38));
}

function digit(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61;
  return BASE;
}

function decodeLabel(encoded: string): string {
  const output: number[] = [];
  const basic = Math.max(encoded.lastIndexOf("-"), 0);
  for (let j = 0; j < basic; j++) output.push(encoded.charCodeAt(j));
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = basic > 0 ? basic + 1 : 0; index < encoded.length; ) {
    const oldi = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (index >= encoded.length) throw new Error("ugyldig punycode");
      const d = digit(encoded.charCodeAt(index++));
      if (d >= BASE) throw new Error("ugyldig punycode");
      i += d * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (d < t) break;
      w *= BASE - t;
    }
    const length = output.length + 1;
    bias = adapt(i - oldi, length, oldi === 0);
    n += Math.floor(i / length);
    i %= length;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/** Vertsnavnet slik folk skriver det: «xn--blbr-roah.no» blir «blåbær.no». */
export function displayHost(hostname: string): string {
  return hostname
    .split(".")
    .map((label) => {
      if (!label.startsWith("xn--")) return label;
      try {
        return decodeLabel(label.slice(4));
      } catch {
        return label;
      }
    })
    .join(".");
}
