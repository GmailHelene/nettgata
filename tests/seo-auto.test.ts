import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageRenderer, type RenderContext } from "@/components/sections";
import { sectionRegistry } from "@/lib/content/registry";
import { sectionTypes } from "@/lib/content/types";
import { buildTheme } from "@/lib/themes";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { domains, organizations, pages, sites, users } from "@/db/schema";
import { offerExtras } from "@/components/shop/pages";
import { exampleSection } from "@/lib/content/examples";
import { pageSeo, seoHints } from "@/lib/content/seo";
import type { PageContent, Section } from "@/lib/content/types";
import { schemaTypeFor } from "@/lib/packs";
import { publishPage } from "@/lib/publishing";
import { readShopSettings } from "@/lib/shop/settings";
import { readSiteInfo, siteInfoInputSchema } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import {
  autoDescription,
  autoTitle,
  bransjeKeyword,
  listPlaces,
  parseServiceArea,
  primaryPlace,
  productDescription,
  productTitle,
  readableSlug,
  slugPath,
  trimAtWord,
} from "@/lib/seo/auto";
import { INDEXNOW_ENDPOINT, indexNowKey, pingIndexNow } from "@/lib/seo/indexnow";
import { pingPublished, publishSeoNotes, siteHints, withSeoNotes } from "@/lib/seo/publish";
import {
  articleJsonLd,
  breadcrumbItems,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  localBusinessJsonLd,
  parsePrice,
  priceRange,
  servicesJsonLd,
} from "@/lib/seo/schema";
import { parseGoogleVerification } from "@/lib/seo/verification";

const src = "/media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
const secret = new TextEncoder().encode("x".repeat(40));
const words = (n: number) => Array.from({ length: n }, (_, i) => `ord${i}`).join(" ");
const page = (sections: Section[], seo: PageContent["seo"] = {}): PageContent => ({ seo, sections });
const hero = (props: Record<string, unknown> = {}): Section => ({ id: "h", type: "hero", variant: "bilde", props: { overskrift: "Rørlegger i Drammen", ...props } });
const tekst = (brodtekst: string, extra: Partial<Section> = {}): Section => ({ id: "t", type: "tekst", variant: "standard", props: { brodtekst }, ...extra });

describe("automatisk tittel", () => {
  const base = { siteName: "Hansen Rør AS", keyword: "Rørlegger", place: "Drammen" };

  it("forsiden starter med bransje og sted", () => {
    expect(autoTitle({ ...base, pageTitle: "Forside", path: "/" })).toBe("Rørlegger i Drammen | Hansen Rør AS");
    // Står stedet allerede i navnet, holder bransjen.
    expect(autoTitle({ ...base, siteName: "Drammen Rørlegger AS", pageTitle: "Forside", path: "/" })).toBe("Rørlegger i Drammen | Drammen Rørlegger AS");
    expect(autoTitle({ ...base, place: "", pageTitle: "Forside", path: "/" })).toBe("Rørlegger | Hansen Rør AS");
    expect(autoTitle({ siteName: "Sangkoret", pageTitle: "Forside", path: "/" })).toBe("Sangkoret");
  });

  it("undersider får sidetittel, bransje, sted og navn, og kortes ned til den får plass", () => {
    expect(autoTitle({ ...base, pageTitle: "Tjenester", path: "/tjenester" })).toBe("Tjenester | Rørlegger i Drammen | Hansen Rør AS");
    const long = autoTitle({ ...base, pageTitle: "Baderomsrenovering og varmekabler", path: "/bad" });
    expect(long).toBe("Baderomsrenovering og varmekabler | Hansen Rør AS");
    expect(long.length).toBeLessThanOrEqual(60);
    // Blogginnlegg handler om noe annet enn bransjen.
    expect(autoTitle({ ...base, pageTitle: "Slik unngår du frosne rør", path: "/blogg/frosne-ror" })).toBe("Slik unngår du frosne rør | Hansen Rør AS");
  });

  it("nettbutikker selger på nett, ikke på et sted", () => {
    expect(autoTitle({ siteName: "Ullstua", keyword: "Klær", place: "Modum", shop: true, pageTitle: "Forside", path: "/" })).toBe("Klær på nett | Ullstua");
    expect(autoTitle({ siteName: "Ullstua", keyword: "", shop: true, pageTitle: "Forside", path: "/" })).toBe("Nettbutikk | Ullstua");
  });

  it("kundens egen tittel og beskrivelse vinner alltid", () => {
    const content = page([hero(), tekst("Vi fikser bad og varme.")], { title: " Egen tittel ", description: "Egen beskrivelse" });
    const seo = pageSeo({ ...base, pageTitle: "Forside", path: "/", content });
    expect(seo.title).toBe("Egen tittel");
    expect(seo.description).toBe("Egen beskrivelse");
    expect(seo.autoTitle).toBe("Rørlegger i Drammen | Hansen Rør AS");
  });
});

