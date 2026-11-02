import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { landingFaq, renderPlatformPage, shopFaq, visibleFaq } from "@/components/platform/pages";
import {
  bransjeDetails,
  landingBransjer,
  platformBreadcrumbs,
  platformJsonLd,
  platformMetadata,
  platformPaths,
  platformRoute,
  platformSitemapXml,
  type PlatformRoute,
} from "@/lib/platform-routes";

const env = { tagId: "", sendTo: "" };
const routes = (): PlatformRoute[] => platformPaths().map((path) => platformRoute(path.split("/").filter(Boolean))!);
const html = (route: PlatformRoute) => renderToStaticMarkup(renderPlatformPage(route, env));
const text = (markup: string) =>
  markup
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

type Node = Record<string, unknown>;
/** Bransjen bak en bransjeside, slått opp på nøkkelen. */
const bransje = (key: string) => {
  const route = platformRoute(["bransjer", key]);
  if (route?.kind !== "bransje") throw new Error(`Fant ikke bransjen ${key}`);
  return route.match;
};
const graph = (route: PlatformRoute, faq: [string, string][] = []) => platformJsonLd(route, "https://nettgata.no", faq)["@graph"] as Node[];
const ofType = (nodes: Node[], type: string) => nodes.filter((n) => n["@type"] === type);

describe("nettgata.no: titler, beskrivelser og kanoniske adresser", () => {
  beforeEach(() => {
    process.env.PLATFORM_CANONICAL_HOST = "nettgata.no";
  });
  afterEach(() => {
    delete process.env.PLATFORM_CANONICAL_HOST;
  });

  it("har en unik tittel på maks 60 tegn og en unik beskrivelse på maks 155 tegn per side", () => {
    const all = routes().map((r) => platformMetadata(r, "https://plattformen.helene721.workers.dev"));
    for (const m of all) {
      const title = String(m.title);
      const description = String(m.description);
      expect(title.length, title).toBeLessThanOrEqual(60);
      expect(title.endsWith("| Nettgata"), title).toBe(true);
      expect(description.length, description).toBeGreaterThan(50);
      expect(description.length, description).toBeLessThanOrEqual(155);
    }
    expect(new Set(all.map((m) => m.title)).size).toBe(all.length);
    expect(new Set(all.map((m) => m.description)).size).toBe(all.length);
  });

  it("peker alltid til https://nettgata.no, uten skråstrek til slutt, også fra reserveadressen", () => {
    for (const r of routes()) {
      const m = platformMetadata(r, "https://plattformen.helene721.workers.dev");
      const canonical = String(m.alternates?.canonical);
      expect(canonical.startsWith("https://nettgata.no/")).toBe(true);
      if (r.kind !== "landing") expect(canonical.endsWith("/")).toBe(false);
      expect(canonical).not.toContain("www.");
    }
  });

  it("har delingsbilde i full størrelse på alle sidene", () => {
    const front = platformMetadata({ kind: "landing" }, "https://nettgata.no");
    expect(front.openGraph?.images).toEqual([expect.objectContaining({ url: "https://nettgata.no/nettgata/og-forside.png", width: 1200, height: 630 })]);
    expect(front.twitter).toMatchObject({ card: "summary_large_image" });
    const shop = platformMetadata(platformRoute(["bransjer", "klaer"])!, "https://nettgata.no");
    expect(JSON.stringify(shop.openGraph?.images)).toContain("og-nettbutikk.png");
    const frisor = platformMetadata(platformRoute(["bransjer", "frisor"])!, "https://nettgata.no");
    expect(String(frisor.title)).toBe("Nettside for frisør fra 199 kr/mnd | Nettgata");
  });

  it("sitemap.xml har alle salgssidene med lastmod, og ingenting fra studioet", () => {
    const xml = platformSitemapXml("https://plattformen.helene721.workers.dev");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(platformPaths().length);
    expect(locs).toContain("https://nettgata.no/");
    expect(locs).toContain("https://nettgata.no/bransjer/rorlegger");
    expect(locs.every((l) => l.startsWith("https://nettgata.no/"))).toBe(true);
    expect(xml).not.toContain("/studio");
    expect(xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)).toHaveLength(locs.length);
    // Ingen bransjeside for «Annen bedrift» eller den generelle nettbutikken, den har /nettbutikk.
    expect(locs).not.toContain("https://nettgata.no/bransjer/bedrift");
    expect(locs).not.toContain("https://nettgata.no/bransjer/nettbutikk");
  });
});

