import type { PageContent } from "@/lib/content/types";
import { openingHoursSchema } from "@/lib/opening-hours";
import type { SiteInfo } from "@/lib/site-info";
import type { SiteLayout } from "@/lib/site-layout";
import { parseServiceArea, visibleSections } from "./auto";

/**
 * Strukturerte data (schema.org) for kundenettstedene, bygget av det kunden allerede har fylt inn.
 * Bare det som står på siden: ingen oppdiktede omtaler eller stjerner, ingen koordinater vi ikke vet.
 */

type Node = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const items = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** Tall fra en pris skrevet som fri tekst: «fra 1 200 kr», «Kr 450,-», «950 kr/t». Null uten tall. */
export function parsePrice(text: string): { amount: number; from: boolean } | null {
  const match = /(\d{1,3}(?:[ . ]\d{3})+|\d+)(?:,(\d{1,2}))?/.exec(text);
  if (!match) return null;
  const amount = Number(match[1].replace(/[ . ]/g, "")) + (match[2] ? Number(match[2].padEnd(2, "0")) / 100 : 0);
  return amount > 0 ? { amount, from: /\bfra\b/i.test(text) } : null;
}

/** «NOK 450-2500» fra prisene i «Tjenester og priser». Tomt når ingen pris kan leses. */
export function priceRange(contents: Pick<PageContent, "sections">[]): string {
  const amounts = contents.flatMap((c) =>
    visibleSections(c)
      .filter((s) => s.type === "tjenester")
      .flatMap((s) => items(s.props.tjenester).map((t) => parsePrice(str(t.pris))?.amount ?? null))
      .filter((a): a is number => a !== null),
  );
  if (!amounts.length) return "";
  const [min, max] = [Math.min(...amounts), Math.max(...amounts)].map((n) => Math.round(n));
  return min === max ? `NOK ${min}` : `NOK ${min}-${max}`;
}

export type BusinessInput = {
  name: string;
  /** schema.org-typen fra bransjepakken, for eksempel Plumber eller HairSalon. */
  schemaType: string;
  /** Forsidens fulle adresse, med / til slutt. */
  url: string;
  info: SiteInfo;
  layout: Pick<SiteLayout, "logo" | "social">;
  /** Fullt bildeadresse, for eksempel delingsbildet på forsiden. */
  image?: string;
  priceRange?: string;
  now?: Date;
};

export const businessId = (url: string) => `${url}#bedrift`;

/** Bedriften med riktig undertype per bransje, adresse, telefon, åpningstider, område, sosiale lenker og logo. */
export function localBusinessJsonLd(input: BusinessInput): Node {
  const { info, layout, url } = input;
  const areas = parseServiceArea(info.serviceArea);
  const sameAs = Object.values(layout.social).filter((v) => typeof v === "string" && v.startsWith("https://"));
  const logo = layout.logo ? new URL(layout.logo.src, url).toString() : undefined;
  const image = input.image ?? logo;
  return {
    "@type": input.schemaType,
    "@id": businessId(url),
    name: input.name,
    url,
    ...(info.phone && { telephone: info.phone }),
    ...(info.email && { email: info.email }),
    ...(info.orgnr && { vatID: `NO${info.orgnr}MVA`, identifier: info.orgnr }),
    ...((info.street || info.city) && {
      address: {
        "@type": "PostalAddress",
        streetAddress: info.street || undefined,
        postalCode: info.postalCode || undefined,
        addressLocality: info.city || undefined,
        addressCountry: "NO",
      },
    }),
    ...(areas.length && { areaServed: areas.map((name) => ({ "@type": "Place", name })) }),
    ...(sameAs.length && { sameAs }),
    ...(logo && { logo }),
    ...(image && { image }),
    ...(input.priceRange && { priceRange: input.priceRange }),
    // Samme åpningstider som vises på siden. Tider som ikke kan tolkes sikkert, utelates.
    ...openingHoursSchema(info, input.now),
  };
}