describe("automatisk beskrivelse", () => {
  it("bruker den første teksten på siden, kuttet ved et ordskille til maks 155 tegn", () => {
    const long = `Vi er rørleggere i Drammen og omegn. ${"Vi tar bad, varme, lekkasjer og service med fast pris og kort ventetid. ".repeat(5)}`;
    const d = autoDescription({ content: page([hero({ undertekst: "" }), tekst(long)]), siteName: "S", pageTitle: "Forside", path: "/" });
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).toMatch(/^Vi er rørleggere i Drammen og omegn\./);
    expect(d).toMatch(/\p{L}…$/u);
  });

  it("fyller på med neste tekstbit når den første er kort, og hopper over eksempeltekst og avslåtte seksjoner", () => {
    const content = page([
      hero({ undertekst: "Rask hjelp" }),
      exampleSection("tekst", "standard"),
      tekst("Skjult tekst", { id: "x", hidden: true }),
      tekst("Vi har fast pris på det meste."),
    ]);
    expect(autoDescription({ content, siteName: "S", pageTitle: "Forside", path: "/" })).toBe("Rask hjelp. Vi har fast pris på det meste.");
  });

  it("uten tekst lages én setning av navn, bransje og sted", () => {
    const content = page([hero()]);
    expect(autoDescription({ content, siteName: "Hansen Rør AS", pageTitle: "Forside", path: "/", keyword: "Rørlegger", place: "Drammen" })).toBe(
      "Hansen Rør AS: rørlegger i Drammen.",
    );
    expect(autoDescription({ content, siteName: "Data AS", pageTitle: "Forside", path: "/", keyword: "IT-tjenester" })).toBe("Data AS: IT-tjenester.");
    expect(autoDescription({ content, siteName: "Hansen Rør AS", pageTitle: "Priser", path: "/priser", place: "Drammen" })).toBe("Priser hos Hansen Rør AS i Drammen.");
  });

  it("kutter aldri midt i et ord", () => {
    expect(trimAtWord("kort")).toBe("kort");
    const cut = trimAtWord(`${"abcdefghi ".repeat(30)}`, 50);
    expect(cut.length).toBeLessThanOrEqual(50);
    expect(cut).toMatch(/abcdefghi…$/);
  });
});

describe("varesider", () => {
  it("navn, egenskap, pris og butikk, kortet ned til den får plass", () => {
    expect(productTitle({ name: "Strikket lue", attribute: "Blå", price: "399 kr", shopName: "Ullstua" })).toBe("Strikket lue, Blå, 399 kr | Ullstua");
    // Egenskapen gjentas ikke når den står i navnet.
    expect(productTitle({ name: "Blå lue", attribute: "Blå", price: "399 kr", shopName: "Ullstua" })).toBe("Blå lue, 399 kr | Ullstua");
    const long = productTitle({ name: "Håndstrikket genser i merinoull med rundfelling", attribute: "Naturhvit", price: "fra 1 499 kr", shopName: "Ullstua" });
    expect(long).toBe("Håndstrikket genser i merinoull med rundfelling | Ullstua");
    expect(productDescription({ name: "Lue", description: "", price: "399 kr", shopName: "Ullstua" })).toBe("Lue fra Ullstua. 399 kr.");
  });

  it("frakt og 14 dagers angrerett i produktdataene", () => {
    const extras = offerExtras(readShopSettings({}));
    expect(extras.shippingDetails?.shippingRate).toEqual({ "@type": "MonetaryAmount", value: "99.00", currency: "NOK" });
    expect(extras.hasMerchantReturnPolicy).toMatchObject({ merchantReturnDays: 14, applicableCountry: "NO" });
    // Bare hent selv: ingen frakt å oppgi.
    expect(offerExtras({ shippingOptions: [{ code: "hent", name: "Hent", priceOre: 0, requiresAddress: false }] }).shippingDetails).toBeUndefined();
  });
});