describe("nettgata.no: strukturerte data", () => {
  it("har Grønberg Tech Solutions som driver, med offentlig adresse og org.nr.", () => {
    const [org] = ofType(graph({ kind: "landing" }), "Organization");
    expect(org).toMatchObject({
      name: "Grønberg Tech Solutions",
      vatID: "NO927889404MVA",
      identifier: { value: "927889404" },
      address: { streetAddress: "Stadionveien 1A", postalCode: "3340", addressLocality: "Åmot", addressCountry: "NO" },
      logo: { url: "https://nettgata.no/nettgata/logo.png" },
    });
    // Hjemmeadressen skal aldri ut.
    expect(JSON.stringify(org)).not.toContain("Lilleåsgata");
  });

  it("har de vedtatte prisene uten mva, og ingen vurderinger eller omtaler", () => {
    const nodes = graph({ kind: "landing" }, landingFaq);
    const [app] = ofType(nodes, "SoftwareApplication");
    const offers = app.offers as Node[];
    const prices = offers.map((o) => o.price);
    expect(prices).toEqual(expect.arrayContaining([199, 169 * 12, 399, 339 * 12, 249, 3900, 9900]));
    for (const o of offers) {
      expect(o.priceCurrency).toBe("NOK");
      expect((o.priceSpecification as Node).valueAddedTaxIncluded).toBe(false);
    }
    const json = JSON.stringify(nodes);
    expect(json).not.toMatch(/aggregateRating|"review"|ratingValue/);
  });

  it("har FAQPage bare der spørsmålene står synlig, med samme tekst", () => {
    expect(visibleFaq({ kind: "landing" })).toBe(landingFaq);
    expect(visibleFaq({ kind: "nettbutikk" })).toBe(shopFaq);
    for (const r of routes()) {
      const faq = visibleFaq(r);
      const nodes = graph(r, faq);
      const faqNodes = ofType(nodes, "FAQPage");
      expect(faqNodes).toHaveLength(faq.length ? 1 : 0);
      if (faq.length) {
        const markup = text(html(r));
        for (const [q, a] of faq) {
          expect(markup).toContain(q);
          expect(markup).toContain(a);
        }
      }
    }
  });

  it("har brødsmuler som stemmer med siden, både synlig og som BreadcrumbList", () => {
    const rorlegger = platformRoute(["bransjer", "rorlegger"])!;
    expect(platformBreadcrumbs(rorlegger).map((c) => c.path)).toEqual(["/", "/bransjer", "/bransjer#handverk", "/bransjer/rorlegger"]);
    const [list] = ofType(graph(rorlegger), "BreadcrumbList");
    const items = list.itemListElement as Node[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(items[3]).toMatchObject({ name: "Nettside for rørlegger", item: "https://nettgata.no/bransjer/rorlegger" });
    expect(html(rorlegger)).toContain('aria-label="Brødsmuler"');
    expect(ofType(graph({ kind: "landing" }), "BreadcrumbList")).toHaveLength(0);
  });

  it("legger én ld+json-blokk på hver side, uten tegn som kan avslutte script-taggen", () => {
    for (const r of [{ kind: "landing" }, { kind: "nettbutikk" }, platformRoute(["bransjer", "kafe"])!] as PlatformRoute[]) {
      const markup = html(r);
      const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks).toHaveLength(1);
      expect(() => JSON.parse(blocks[0][1])).not.toThrow();
    }
  });
});

describe("nettgata.no: innholdet på sidene", () => {
  it("har nøyaktig én h1 per side, også med miniatyrene av kundesider", () => {
    for (const r of routes()) {
      expect(html(r).match(/<h1[\s>]/g), JSON.stringify(r.kind)).toHaveLength(1);
    }
  });

  it("forsiden og /temaer har én h1, og miniatyrene har samme utseende som før, men som h2", () => {
    for (const path of [[], ["temaer"]]) {
      const markup = html(platformRoute(path)!);
      expect(markup.match(/<h1[\s>]/g), path.join("/") || "forsiden").toHaveLength(1);
      // Heltens overskrift i miniatyren beholder temaets klasse ng-h1, men er h2, inne i data-nosnippet.
      expect(markup).toMatch(/<h2 class="ng-h ng-h1">/);
      expect(markup).not.toMatch(/<h1 class="ng-h/);
      expect(markup).toContain("data-nosnippet");
    }
  });

  it("lover ingen funksjoner som ikke er bygget, og har ingen tankestreker", () => {
    for (const r of routes().filter((x) => x.kind !== "juridisk")) {
      const t = text(html(r));
      expect(t).not.toMatch(/Fiken|helsesjekk|alt-tekst|nyhetsbrev|Kommer:|ikke lansert|full eksport|får du med deg alt/i);
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/\s-\s/);
    }
  });

  it("viser det bransjepakken faktisk inneholder, så sidene ikke er like", () => {
    const rorlegger = bransjeDetails(bransje("rorlegger"));
    expect(rorlegger.hero.overskrift).toContain("Rørlegger i Modum");
    expect(rorlegger.services.map((s) => s.navn)).toContain("Bad og våtrom");
    expect(rorlegger.prices.length).toBeGreaterThan(0);
    expect(rorlegger.formFields).toContain("Adressen der jobben skal gjøres");
    expect(bransjeDetails(bransje("frisor")).booking).toBe("time");
    expect(bransjeDetails(bransje("restaurant"))).toMatchObject({ booking: "bord", local: { hours: true, map: true, menu: true } });

    // Hver bransjeside har sitt eget innhold: ingen to sider har samme hovedtekst.
    const bodies = landingBransjer().map((m) => text(html({ kind: "bransje", match: m })).replace(/\s+/g, " "));
    expect(new Set(bodies).size).toBe(bodies.length);
    const frisor = text(html(platformRoute(["bransjer", "frisor"])!));
    expect(frisor).toContain("Timebestilling");
    expect(frisor).toContain("Nettside for hudpleie, vipper og negler");
  });

  it("lenker fra forsiden til bransjesidene med søkeordet som lenketekst", () => {
    const markup = html({ kind: "landing" });
    expect(markup).toContain('href="/bransjer/frisor"');
    expect(text(markup)).toContain("Nettside for frisør");
    expect(markup).toContain('href="/nettbutikk"');
  });
});
