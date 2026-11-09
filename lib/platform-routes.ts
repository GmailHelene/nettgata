import type { Metadata } from "next";
import { genres, lowerLabel, type BransjeMatch } from "@/lib/genres";
import { GRONBERG, TEKSTVERSJON } from "@/lib/legal/felles";
import { plattformDokument, PRISER } from "@/lib/legal/plattform";
import { getPack } from "@/lib/packs";

/**
 * Sidene på plattformens egen adresse (nettgata.no). De ligger i samme rute som kundenettstedene, men
 * slås bare opp når vertsnavnet er plattformens, så en kunde kan fortsatt ha en egen side som heter /nettbutikk.
 *
 * Søkeordene hver side er bygget for (ett hovedsøk per side, så sidene ikke konkurrerer med hverandre i Google):
 * - /                  nettside for bedrift, lage nettside, nettside pris
 * - /nettbutikk        lage nettbutikk, nettbutikk for små bedrifter, nettbutikk med Vipps
 * - /temaer            design og maler for nettside
 * - /bransjer          nettside for bransjen, oversikten
 * - /bransjer/<pakke>  nettside for <bransje> («nettside frisør», «hjemmeside rørlegger»)
 * Sjangrene (håndverk, helse ...) har ingen egne sider. De er ankre på /bransjer, ellers ville «nettside for
 * håndverker» havnet både på sjangeren og på /bransjer/handverker.
 */
export type PlatformRoute =
  | { kind: "landing" }
  | { kind: "nettbutikk" }
  | { kind: "temaer" }
  | { kind: "bransjer" }
  | { kind: "bransje"; match: BransjeMatch }
  | { kind: "juridisk"; doc: "personvern" | "vilkar" | "databehandleravtale" };

/** Hovedadressen når forespørselen ikke sier noe annet (strukturerte data og lokal utvikling). */
export const PLATFORM_DEFAULT_ORIGIN = "https://nettgata.no";

/**
 * Når salgssidene sist ble endret. Brukes som lastmod i sitemap.xml. Settes til dagens dato når tekstene
 * på salgssidene endres. Juridiske sider bruker sin egen dato (TEKSTVERSJON i lib/legal/felles.ts).
 */
export const PLATFORM_CONTENT_UPDATED = "2026-11-02";

/**
 * Bransjer som får egen landingsside. «Annen bedrift» er ingen bransje folk søker etter,
 * og den generelle nettbutikken har sin egen side, /nettbutikk.
 */
export function landingBransjer(): BransjeMatch[] {
  return genres.flatMap((genre) =>
    genre.bransjer
      .filter((b) => b.pack !== "bedrift" && b.pack !== "nettbutikk")
      .map((bransje) => ({ genre, bransje, pack: getPack(bransje.pack)! }))
      .filter((m) => m.pack),
  );
}

export function platformRoute(segments: string[]): PlatformRoute | null {
  const [first, second, ...rest] = segments;
  if (rest.length) return null;
  if (!first) return { kind: "landing" };
  if (second === undefined) {
    if (first === "nettbutikk" || first === "temaer" || first === "bransjer") return { kind: first };
    if (first === "personvern" || first === "vilkar" || first === "databehandleravtale") return { kind: "juridisk", doc: first };
    return null;
  }
  if (first === "bransjer") {
    const match = landingBransjer().find((m) => m.bransje.pack === second);
    return match ? { kind: "bransje", match } : null;
  }
  return null;
}

/** Pakkens eget navn, så «Annet håndverk» i sjangerlisten blir «Nettside for håndverker» her, slik annonsene sier. */
export function bransjeHeading(m: BransjeMatch): string {
  return `${m.pack.kind === "nettbutikk" ? "Nettbutikk" : "Nettside"} for ${lowerLabel(m.pack.label)}`;
}

export function platformPath(route: PlatformRoute): string {
  switch (route.kind) {
    case "landing":
      return "/";
    case "bransje":
      return `/bransjer/${route.match.bransje.pack}`;
    case "juridisk":
      return `/${route.doc}`;
    default:
      return `/${route.kind}`;
  }
}