describe("område vi dekker", () => {
  it("leser stedene og bruker det første i titlene", () => {
    expect(parseServiceArea("Drammen, Lier og Kongsberg; drammen")).toEqual(["Drammen", "Lier", "Kongsberg"]);
    expect(primaryPlace({ city: "Mjøndalen", serviceArea: "Drammen, Lier" })).toBe("Drammen");
    expect(primaryPlace({ city: "Mjøndalen" })).toBe("Mjøndalen");
    expect(listPlaces(["Drammen", "Lier", "Kongsberg"])).toBe("Drammen, Lier og Kongsberg");
  });

  it("eldre info uten feltet er gyldig, og for langt område gir norsk feilmelding", () => {
    expect(readSiteInfo({ city: "Åmot" }).serviceArea).toBeUndefined();
    const bad = siteInfoInputSchema.safeParse({ serviceArea: "x".repeat(201) });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toMatch(/Området er for langt/);
  });
});

describe("strukturerte data", () => {
  it("riktig undertype av LocalBusiness per bransjepakke", () => {
    const expected: Record<string, string> = {
      rorlegger: "Plumber",
      elektriker: "Electrician",
      frisor: "HairSalon",
      hudpleie: "BeautySalon",
      restaurant: "Restaurant",
      kafe: "CafeOrCoffeeShop",
      bakeri: "Bakery",
      regnskap: "AccountingService",
      tannlege: "Dentist",
      finnesikke: "LocalBusiness",
    };
    for (const [pack, type] of Object.entries(expected)) expect(schemaTypeFor(pack)).toBe(type);
    expect(bransjeKeyword("rorlegger")).toBe("Rørlegger");
    expect(bransjeKeyword("lag")).toBe("");
  });

  it("bedriften med område, sosiale lenker, logo og prisspenn, og aldri stjerner vi ikke har", () => {
    const info = readSiteInfo({ phone: "32 78 00 00", city: "Drammen", street: "Storgata 1", postalCode: "3015", serviceArea: "Drammen, Lier" });
    const layout = readSiteLayout({ logo: { src, alt: "Logo" }, social: { facebook: "https://facebook.com/hansen", instagram: "" } });
    const node = localBusinessJsonLd({ name: "Hansen Rør AS", schemaType: "Plumber", url: "https://hansen.no/", info, layout, priceRange: "NOK 450-2500" });
    expect(node).toMatchObject({
      "@type": "Plumber",
      "@id": "https://hansen.no/#bedrift",
      telephone: "32 78 00 00",
      areaServed: [
        { "@type": "Place", name: "Drammen" },
        { "@type": "Place", name: "Lier" },
      ],
      sameAs: ["https://facebook.com/hansen"],
      logo: `https://hansen.no${src}`,
      priceRange: "NOK 450-2500",
    });
    expect(node).not.toHaveProperty("aggregateRating");
    expect(node).not.toHaveProperty("geo");
  });

  it("leser priser skrevet som fri tekst", () => {
    expect(parsePrice("fra 1 200 kr")).toEqual({ amount: 1200, from: true });
    expect(parsePrice("Kr 450,-")).toEqual({ amount: 450, from: false });
    expect(parsePrice("Etter avtale")).toBeNull();
    const tjenester: Section = {
      id: "tj",
      type: "tjenester",
      variant: "liste",
      props: { overskrift: "Priser", tjenester: [{ navn: "Service", pris: "950 kr" }, { navn: "Bad", pris: "fra 2 500 kr", beskrivelse: "Hele badet" }, { navn: "Råd" }] },
    };
    expect(priceRange([page([tjenester])])).toBe("NOK 950-2500");
    const services = servicesJsonLd(page([tjenester]), "https://hansen.no/", ["Drammen"]);
    expect(services).toHaveLength(3);
    expect(services[0]).toMatchObject({ "@type": "Service", name: "Service", offers: { price: 950, priceCurrency: "NOK" }, provider: { "@id": "https://hansen.no/#bedrift" } });
    expect(services[1]).toMatchObject({ description: "Hele badet", offers: { priceSpecification: { minPrice: 2500 } } });
    expect(services[2]).not.toHaveProperty("offers");
  });

  it("FAQPage fra de synlige spørsmålene", () => {
    const faq: Section = { id: "f", type: "faq", variant: "standard", props: { overskrift: "Spørsmål", sporsmal: [{ sporsmal: "Tar dere akuttoppdrag?", svar: "Ja, hele døgnet." }] } };
    expect(faqJsonLd(page([faq]), "https://hansen.no/")).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Tar dere akuttoppdrag?", acceptedAnswer: { "@type": "Answer", text: "Ja, hele døgnet." } }],
    });
    expect(faqJsonLd(page([{ ...faq, hidden: true }]), "https://hansen.no/")).toBeNull();
  });

  it("brødsmuler fra forsiden og ned, med navn fra menyen", () => {
    const trail = breadcrumbItems("/blogg/frosne-ror", "Frosne rør", [{ path: "/blogg", title: "Nytt fra oss" }]);
    expect(trail.map((t) => t.title)).toEqual(["Forside", "Nytt fra oss", "Frosne rør"]);
    expect(breadcrumbJsonLd(trail, "https://hansen.no/")).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [{ position: 1, item: "https://hansen.no/" }, { position: 2, item: "https://hansen.no/blogg" }, { position: 3, name: "Frosne rør" }],
    });
    expect(breadcrumbItems("/", "Forside", [])).toEqual([]);
    expect(breadcrumbJsonLd([], "https://hansen.no/")).toBeNull();
  });

  it("blogginnlegg med datoer og forfatter, og én script-blokk som ikke kan avsluttes av innholdet", () => {
    const article = articleJsonLd({
      url: "https://hansen.no/blogg/x",
      siteUrl: "https://hansen.no/",
      siteName: "Hansen Rør AS",
      title: "Frosne rør",
      published: new Date("2026-10-01T10:00:00Z"),
      modified: new Date("2026-10-05T10:00:00Z"),
    });
    expect(article).toMatchObject({ "@type": "BlogPosting", datePublished: "2026-10-01T10:00:00.000Z", dateModified: "2026-10-05T10:00:00.000Z", author: { name: "Hansen Rør AS" } });
    const script = jsonLdScript([article, null, { "@type": "Thing", name: "</script><script>alert(1)</script>" }])!;
    expect(script).not.toContain("</script>");
    expect(JSON.parse(script)["@graph"]).toHaveLength(2);
    expect(jsonLdScript([null])).toBeNull();
  });
});

