import type { PageContent, Section } from "@/lib/content/types";
import { hasExampleText } from "@/lib/content/examples";
import type { SiteInfo } from "@/lib/site-info";

/**
 * SEO som lager seg selv: tittel og beskrivelse for Google ut fra det kunden allerede har fylt inn
 * (navn, bransje, sted og teksten på siden). Regelbasert og gratis. Det kunden skriver selv, vinner alltid.
 */

/** Så mange tegn får tittelen og beskrivelsen vi lager. Google viser rundt 60 og 155-160. */
export const AUTO_TITLE_CHARS = 60;
export const AUTO_DESCRIPTION_CHARS = 155;

/**
 * Ordet folk søker på, per bransjepakke. Brukes som «Rørlegger i Drammen | Hansen Rør AS».
 * Tomt der bransjen ikke er et søkeord i seg selv (lag, foreninger, band), da står navnet alene.
 */
const keywords: Record<string, string> = {
  handverker: "Håndverker",
  rorlegger: "Rørlegger",
  elektriker: "Elektriker",
  snekker: "Snekker",
  maler: "Maler",
  taktekker: "Taktekker",
  anlegg: "Anleggsgartner",
  frisor: "Frisør",
  hudpleie: "Hudpleie",
  massasje: "Massasje",
  fysioterapeut: "Fysioterapeut",
  kiropraktor: "Kiropraktor",
  psykolog: "Psykolog",
  tannlege: "Tannlege",
  kafe: "Kafé",
  restaurant: "Restaurant",
  bakeri: "Bakeri",
  catering: "Catering",
  konsulent: "Konsulent",
  regnskap: "Regnskapsfører",
  advokat: "Advokat",
  eiendom: "Eiendomsmegler",
  it: "IT-tjenester",
  kunstner: "Kunstner",
  fotograf: "Fotograf",
  designer: "Designer",
  pt: "Personlig trener",
  treningssenter: "Treningssenter",
  yoga: "Yoga",
  kurs: "Dans og kampsport",
  overnatting: "Overnatting",
  guide: "Opplevelser",
  bilverksted: "Bilverksted",
  renhold: "Rengjøring",
  flytting: "Flyttebyrå",
  // Nettbutikkene selger på nett til hele landet. Der blir det «Klær på nett», ikke et sted.
  klaer: "Klær",
  interior: "Interiør og gaver",
  lokalmat: "Lokalmat",
};

export function bransjeKeyword(packKey: string | null | undefined): string {
  return (packKey && keywords[packKey]) || "";
}