function allRoutes(): PlatformRoute[] {
  return [
    { kind: "landing" },
    { kind: "nettbutikk" },
    { kind: "temaer" },
    { kind: "bransjer" },
    ...landingBransjer().map((match) => ({ kind: "bransje" as const, match })),
    { kind: "juridisk", doc: "personvern" },
    { kind: "juridisk", doc: "vilkar" },
    { kind: "juridisk", doc: "databehandleravtale" },
  ];
}

/** Alle sidene, til sitemap.xml på plattformens adresse. */
export function platformPaths(): string[] {
  return allRoutes().map(platformPath);
}

/** Datoen siden sist ble endret, til lastmod i sitemap.xml. */
function lastModified(route: PlatformRoute): string {
  // Juridiske tekster har egen dato, som også står på siden («Sist endret ...»).
  return route.kind === "juridisk" ? TEKSTVERSJON : PLATFORM_CONTENT_UPDATED;
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** sitemap.xml for nettgata.no: alle salgssidene, med dato for siste endring. */
export function platformSitemapXml(origin: string): string {
  const base = platformOrigin(origin);
  const urls = allRoutes()
    .map((route) => `<url><loc>${escapeXml(`${base}${platformPath(route)}`)}</loc><lastmod>${lastModified(route)}</lastmod></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** Hovedadressen i kanoniske lenker, også når siden vises via reserveadressen på workers.dev. */
export function platformOrigin(fallback: string): string {
  const host = process.env.PLATFORM_CANONICAL_HOST?.trim();
  return host ? `https://${host}` : fallback;
}

/* ---------- Bransjesidene: det pakken faktisk inneholder ---------- */

type Item = { navn: string; beskrivelse: string };

export type BransjeDetails = {
  /** Toppen av forsiden, med et eksempel på firma og sted. */
  hero: { overskrift: string; undertekst: string; knapp: string };
  services: Item[];
  /** Linjene i prislisten. Prisene fyller kunden inn selv. */
  prices: Item[];
  /** Spørsmålene pakken har ferdig formulert. Svarene skriver kunden. */
  questions: string[];
  pages: { path: string; title: string; sections: string[] }[];
  /** Egne felt i kontaktskjemaet. */
  formFields: string[];
  local: { team?: string; hours: boolean; map: boolean; menu: boolean; gallery: boolean };
  /** «time» når knappen er «Bestill time», «bord» for restauranter. */
  booking: "time" | "bord" | null;
};

const sectionNames: Record<string, string> = {
  hero: "toppfelt med bilde",
  fordeler: "fordeler",
  tjenester: "tjenester",
  bildetekst: "om oss med bilde",
  galleri: "bildegalleri",
  omtaler: "omtaler",
  faq: "spørsmål og svar",
  cta: "kontaktknapp",
  kontakt: "kontaktskjema",
  tekst: "tekst",
  produkter: "varer",
  kategorikort: "kategorier",
  ansatte: "ansatte",
  apningstider: "åpningstider",
  kart: "kart",
  filer: "PDF-meny",
};

/** Plassholdere som «Tjeneste 1» og «Skriv hva som skjer.» er ikke noe å vise fram, så de tas ut. */
const placeholder = (item: Item) => /^Tjeneste \d/.test(item.navn) || /^Skriv\s/.test(item.beskrivelse);

const asItems = (value: unknown): Item[] =>
  Array.isArray(value)
    ? value
        .map((v) => ({ navn: String((v as Item).navn ?? ""), beskrivelse: String((v as Item).beskrivelse ?? "") }))
        .filter((v) => v.navn && !placeholder(v))
    : [];

/** Leser bransjepakken, så siden viser det kunden faktisk får, og ingenting annet. */
export function bransjeDetails(m: BransjeMatch): BransjeDetails {
  const pages = m.pack.pages({ name: "Din bedrift", city: "Modum" });
  const sections = pages.flatMap((p) => p.content.sections);
  const front = pages.find((p) => p.path === "/") ?? pages[0];
  const hero = front?.content.sections.find((s) => s.type === "hero");
  const of = (type: string, variant?: string) => sections.filter((s) => s.type === type && (!variant || s.variant === variant));
  const button = String(hero?.props.knappTekst ?? "");
  const team = of("ansatte")[0];
  return {
    hero: { overskrift: String(hero?.props.overskrift ?? ""), undertekst: String(hero?.props.undertekst ?? ""), knapp: button },
    services: asItems(of("tjenester", "standard")[0]?.props.tjenester),
    prices: asItems(of("tjenester", "liste")[0]?.props.tjenester),
    questions: [
      ...new Set(
        of("faq").flatMap((s) =>
          Array.isArray(s.props.sporsmal) ? s.props.sporsmal.map((q) => String((q as { sporsmal?: string }).sporsmal ?? "")).filter(Boolean) : [],
        ),
      ),
    ],
    pages: pages
      .filter((p) => p.showInMenu)
      .map((p) => ({
        path: p.path,
        title: p.title,
        sections: [
          ...new Set(
            p.content.sections
              .filter((s) => !s.hidden || s.type === "filer")
              .map((s) => (s.type === "tjenester" && s.variant === "liste" ? "prisliste" : (sectionNames[s.type] ?? s.type))),
          ),
        ],
      })),
    formFields: of("kontakt").flatMap((s) =>
      Array.isArray(s.props.skjemafelt) ? s.props.skjemafelt.map((f) => String((f as { etikett?: string }).etikett ?? "")).filter(Boolean) : [],
    ),
    local: {
      team: team ? String(team.props.overskrift ?? "") : undefined,
      hours: of("apningstider").length > 0,
      map: of("kart").length > 0,
      menu: of("filer").length > 0,
      gallery: of("galleri").length > 0,
    },
    booking: button === "Bestill time" ? "time" : button === "Bestill bord" ? "bord" : null,
  };
}

/* ---------- Titler og beskrivelser ---------- */

const SITE = "Nettgata";

const titles: Record<Exclude<PlatformRoute["kind"], "bransje" | "juridisk">, [string, string]> = {
  landing: [
    "Nettside for bedriften, fra 199 kr i måneden | Nettgata",
    "Lag nettside for bedriften med ferdige sider og tekster for 45 bransjer. Fra 199 kr i måneden eks. mva, uten bindingstid. Domenet står i ditt navn.",
  ],
  nettbutikk: [
    "Lag nettbutikk med Vipps og kort, 399 kr/mnd | Nettgata",
    "Nettbutikk for små bedrifter, med varer, lager, rabattkoder, frakt med Bring, og betaling med Vipps og kort rett til deg. 399 kr i måneden eks. mva.",
  ],
  temaer: [
    "24 design for nettsiden din, fire farger hver | Nettgata",
    "Se 24 ferdige design for nettsiden, med fire fargevarianter hver. Miniatyrene er ekte sider fra bransjepakkene, og du kan bytte tema når du vil.",
  ],
  bransjer: [
    "Nettside for din bransje, 45 bransjepakker | Nettgata",
    "Ferdige nettsider for håndverkere, frisører, kafeer, regnskap, fotografer, idrettslag og mange flere. Sidene og tekstene er klare fra start.",
  ],
};

/** Setter sammen hele setninger så lenge de får plass. En setning som ikke passer, hoppes over. */
function fit(parts: string[], max: number): string {
  let text = "";
  for (const part of parts) {
    const next = text ? `${text} ${part}` : part;
    if (next.length <= max) text = next;
  }
  return text;
}

export function bransjeMonthly(m: BransjeMatch): number {
  return m.pack.kind === "nettbutikk" ? PRISER.nettbutikk.maned : PRISER.nettside.maned;
}

/** Tittel og beskrivelse for en bransjeside. Prisen står i tittelen når den får plass innenfor 60 tegn. */
export function bransjeTitle(m: BransjeMatch): [string, string] {
  const heading = bransjeHeading(m);
  const withPrice = `${heading} fra ${bransjeMonthly(m)} kr/mnd | ${SITE}`;
  const title = withPrice.length <= 60 ? withPrice : `${heading} | ${SITE}`;
  const ready = m.pack.kind === "nettbutikk" ? "ferdig satt opp for bransjen." : "med sider, tekster og prisliste klare fra start.";
  const description = fit(
    [`${heading} ${ready}`, m.pack.description, `${bransjeMonthly(m)} kr i måneden eks. mva.`, "Domenet står i ditt navn."],
    155,
  );
  return [title, description];
}

const ogImages = {
  forside: { path: "/nettgata/og-forside.png", alt: "Nettgata: nettside og nettbutikk for norske bedrifter, fra 199 kr i måneden eks. mva" },
  nettbutikk: { path: "/nettgata/og-nettbutikk.png", alt: "Nettgata: nettbutikk med Vipps og kort, 399 kr i måneden eks. mva" },
  bransjer: { path: "/nettgata/og-bransjer.png", alt: "Nettgata: nettside for din bransje, ferdig satt opp" },
} as const;

function ogImageFor(route: PlatformRoute) {
  if (route.kind === "nettbutikk" || (route.kind === "bransje" && route.match.pack.kind === "nettbutikk")) return ogImages.nettbutikk;
  if (route.kind === "bransjer" || route.kind === "bransje") return ogImages.bransjer;
  return ogImages.forside;
}

export function platformTitle(route: PlatformRoute): [string, string] {
  if (route.kind === "bransje") return bransjeTitle(route.match);
  if (route.kind === "juridisk") {
    const seo = plattformDokument(route.doc).seo ?? {};
    return [seo.title ?? SITE, seo.description ?? ""];
  }
  return titles[route.kind];
}

export function platformMetadata(route: PlatformRoute, origin: string): Metadata {
  const [title, description] = platformTitle(route);
  const base = platformOrigin(origin);
  const url = `${base}${platformPath(route)}`;
  const image = ogImageFor(route);
  const images = [{ url: `${base}${image.path}`, width: 1200, height: 630, alt: image.alt }];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { siteName: SITE, locale: "nb_NO", type: "website", title, description, url, images },
    twitter: { card: "summary_large_image", title, description, images: [images[0].url] },
  };
}

/* ---------- Brødsmuler ---------- */

export type Crumb = { name: string; path: string };

/** Stien fra forsiden til siden. Forsiden har ingen brødsmuler. */
export function platformBreadcrumbs(route: PlatformRoute): Crumb[] {
  const home: Crumb = { name: SITE, path: "/" };
  switch (route.kind) {
    case "landing":
      return [];
    case "nettbutikk":
      return [home, { name: "Nettbutikk", path: "/nettbutikk" }];
    case "temaer":
      return [home, { name: "Temaer", path: "/temaer" }];
    case "bransjer":
      return [home, { name: "Bransjer", path: "/bransjer" }];
    case "bransje":
      return [
        home,
        { name: "Bransjer", path: "/bransjer" },
        { name: route.match.genre.label, path: `/bransjer#${route.match.genre.key}` },
        { name: bransjeHeading(route.match), path: platformPath(route) },
      ];
    case "juridisk":
      return [home, { name: (plattformDokument(route.doc).seo?.title ?? SITE).replace(` | ${SITE}`, ""), path: platformPath(route) }];
  }
}

/* ---------- Strukturerte data (schema.org) ---------- */

type Json = Record<string, unknown>;

const orgnr = GRONBERG.orgnr.replace(/\s/g, "");

/** Grønberg Tech Solutions driver Nettgata. Adressen er den offentlige (ehandelsloven § 8), ikke hjemmeadressen. */
export function organizationLd(base: string): Json {
  const [street, place] = GRONBERG.adresse.split(",").map((s) => s.trim());
  const [postalCode, ...locality] = (place ?? "").split(" ");
  return {
    "@type": "Organization",
    "@id": `${base}/#organisasjon`,
    name: GRONBERG.navn,
    legalName: GRONBERG.navn,
    url: base,
    logo: { "@type": "ImageObject", url: `${base}/nettgata/logo.png`, width: 512, height: 512 },
    email: GRONBERG.epost,
    vatID: `NO${orgnr}MVA`,
    identifier: { "@type": "PropertyValue", propertyID: "Organisasjonsnummer", value: orgnr },
    founder: { "@type": "Person", name: GRONBERG.innehaver },
    address: { "@type": "PostalAddress", streetAddress: street, postalCode, addressLocality: locality.join(" "), addressCountry: "NO" },
    areaServed: { "@type": "Country", name: "Norge" },
    brand: { "@type": "Brand", name: SITE },
  };
}

export function websiteLd(base: string): Json {
  return {
    "@type": "WebSite",
    "@id": `${base}/#nettsted`,
    name: SITE,
    url: base,
    inLanguage: "nb-NO",
    publisher: { "@id": `${base}/#organisasjon` },
  };
}

/** Pris uten mva, per måned eller per år. */
function offer(base: string, name: string, price: number, unit: "MON" | "ANN", path: string): Json {
  return {
    "@type": "Offer",
    name,
    url: `${base}${path}`,
    price,
    priceCurrency: "NOK",
    availability: "https://schema.org/InStock",
    seller: { "@id": `${base}/#organisasjon` },
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price,
      priceCurrency: "NOK",
      valueAddedTaxIncluded: false,
      unitCode: unit,
      referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: unit },
    },
  };
}