describe("«Fiks nå» ved publisering", () => {
  const good = page([hero({ bilde: { src, alt: "Rørlegger på jobb" }, undertekst: words(60) })]);
  const hints = (content: PageContent, path = "/tjenester") => seoHints({ pageTitle: "Tjenester", siteName: "Hansen Rør AS", content, path });

  it("en god side har ingenting å fikse", () => {
    expect(hints(good)).toEqual([]);
  });

  it("sier fra om lite tekst, manglende alt-tekst og adresse med æ, ø og å", () => {
    expect(hints(page([hero({ bilde: { src, alt: "x" } })])).join(" ")).toMatch(/Siden har 3 ord/);
    const noAlt = page([hero({ bilde: { src, alt: "" }, undertekst: words(60) })]);
    expect(hints(noAlt).join(" ")).toMatch(/Ett bilde mangler alt-tekst/);
    // Pyntebilder skal ha tom alt.
    expect(hints(page([hero({ bilde: { src, alt: "", decorative: true }, undertekst: words(60) })]))).toEqual([]);
    expect(hints(good, "/våre-tjenester").join(" ")).toMatch(/\/vare-tjenester er lettere/);
    expect(readableSlug("/blogg/frosne-ror")).toBe(true);
    expect(slugPath("/Våre-Tjenester/Bad og Ærlig")).toBe("/vare-tjenester/bad-og-aerlig");
  });

  it("den første synlige seksjonen gir H1, også når den første er slått av", () => {
    const hidden = { ...tekst(words(60)), id: "skjult", hidden: true };
    expect(hints(page([hidden, hero({ bilde: { src, alt: "x" }, undertekst: words(60) })]))).toEqual([]);
    expect(hints(page([hero({ overskrift: "", bilde: { src, alt: "x" }, undertekst: words(60) })]))[0]).toMatch(/H1/);
  });

  it("lik tittel på to sider og kontaktside uten lenke", () => {
    const contact = { path: "/kontakt", title: "Kontakt", showInMenu: false, content: page([{ id: "k", type: "kontakt", variant: "standard", props: { overskrift: "Kontakt" } }]) };
    const a = { path: "/a", title: "Bad", showInMenu: true, content: good };
    const b = { path: "/b", title: "Bad", showInMenu: true, content: page([hero({ knappLenke: "/kontakt" })]) };
    const titleOf = (p: { title: string }) => `${p.title} | Hansen`;
    const notes = siteHints(a, [a, b, contact], titleOf);
    expect(notes[0]).toMatch(/samme tittel i Google som «Bad»/);
    expect(notes[1]).toMatch(/Ingen lenke til kontaktsiden/);
    // Lenket fra en knapp, eller kontaktsiden står i menyen: alt i orden.
    expect(siteHints(b, [b, contact], (p) => p.path)).toEqual([]);
    expect(siteHints(a, [a, { ...contact, showInMenu: true }], (p) => p.path)).toEqual([]);
    expect(withSeoNotes("Publisert.", [])).toBe("Publisert.");
    expect(withSeoNotes("Publisert.", ["Rett dette."])).toBe("Publisert.\n\nTips for Google (stopper ikke publiseringen):\n• Rett dette.");
  });
});

