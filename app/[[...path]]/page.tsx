import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { PageRenderer, SiteChrome, siteHref } from "@/components/sections";
import { ProductPage, ProductsPage, OrderPage, CartPage, shopMeta, type ShopRoute } from "@/components/shop/pages";
import { firstContentImage, pageSeo, shareImageSrc } from "@/lib/content/seo";
import { bransjeKeyword, parseServiceArea, primaryPlace } from "@/lib/seo/auto";
import {
  articleJsonLd,
  breadcrumbItems,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  localBusinessJsonLd,
  priceRange,
  servicesJsonLd,
  websiteJsonLd,
} from "@/lib/seo/schema";
import { readSiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import { getDb } from "@/db";
import { productCategories, sites } from "@/db/schema";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { getPublishedContents, getPublishedPage, normalizePath } from "@/lib/publishing";
import { embeddedBookingHosts } from "@/lib/booking";
import { CANCEL_PATH } from "@/lib/egen-booking/notify";
import { usesOwnBooking } from "@/lib/egen-booking/store";
import { BookingCancelPage } from "@/components/site/booking-cancel";
import { NewsletterConfirmPage, NewsletterUnsubscribePage } from "@/components/site/newsletter-pages";
import { NEWSLETTER_CONFIRM_PATH, NEWSLETTER_UNSUBSCRIBE_PATH, usesNewsletter } from "@/lib/nyhetsbrev/subscribers";
import { buildRenderContext } from "@/lib/render";
import { listCatalog } from "@/lib/shop/catalog";
import { readShopSettings } from "@/lib/shop/settings";
import { browse, isRefinedQuery, parseBrowseQuery, resultSummary } from "@/lib/shop/browse";
import { embeddedServices } from "@/lib/embeds";
import { usesInquiryImages } from "@/lib/henvendelser/bilder";
import { siteIcons } from "@/lib/favicon";
import { findRedirect } from "@/lib/redirects";
import { GENERATED_PATHS, generatedLegalPage } from "@/lib/legal/kundesider";
import type { PageContent } from "@/lib/content/types";
import { renderPlatformPage } from "@/components/platform/pages";
import { platformMetadata, platformRoute } from "@/lib/platform-routes";

type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * To måter å nå et nettsted på:
 * - eget domene eller gratis underdomene: siten slås opp på vertsnavnet
 * - plattformens adresse + /vis/<slug>/...: for pilot og før DNS er koblet til
 */
type Target = { kind: "host"; host: string; segments: string[] } | { kind: "slug"; slug: string; segments: string[] };

const loadSite = cache(async (kind: Target["kind"], key: string) => {
  const db = await getDb();
  if (kind === "host") {
    const match = await resolveHost(db, key);
    return match ? { db, site: match.site, basePath: "", redirectHost: match.redirectHost } : null;
  }
  const [site] = await db.select().from(sites).where(eq(sites.slug, key)).limit(1);
  return site ? { db, site, basePath: `/vis/${site.slug}`, redirectHost: null } : null;
});

/** Varene og kategoriene til varelisten. Delt mellom metadata (antall treff i tittelen) og selve siden. */
const loadProducts = cache(async (siteId: string, categorySlug: string | null) => {
  const db = await getDb();
  const categories = await db
    .select()
    .from(productCategories)
    .where(eq(productCategories.siteId, siteId))
    .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
  const active = categories.find((c) => c.slug === categorySlug);
  const items = await listCatalog(db, siteId, active ? { categoryId: active.id } : {});
  return { categories, active, items };
});

const firstValue = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** Sender besøket videre til hovedadressen med samme sti og spørring (308, permanent). */
async function redirectToPrimary(host: string, props: Props): Promise<never> {
  const { path = [] } = await props.params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await props.searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const qs = query.toString();
  permanentRedirect(`https://${host}/${path.join("/")}${qs ? `?${qs}` : ""}`);
}

/** Butikkens egne ruter. Alt annet er vanlige sider. */
function shopRoute(segments: string[]): ShopRoute | null {
  const [first, second, ...rest] = segments;
  if (rest.length) return null;
  if (first === "produkter" && !second) return { kind: "products" };
  if (first === "produkt" && second) return { kind: "product", slug: second };
  if (first === "handlekurv" && !second) return { kind: "cart" };
  if (first === "ordre" && second) return { kind: "order", orderId: second };
  return null;
}

async function currentRequest({ params }: Props) {
  const { path = [] } = await params;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  let segments: string[];
  try {
    segments = path.map(decodeURIComponent);
  } catch {
    notFound();
  }
  const target: Target | null = !isPlatformHost(host)
    ? { kind: "host", host, segments }
    : segments[0] === "vis" && segments[1]
      ? { kind: "slug", slug: segments[1], segments: segments.slice(2) }
      : null;
  // Vertsnavnet er allerede slått opp mot kjente domener, så det er trygt å bruke i kanoniske lenker.
  // På plattformens egen adresse er stien en av salgssidene (lib/platform-routes.ts).
  return { target, platform: target === null ? platformRoute(segments) : null, origin: `${proto}://${host}` };
}

const keyOf = (t: Target) => (t.kind === "host" ? t.host : t.slug);

/** Det de automatiske titlene bygger på: navn, bransjeord og sted. */
function seoContext(site: typeof sites.$inferSelect) {
  return {
    siteName: site.name,
    keyword: bransjeKeyword(site.industryPack),
    place: primaryPlace(readSiteInfo(site.info)),
    shop: site.kind === "nettbutikk",
  };
}

/**
 * Strukturerte data for en publisert side: bedriften (riktig type per bransje) på alle sider, nettstedet på forsiden,
 * brødsmuler på undersider, spørsmål og svar, tjenester med pris og blogginnlegg. Bare på eget domene og gratisadressen.
 */
function pageJsonLd(
  site: typeof sites.$inferSelect,
  origin: string,
  page: { title: string; content: PageContent; createdAt: Date; publishedAt: Date },
  at: string,
  nav: { path: string; title: string }[],
  schemaType: string,
): string | null {
  const siteUrl = `${origin}/`;
  const pageUrl = `${origin}${at}`;
  const info = readSiteInfo(site.info);
  const image = page.content.seo?.image ?? firstContentImage(page.content);
  const imageUrl = image ? new URL(shareImageSrc(image.src), siteUrl).toString() : undefined;
  const business = localBusinessJsonLd({
    name: site.name,
    schemaType,
    url: siteUrl,
    info,
    layout: readSiteLayout(site.layout),
    ...(at === "/" && { image: imageUrl, priceRange: priceRange([page.content]) }),
  });
  return jsonLdScript([
    business,
    at === "/" ? websiteJsonLd(siteUrl, site.name) : null,
    breadcrumbJsonLd(breadcrumbItems(at, page.title, nav), siteUrl),
    faqJsonLd(page.content, pageUrl),
    ...servicesJsonLd(page.content, siteUrl, parseServiceArea(info.serviceArea)),
    at.startsWith("/blogg/")
      ? articleJsonLd({
          url: pageUrl,
          siteUrl,
          siteName: site.name,
          title: page.title,
          published: page.createdAt,
          modified: page.publishedAt,
          image: imageUrl,
          description: pageSeo({ ...seoContext(site), pageTitle: page.title, content: page.content, path: at }).description,
        })
      : null,
  ]);
}

/** Ikonet i fanen (lib/favicon.ts) legges på alle sidene til kundenettstedene. */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const meta = await pageMetadata(props);
  const { target } = await currentRequest(props);
  const loaded = target ? await loadSite(target.kind, keyOf(target)) : null;
  if (!loaded) return meta;
  // «Koble til Google Search Console»: koden kunden har limt inn under Innstillinger. Bare på eget domene og gratisadressen.
  const google = target?.kind === "host" ? readSiteInfo(loaded.site.info).googleVerification : "";
  return { ...meta, icons: siteIcons(loaded.site), ...(google && { verification: { google } }) };
}