/** Oppstart er en engangspris, uten mva. */
function setupOffer(base: string, name: string, price: number, path: string): Json {
  return {
    "@type": "Offer",
    name,
    url: `${base}${path}`,
    price,
    priceCurrency: "NOK",
    seller: { "@id": `${base}/#organisasjon` },
    priceSpecification: { "@type": "PriceSpecification", price, priceCurrency: "NOK", valueAddedTaxIncluded: false },
  };
}

/** Nettgata som programvare med de vedtatte prisene. Ingen vurderinger eller omtaler: vi har ingen å vise til ennå. */
export function softwareLd(base: string, which: "alle" | "nettside" | "nettbutikk" = "alle"): Json {
  const p = PRISER;
  const site = [
    offer(base, "Nettside, månedlig", p.nettside.maned, "MON", "/#priser"),
    offer(base, "Nettside, betalt for et år (169 kr i måneden)", p.nettside.arlig * 12, "ANN", "/#priser"),
  ];
  const shop = [
    offer(base, "Nettbutikk, månedlig", p.nettbutikk.maned, "MON", "/nettbutikk#priser"),
    offer(base, "Nettbutikk, betalt for et år (339 kr i måneden)", p.nettbutikk.arlig * 12, "ANN", "/nettbutikk#priser"),
  ];
  const extras = [
    offer(base, "Tillegg: AI-team", p.tillegg, "MON", "/#priser"),
    setupOffer(base, "Oppstart nettside, satt opp for deg", p.oppstart.nettside, "/#priser"),
    setupOffer(base, "Oppstart nettbutikk, satt opp for deg", p.oppstart.nettbutikk, "/nettbutikk#priser"),
  ];
  const offers = which === "nettside" ? site : which === "nettbutikk" ? shop : [...site, ...shop, ...extras];
  return {
    "@type": "SoftwareApplication",
    "@id": `${base}/#programvare`,
    name: SITE,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Nettside og nettbutikk",
    operatingSystem: "Nettleser",
    inLanguage: "nb-NO",
    url: base,
    provider: { "@id": `${base}/#organisasjon` },
    offers,
  };
}