describe("Google Search Console", () => {
  const code = "AbCdEf0123456789_-xyzXYZ0123";
  it("godtar hele meta-taggen eller bare koden, og lagrer bare koden", () => {
    expect(parseGoogleVerification(code)).toBe(code);
    expect(parseGoogleVerification(`<meta name="google-site-verification" content="${code}" />`)).toBe(code);
    expect(parseGoogleVerification("")).toBe("");
    expect(parseGoogleVerification('<meta name="description" content="abcdefghijklmnopqrstuvwxyz">')).toBeNull();
    expect(parseGoogleVerification('"><script>alert(1)</script>')).toBeNull();
    expect(parseGoogleVerification("for kort")).toBeNull();
    expect(siteInfoInputSchema.parse({ googleVerification: `<meta name="google-site-verification" content="${code}">` }).googleVerification).toBe(code);
    expect(siteInfoInputSchema.safeParse({ googleVerification: "tull" }).success).toBe(false);
    // Lagret info leses mildt: en rar verdi velter aldri resten.
    expect(readSiteInfo({ city: "Åmot", googleVerification: 42 }).city).toBe("Åmot");
  });
});

describe("IndexNow", () => {
  it("én fast nøkkel per domene", async () => {
    const key = await indexNowKey("hansen.no", secret);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(await indexNowKey("HANSEN.no", secret)).toBe(key);
    expect(await indexNowKey("annen.no", secret)).not.toBe(key);
  });

  it("sender adressene med nøkkelen, og bare for ekte https-adresser", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    expect(await pingIndexNow("https://hansen.no", ["/", "/tjenester", "/"], { fetch: fetchMock, secret })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ host: "hansen.no", urlList: ["https://hansen.no/", "https://hansen.no/tjenester"] });
    expect(body.keyLocation).toBe(`https://hansen.no/${body.key}.txt`);
    // Visning via plattformen, lokal utvikling og tom liste: ingen ping.
    expect(await pingIndexNow("https://nettgata.no/vis/hansen", ["/"], { fetch: fetchMock, secret })).toBe(false);
    expect(await pingIndexNow("http://hansen.localhost:3000", ["/"], { fetch: fetchMock, secret })).toBe(false);
    expect(await pingIndexNow("https://hansen.no", [], { fetch: fetchMock, secret })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Feil hos søkemotoren stopper aldri noe.
    expect(await pingIndexNow("https://hansen.no", ["/"], { fetch: vi.fn(async () => Promise.reject(new Error("nede"))), secret })).toBe(false);
  });
});