async function pageMetadata(props: Props): Promise<Metadata> {
  const { target, platform, origin } = await currentRequest(props);
  if (!target) return platform ? platformMetadata(platform, origin) : { title: "Nettgata" };
  const loaded = await loadSite(target.kind, keyOf(target));
  if (!loaded) return {};
  if (loaded.redirectHost) await redirectToPrimary(loaded.redirectHost, props);
  const { site, db } = loaded;
  const path = "/" + target.segments.join("/");
  // Visningen via plattformens adresse er en kopi og skal ikke konkurrere med kundens eget domene i Google.
  const indexing =
    target.kind === "host" ? { alternates: { canonical: `${origin}${normalizePath(path)}` } } : { robots: { index: false, follow: false } };

  /** Tittel, beskrivelse og bilde også når siden deles på Facebook, LinkedIn og i meldinger. */
  const sharing = (
    title: string,
    description: string | undefined,
    image: { src: string; alt: string } | null | undefined,
    type: "website" | "article" | "product" = "website",
  ): Metadata => ({
    title,
    description,
    // Next kjenner ikke og:type «product». Da settes den som egen tagg.
    ...(type === "product" && { other: { "og:type": "product" } }),
    openGraph: {
      siteName: site.name,
      locale: "nb_NO",
      ...(type !== "product" && { type }),
      title,
      description,
      ...(image && { images: [{ url: `${origin}${shareImageSrc(image.src)}`, ...(image.alt && { alt: image.alt }) }] }),
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
  });

  // Avbestillingslenken fra timebestillingen. Nøkkelen står i adressen, så den skal aldri i søkemotorer eller videre i Referer.
  if (normalizePath(path) === CANCEL_PATH) return { title: `Avbestill time | ${site.name}`, robots: { index: false, follow: false }, referrer: "no-referrer" };
  // Lenkene fra nyhetsbrevet har også nøkkelen i adressen.
  if (normalizePath(path) === NEWSLETTER_CONFIRM_PATH) return { title: `Bekreft påmeldingen | ${site.name}`, robots: { index: false, follow: false }, referrer: "no-referrer" };
  if (normalizePath(path) === NEWSLETTER_UNSUBSCRIBE_PATH) return { title: `Meld deg av | ${site.name}`, robots: { index: false, follow: false }, referrer: "no-referrer" };

  const route = site.kind === "nettbutikk" ? shopRoute(target.segments) : null;
  if (route) {
    const meta = await shopMeta(db, site, route);
    // Handlekurv og ordre skal aldri i søkemotorer.
    const noindex = route.kind === "cart" || route.kind === "order";
    if (route.kind === "products") {
      // Søk, filter og sortering er varianter av varelisten og skal ikke i søkemotorer. Lenkene kan fortsatt følges.
      const params = await props.searchParams;
      const query = parseBrowseQuery(params);
      const { categories, items, active } = await loadProducts(site.id, firstValue(params.kategori));
      if (isRefinedQuery(query)) {
        const count = browse(items, query, Object.fromEntries(categories.map((c) => [c.id, c.name]))).length;
        // Siden lastes på nytt ved søk, så skjermlesere leser antallet her først.
        const title = query.search ? `${resultSummary(count, query.search)} | ${site.name}` : `${meta.title}, ${resultSummary(count)} | ${site.name}`;
        return { title, robots: { index: false, follow: true } };
      }
      // En kategori er en egen side for Google, med kategorinavnet i tittelen og sin egen kanoniske adresse.
      if (active) {
        const canonical =
          target.kind === "host" ? { alternates: { canonical: `${origin}/produkter?kategori=${encodeURIComponent(active.slug)}` } } : indexing;
        return { ...sharing(`${active.name} | ${site.name}`, meta.description, meta.image), ...canonical };
      }
    }
    return {
      ...sharing(meta.seoTitle ?? `${meta.title} | ${site.name}`, meta.description, meta.image, route.kind === "product" ? "product" : "website"),
      ...(noindex ? { robots: { index: false, follow: false } } : indexing),
    };
  }

  const page = await getPublishedPage(db, site.id, path);
  const generated = page ? null : generatedLegalPage(site, normalizePath(path));
  if (generated) return { title: generated.seo.title, description: generated.seo.description, ...indexing };
  if (!page) return normalizePath(path) === "/" ? { title: site.name, robots: { index: false, follow: false } } : {};
  const seo = page.content.seo ?? {};
  // Kundens egen tittel og beskrivelse vinner. Ellers lages de av navn, bransje, sted og teksten på siden.
  const at = normalizePath(path);
  const auto = pageSeo({ ...seoContext(site), pageTitle: page.title, content: page.content, path: at });
  return {
    ...sharing(auto.title, auto.description, seo.image ?? firstContentImage(page.content), at.startsWith("/blogg/") ? "article" : "website"),
    // Eieren har valgt «Ikke vis i Google» for siden. Lenkene på den kan fortsatt følges.
    ...(seo.noindex ? { robots: { index: false, follow: true } } : indexing),
  };
}

/** Vises på forsiden til den er publisert. Metadata over setter noindex, så Google ikke tar vare på den. */
function comingSoonPage(name: string): PageContent {
  return {
    seo: { title: name },
    sections: [
      { id: "snart", type: "tekst", variant: "standard", props: { overskrift: name, brodtekst: "Nettstedet er snart klart. Kom gjerne tilbake om litt." } },
    ],
  };
}

export default async function PublicPage(props: Props) {
  const { target, platform, origin } = await currentRequest(props);

  if (!target) {
    const env = { tagId: process.env.GOOGLE_ADS_TAG_ID?.trim() ?? "", sendTo: process.env.GOOGLE_ADS_LEAD_SEND_TO?.trim() ?? "" };
    const page = platform ? renderPlatformPage(platform, env) : null;
    if (!page) notFound();
    return page;
  }

  const loaded = await loadSite(target.kind, keyOf(target));
  if (!loaded) notFound();
  if (loaded.redirectHost) await redirectToPrimary(loaded.redirectHost, props);
  const { db, site, basePath } = loaded;
  const path = "/" + target.segments.join("/");


  if (normalizePath(path) === CANCEL_PATH) {
    const query = await props.searchParams;
    const ctx = await buildRenderContext(db, site, CANCEL_PATH, false, basePath);
    return (
      <SiteChrome theme={site.theme} ctx={ctx}>
        <BookingCancelPage db={db} siteId={site.id} token={typeof query.t === "string" ? query.t : ""} />
      </SiteChrome>
    );
  }

  if (normalizePath(path) === NEWSLETTER_CONFIRM_PATH || normalizePath(path) === NEWSLETTER_UNSUBSCRIBE_PATH) {
    const query = await props.searchParams;
    const token = typeof query.t === "string" ? query.t : "";
    const ctx = await buildRenderContext(db, site, normalizePath(path), false, basePath);
    return (
      <SiteChrome theme={site.theme} ctx={ctx}>
        {normalizePath(path) === NEWSLETTER_CONFIRM_PATH ? (
          <NewsletterConfirmPage siteId={site.id} siteName={site.name} token={token} />
        ) : (
          <NewsletterUnsubscribePage db={db} siteId={site.id} siteName={site.name} token={token} />
        )}
      </SiteChrome>
    );
  }

  const route = site.kind === "nettbutikk" ? shopRoute(target.segments) : null;
  if (route) {
    const ctx = await buildRenderContext(db, site, normalizePath(path), false, basePath);
    let body: React.ReactNode;
    switch (route.kind) {
      case "products": {
        const query = await props.searchParams;
        const { categories, active, items } = await loadProducts(site.id, firstValue(query.kategori));
        body = (
          <ProductsPage products={items} categories={categories} activeSlug={active?.slug ?? null} basePath={basePath} query={parseBrowseQuery(query)} />
        );
        break;
      }
      case "product": {
        const [product] = await listCatalog(db, site.id, { slug: route.slug });
        if (!product) notFound();
        body = (
          <ProductPage siteId={site.id} siteName={site.name} product={product} basePath={basePath} settings={readShopSettings(site.shop)} origin={origin} />
        );
        break;
      }
      case "cart":
        body = <CartPage siteId={site.id} basePath={basePath} />;
        break;
      case "order": {
        const query = await props.searchParams;
        const token = typeof query.t === "string" ? query.t : "";
        const page = await OrderPage({ db, siteId: site.id, orderId: route.orderId, token, basePath });
        if (!page) notFound();
        body = page;
        break;
      }
    }
    return (
      <SiteChrome theme={site.theme} ctx={ctx}>
        {body}
      </SiteChrome>
    );
  }

  const page = await getPublishedPage(db, site.id, path);
  // Gamle adresser fra en tidligere nettside (Innstillinger, Flytting). Sider som finnes, vinner,
  // bortsett fra gamle adresser med spørring som WordPress sine «/?page_id=12».
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await props.searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const search = query.size ? `?${query}` : "";
  const moved = !page || search ? findRedirect(site.redirects, path, search, Boolean(page)) : null;
  if (moved) permanentRedirect(moved.startsWith("/") ? siteHref(basePath, moved) : moved);
  if (!page) {
    // Personvernerklæring og angrerett lages automatisk når kunden ikke har laget en egen side der.
    // Er ikke forsiden publisert ennå, får den som har fått adressen en «snart klar»-side, ikke «Fant ikke siden».
    const at = normalizePath(path);
    // Personvernerklæringen nevner bookingsystemene som er bygget inn på de publiserte sidene.
    const published = at === GENERATED_PATHS.personvern ? await getPublishedContents(db, site.id) : [];
    const bookingHosts = embeddedBookingHosts(published);
    const ownBooking = at === GENERATED_PATHS.personvern && (await usesOwnBooking(db, site.id, published));
    const newsletter = at === GENERATED_PATHS.personvern && (await usesNewsletter(db, site.id, published));
    // Kart og video fra Google nevnes bare når de er i bruk.
    const embeds = embeddedServices(published);
    // Bilder i kontaktskjemaet nevnes bare når et publisert skjema har bildefeltet.
    const inquiryImages = usesInquiryImages(published);
    const generated = generatedLegalPage(site, at, { bookingHosts, ownBooking, newsletter, embeds, inquiryImages }) ?? (at === "/" ? comingSoonPage(site.name) : null);
    if (!generated) notFound();
    const legalCtx = await buildRenderContext(db, site, at, false, basePath);
    return <PageRenderer content={generated} theme={site.theme} ctx={legalCtx} />;
  }
  const at = normalizePath(path);
  const ctx = await buildRenderContext(db, site, at, false, basePath, {
    // Blogginnleggene trengs i bloggseksjonen og i «Flere innlegg» under et innlegg.
    posts: page.content.sections.some((s) => s.type === "blogg") || at.startsWith("/blogg/"),
  });
  // Kopien via plattformens adresse er noindex og får ingen strukturerte data.
  const jsonLd = basePath ? null : pageJsonLd(site, origin, page, at, ctx.nav, ctx.site.schemaType);
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
      <PageRenderer content={page.content} theme={site.theme} ctx={ctx} canonicalUrl={`${origin}/`} pageTitle={page.title} />
    </>
  );
}