/** «Drammen, Lier og Kongsberg» blir tre steder. Komma, semikolon, linjeskift og «og» skiller. */
export function parseServiceArea(text: string | undefined): string[] {
  const places = (text ?? "")
    .split(/\s*(?:[,;\n]|\bog\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  // Samme sted to ganger telles én gang. Skrivemåten fra første gang beholdes.
  return places.filter((p, i) => places.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i).slice(0, 20);
}

/** Stedet som brukes i titlene: det første i «Område vi dekker», ellers poststedet. */
export function primaryPlace(info: Pick<SiteInfo, "city"> & { serviceArea?: string }): string {
  return parseServiceArea(info.serviceArea)[0] ?? info.city.trim();
}

const includes = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());

/** Første kandidat som får plass. Er ingen korte nok, brukes den korteste. */
function firstThatFits(candidates: string[], max: number): string {
  const unique = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
  return unique.find((c) => c.length <= max) ?? unique.sort((a, b) => a.length - b.length)[0] ?? "";
}

export type TitleInput = {
  pageTitle: string;
  path: string;
  siteName: string;
  keyword?: string;
  place?: string;
  /** Nettbutikk: «Klær på nett» i stedet for et sted. */
  shop?: boolean;
};

/**
 * Tittelen for Google når kunden ikke har skrevet en selv.
 * Forsiden starter med bransjen og stedet: «Rørlegger i Drammen | Hansen Rør AS».
 * Undersider: «Tjenester | Rørlegger i Drammen | Hansen Rør AS», kortet ned til den får plass.
 * Blogginnlegg får bare «Tittel | Navn», fordi innlegget handler om noe annet enn bransjen.
 */
export function autoTitle({ pageTitle, path, siteName, keyword = "", place = "", shop = false }: TitleInput): string {
  const name = siteName.trim();
  const title = pageTitle.trim();
  const kw = keyword.trim();
  const where = place.trim();
  // «Rørlegger i Drammen». Står stedet allerede i bransjeordet, gjentas det ikke.
  const local = kw ? (shop ? `${kw} på nett` : where && !includes(kw, where) ? `${kw} i ${where}` : kw) : shop ? "Nettbutikk" : where && !includes(name, where) ? where : "";
  if (path === "/") {
    return firstThatFits([local && !includes(name, local) ? `${local} | ${name}` : "", kw && !shop ? `${kw} | ${name}` : "", name], AUTO_TITLE_CHARS);
  }
  if (path.startsWith("/blogg/")) return firstThatFits([`${title} | ${name}`, title], AUTO_TITLE_CHARS);
  return firstThatFits(
    [local && !includes(title, local) ? `${title} | ${local} | ${name}` : "", includes(title, name) ? title : `${title} | ${name}`, title],
    AUTO_TITLE_CHARS,
  );
}

/** Kutter ved et ordskille og legger på «…». Resultatet er aldri lenger enn `max`. */
export function trimAtWord(text: string, max = AUTO_DESCRIPTION_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const short = clean.slice(0, max - 1);
  const space = short.lastIndexOf(" ");
  return `${(space > max / 2 ? short.slice(0, space) : short).replace(/[\s,.;:!?-]+$/, "")}…`;
}

/** Felt med tekst besøkende leser, i den rekkefølgen de står i seksjonen. Knappetekster og lenker telles ikke. */
const textKeys = ["overskrift", "undertekst", "brodtekst", "tekst", "beskrivelse", "sporsmal", "svar", "sitat", "navn", "rolle", "pris"];
/** Tekst som egner seg som beskrivelse: brødtekst, ikke overskrifter, navn og priser. */
const descriptionKeys = new Set(["undertekst", "brodtekst", "tekst", "beskrivelse", "svar"]);

function collect(value: unknown, keys: Set<string>, out: string[]) {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, keys, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  for (const key of textKeys) {
    if (keys.has(key) && typeof v[key] === "string" && (v[key] as string).trim()) out.push((v[key] as string).trim());
  }
  for (const [key, child] of Object.entries(v)) if (typeof child === "object" && child !== null && key !== "skjemafelt") collect(child, keys, out);
}

/** Seksjonene besøkende ser. Avslåtte seksjoner vises ikke og teller ikke. */
export const visibleSections = (content: Pick<PageContent, "sections">): Section[] => content.sections.filter((s) => !s.hidden);

/** All synlig tekst på siden, til ordtelling. */
export function visibleText(content: Pick<PageContent, "sections">): string {
  const out: string[] = [];
  for (const s of visibleSections(content)) collect(s.props, new Set(textKeys), out);
  return out.join(" ");
}

/**
 * Den første ekte teksten på siden, fylt opp med neste tekstbit til den er lang nok, og kuttet ved et ordskille.
 * Tom når siden ikke har brødtekst.
 */
export function pageTextDescription(content: Pick<PageContent, "sections">): string {
  const parts: string[] = [];
  // Seksjoner med eksempeltekst fra pakkene og biblioteket hoppes over, så Google aldri får «Skriv ...».
  for (const s of visibleSections(content)) if (!hasExampleText(s)) collect(s.props, descriptionKeys, parts);
  let text = "";
  for (const part of parts) {
    const sentence = /[.!?…]$/.test(part) ? part : `${part}.`;
    text = text ? `${text} ${sentence}` : sentence;
    if (text.length >= 120) break;
  }
  return text && trimAtWord(text);
}

/** «Rørlegger» blir «rørlegger» midt i en setning. «IT-tjenester» beholdes. */
const midSentence = (word: string) => (/^\p{Lu}\p{Ll}/u.test(word) ? word[0].toLowerCase() + word.slice(1) : word);

/**
 * Beskrivelsen for Google når kunden ikke har skrevet en: teksten på siden (over).
 * Uten tekst lages én setning av navn, bransje og sted.
 */
export function autoDescription(input: { content: Pick<PageContent, "sections">; siteName: string; pageTitle: string; path: string; keyword?: string; place?: string }): string {
  const text = pageTextDescription(input.content);
  if (text) return text;
  const kw = midSentence(input.keyword?.trim() ?? "");
  const where = input.place?.trim() ?? "";
  const what = [kw, where && `i ${where}`].filter(Boolean).join(" ");
  if (input.path === "/") return trimAtWord(what ? `${input.siteName}: ${what}.` : `${input.siteName}.`);
  return trimAtWord(`${input.pageTitle} hos ${input.siteName}${where ? ` i ${where}` : ""}.`);
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Leselig adresse: bare a-z, tall og bindestrek. æ, ø og å skrives om i adressen, aldri i teksten. */
export function readableSlug(path: string): boolean {
  return path.split("/").filter(Boolean).every((part) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(part) && part.length <= 60);
}

/** Adressen skrevet om til leselige tegn: /Våre-tjenester blir /vare-tjenester. */
export function slugPath(path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/æ/g, "ae")
        .replace(/ø/g, "o")
        .replace(/å/g, "a")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);
  return `/${parts.join("/")}`;
}

/** Varesiden: «Strikket lue, Blå, 399 kr | Ullstua». Navn, en egenskap, pris og butikk, kortet ned til den får plass. */
export function productTitle(input: { name: string; attribute?: string; price?: string; shopName: string }): string {
  const { name, shopName } = input;
  const attr = input.attribute?.trim() && !includes(name, input.attribute.trim()) ? input.attribute.trim() : "";
  const price = input.price?.trim() ?? "";
  return firstThatFits(
    [
      [name, attr, price].filter(Boolean).join(", ") + ` | ${shopName}`,
      [name, price].filter(Boolean).join(", ") + ` | ${shopName}`,
      `${name} | ${shopName}`,
      name,
    ],
    AUTO_TITLE_CHARS,
  );
}

/** Varer uten beskrivelse får én setning: «Strikket lue fra Ullstua. 399 kr.» */
export function productDescription(input: { name: string; description: string; price?: string; shopName: string }): string {
  const text = input.description.replace(/\s+/g, " ").trim();
  if (text) return trimAtWord(text);
  return trimAtWord(`${input.name} fra ${input.shopName}.${input.price ? ` ${input.price}.` : ""}`);
}

/** «Drammen, Lier og Kongsberg». */
export function listPlaces(places: string[]): string {
  return places.length > 1 ? `${places.slice(0, -1).join(", ")} og ${places[places.length - 1]}` : (places[0] ?? "");
}