export function breadcrumbLd(base: string, crumbs: Crumb[]): Json | null {
  if (crumbs.length < 2) return null;
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${base}${c.path}` })),
  };
}

/** Bare for spørsmål som faktisk står synlig på siden. */
export function faqLd(items: [string, string][]): Json | null {
  if (!items.length) return null;
  return {
    "@type": "FAQPage",
    mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

/** Alt som skal i én ld+json-blokk for siden. `faq` er spørsmålene som vises på siden. */
export function platformJsonLd(route: PlatformRoute, origin: string, faq: [string, string][] = []): Json {
  const base = platformOrigin(origin);
  const url = `${base}${platformPath(route)}`;
  const [title, description] = platformTitle(route);
  const page: Json = {
    "@type": "WebPage",
    "@id": `${url}#side`,
    url,
    name: title,
    description,
    inLanguage: "nb-NO",
    isPartOf: { "@id": `${base}/#nettsted` },
  };
  const graph: (Json | null)[] = [organizationLd(base), websiteLd(base), page, breadcrumbLd(base, platformBreadcrumbs(route)), faqLd(faq)];
  if (route.kind === "landing" || route.kind === "nettbutikk") {
    graph.push(softwareLd(base, route.kind === "landing" ? "alle" : "nettbutikk"));
    page.about = { "@id": `${base}/#programvare` };
  }
  if (route.kind === "bransje") {
    // Bransjesiden selger samme abonnement, med pakken for bransjen.
    graph.push({
      ...softwareLd(base, route.match.pack.kind === "nettbutikk" ? "nettbutikk" : "nettside"),
      "@id": `${url}#tilbud`,
      name: `${bransjeHeading(route.match)} | ${SITE}`,
    });
  }
  return { "@context": "https://schema.org", "@graph": graph.filter(Boolean) };
}