export function websiteJsonLd(url: string, name: string): Node {
  return { "@type": "WebSite", "@id": `${url}#nettsted`, url, name, inLanguage: "nb-NO", publisher: { "@id": businessId(url) } };
}

/** Spørsmål og svar fra de synlige FAQ-seksjonene. Tom liste gir ingen FAQPage. */
export function faqJsonLd(content: Pick<PageContent, "sections">, pageUrl: string): Node | null {
  const questions = visibleSections(content)
    .filter((s) => s.type === "faq")
    .flatMap((s) => items(s.props.sporsmal))
    .filter((q) => str(q.sporsmal) && str(q.svar));
  if (!questions.length) return null;
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#sporsmal`,
    url: pageUrl,
    mainEntity: questions.map((q) => ({ "@type": "Question", name: str(q.sporsmal), acceptedAnswer: { "@type": "Answer", text: str(q.svar) } })),
  };
}

/** Én Service per tjeneste i «Tjenester og priser», med pris når den kan leses. */
export function servicesJsonLd(content: Pick<PageContent, "sections">, siteUrl: string, areas: string[] = []): Node[] {
  return visibleSections(content)
    .filter((s) => s.type === "tjenester")
    .flatMap((s) => items(s.props.tjenester))
    .filter((t) => str(t.navn))
    .map((t) => {
      const price = parsePrice(str(t.pris));
      return {
        "@type": "Service",
        name: str(t.navn),
        ...(str(t.beskrivelse) && { description: str(t.beskrivelse) }),
        provider: { "@id": businessId(siteUrl) },
        ...(areas.length && { areaServed: areas.map((name) => ({ "@type": "Place", name })) }),
        ...(price && {
          offers: {
            "@type": "Offer",
            priceCurrency: "NOK",
            ...(price.from ? { priceSpecification: { "@type": "PriceSpecification", minPrice: price.amount, priceCurrency: "NOK" } } : { price: price.amount }),
          },
        }),
      };
    });
}

/** Brødsmuler fra forsiden og ned til siden. Navnene hentes fra menyen der de finnes. */
export function breadcrumbItems(path: string, pageTitle: string, nav: { path: string; title: string }[]): { path: string; title: string }[] {
  if (path === "/") return [];
  const parts = path.split("/").filter(Boolean);
  const trail = [{ path: "/", title: "Forside" }];
  for (let i = 1; i < parts.length; i++) {
    const at = `/${parts.slice(0, i).join("/")}`;
    const known = nav.find((n) => n.path === at)?.title;
    trail.push({ path: at, title: known ?? parts[i - 1].replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) });
  }
  trail.push({ path, title: pageTitle });
  return trail;
}

export function breadcrumbJsonLd(trail: { path: string; title: string }[], siteUrl: string): Node | null {
  if (trail.length < 2) return null;
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.title, item: new URL(t.path, siteUrl).toString() })),
  };
}

/** Blogginnlegg: overskrift, datoer og forfatter (bedriften). */
export function articleJsonLd(input: {
  url: string;
  siteUrl: string;
  siteName: string;
  title: string;
  published: Date;
  modified: Date;
  image?: string;
  description?: string;
}): Node {
  const by = { "@type": "Organization", name: input.siteName, url: input.siteUrl };
  return {
    "@type": "BlogPosting",
    headline: input.title.slice(0, 110),
    url: input.url,
    mainEntityOfPage: input.url,
    datePublished: input.published.toISOString(),
    dateModified: input.modified.toISOString(),
    author: by,
    publisher: by,
    inLanguage: "nb-NO",
    ...(input.image && { image: input.image }),
    ...(input.description && { description: input.description }),
  };
}

/** Én script-blokk med alle nodene. Escaper < så innhold aldri kan bryte ut av script-taggen. */
export function jsonLdScript(nodes: (Node | null | undefined)[]): string | null {
  const graph = nodes.filter((n): n is Node => Boolean(n));
  if (!graph.length) return null;
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