describe("publisering med database", () => {
  it("gir råd etter publisering, og pinger eget domene når det er koblet til", async () => {
    process.env.SESSION_SECRET ??= "x".repeat(40);
    const db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Hansen Rør AS", slug: "hansen", industryPack: "rorlegger", theme: demoTheme, info: { city: "Drammen" } })
      .returning();
    const [front] = await db.insert(pages).values({ siteId: site.id, path: "/", title: "Forside", draft: page([hero()]) }).returning();
    await publishPage(db, front.id, user.id);
    expect((await publishSeoNotes(db, front.id)).join(" ")).toMatch(/Siden har 3 ord/);

    await db.insert(domains).values({ siteId: site.id, hostname: "www.hansen.no", kind: "sub", status: "active", isPrimary: true });
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await pingPublished(db, site.id, [front.id]);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).urlList).toEqual(["https://www.hansen.no/"]);
  });
});

describe("overskriftene på en ferdig side", () => {
  const ctx = (path: string): RenderContext => ({
    site: { id: "11111111-1111-4111-8111-111111111111", name: "Hansen Rør AS", info: readSiteInfo({ phone: "32 78 00 00", openingHours: [{ day: "Mandag", time: "8-16" }], serviceArea: "Drammen, Lier" }), schemaType: "Plumber" },
    nav: [{ path: "/", title: "Forside" }, { path: "/blogg", title: "Blogg" }],
    path,
    preview: false,
    basePath: "",
    shop: false,
    products: [],
    layout: readSiteLayout({}),
    posts: [{ path: "/blogg/a", title: "Innlegg A", excerpt: "", image: null, date: "2026-10-01T10:00:00Z" }],
  });
  const levels = (html: string) => [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));

  it("har én H1 og hopper aldri over et nivå, uansett hvilke seksjoner siden har", () => {
    for (const first of sectionTypes) {
      const sections = [first, ...sectionTypes.filter((t) => t !== first)].map((type, i) =>
        exampleSection(type, sectionRegistry[type].variants[0].key, `s${i}`),
      );
      const html = renderToStaticMarkup(createElement(PageRenderer, { content: page(sections), theme: buildTheme("atelier")!, ctx: ctx("/tjenester") }));
      const found = levels(html);
      expect(found.filter((l) => l === 1), first).toHaveLength(found[0] === 1 ? 1 : 0);
      for (let i = 1; i < found.length; i++) expect(found[i] - found[i - 1], `${first}: h${found[i - 1]} til h${found[i]}`).toBeLessThanOrEqual(1);
    }
  });

  it("brødsmuler og flere innlegg under et blogginnlegg, området i kontaktseksjonen", () => {
    const content = page([hero(), exampleSection("kontakt", "standard")]);
    const html = renderToStaticMarkup(createElement(PageRenderer, { content, theme: buildTheme("atelier")!, ctx: ctx("/blogg/b"), pageTitle: "Innlegg B" }));
    expect(html).toContain('aria-label="Brødsmuler"');
    expect(html).toContain('<span aria-current="page">Innlegg B</span>');
    expect(html).toContain("Flere innlegg");
    expect(html).toContain('href="/blogg/a"');
    expect(html).toContain("Område vi dekker: Drammen og Lier");
    // Uten egne kolonner i bunnteksten lenkes det til sidene i menyen.
    expect(html).toContain(">Sider</h2>");
    // Toppsider har ingen brødsmuler.
    const top = renderToStaticMarkup(createElement(PageRenderer, { content, theme: buildTheme("atelier")!, ctx: ctx("/tjenester"), pageTitle: "Tjenester" }));
    expect(top).not.toContain("Brødsmuler");
  });

  it("det første bildet i toppseksjonen hentes først, resten senere", () => {
    const content = page([hero({ bilde: { src, alt: "Topp" } }), { id: "b", type: "bildetekst", variant: "bilde-venstre", props: { brodtekst: "x", bilde: { src, alt: "Under" } } }]);
    const html = renderToStaticMarkup(createElement(PageRenderer, { content, theme: buildTheme("atelier")!, ctx: ctx("/") }));
    expect(html).toMatch(/alt="Topp" loading="eager" fetchPriority="high"/);
    expect(html).toMatch(/alt="Under" loading="lazy"/);
  });
});
