import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { PageRenderer, SiteChrome, siteHref } from "@/components/sections";
import { ProductPage, ProductsPage, OrderPage, CartPage, shopMeta, type ShopRoute } from "@/components/shop/pages";
import { effectiveTitle, firstContentImage, shareImageSrc } from "@/lib/content/seo";
import { getDb } from "@/db";
import { productCategories, sites } from "@/db/schema";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { getPublishedContents, getPublishedPage, normalizePath } from "@/lib/publishing";
import { embeddedBookingHosts } from "@/lib/booking";
import { buildRenderContext } from "@/lib/render";
import { listCatalog } from "@/lib/shop/catalog";
import { readShopSettings } from "@/lib/shop/settings";
import { parseBrowseQuery } from "@/lib/shop/browse";
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

export async function generateMetadata(props: Props): Promise<Metadata> {
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
  const sharing = (title: string, description: string | undefined, image: { src: string; alt: string } | null | undefined): Metadata => ({
    title,
    description,
    openGraph: {
      siteName: site.name,
      locale: "nb_NO",
      type: "website",
      title,
      description,
      ...(image && { images: [{ url: `${origin}${shareImageSrc(image.src)}`, ...(image.alt && { alt: image.alt }) }] }),
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
  });

  const route = site.kind === "nettbutikk" ? shopRoute(target.segments) : null;
  if (route) {
    const meta = await shopMeta(db, site, route);
    // Handlekurv og ordre skal aldri i søkemotorer.
    const noindex = route.kind === "cart" || route.kind === "order";
    return {
      ...sharing(`${meta.title} | ${site.name}`, meta.description, meta.image),
      ...(noindex ? { robots: { index: false, follow: false } } : indexing),
    };
  }

  const page = await getPublishedPage(db, site.id, path);
  const generated = page ? null : generatedLegalPage(site, normalizePath(path));
  if (generated) return { title: generated.seo.title, description: generated.seo.description, ...indexing };
  if (!page) return normalizePath(path) === "/" ? { title: site.name, robots: { index: false, follow: false } } : {};
  const seo = page.content.seo ?? {};
  return {
    ...sharing(
      effectiveTitle(seo.title, page.title, site.name),
      seo.description?.trim() || undefined,
      seo.image ?? firstContentImage(page.content),
    ),
    ...indexing,
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


  const route = site.kind === "nettbutikk" ? shopRoute(target.segments) : null;
  if (route) {
    const ctx = await buildRenderContext(db, site, normalizePath(path), false, basePath);
    let body: React.ReactNode;
    switch (route.kind) {
      case "products": {
        const query = await props.searchParams;
        const categories = await db
          .select()
          .from(productCategories)
          .where(eq(productCategories.siteId, site.id))
          .orderBy(asc(productCategories.sortOrder), asc(productCategories.name));
        const active = categories.find((c) => c.slug === query.kategori);
        const items = await listCatalog(db, site.id, active ? { categoryId: active.id } : {});
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
    const bookingHosts =
      at === GENERATED_PATHS.personvern ? embeddedBookingHosts(await getPublishedContents(db, site.id)) : [];
    const generated = generatedLegalPage(site, at, { bookingHosts }) ?? (at === "/" ? comingSoonPage(site.name) : null);
    if (!generated) notFound();
    const legalCtx = await buildRenderContext(db, site, at, false, basePath);
    return <PageRenderer content={generated} theme={site.theme} ctx={legalCtx} />;
  }
  const ctx = await buildRenderContext(db, site, normalizePath(path), false, basePath, {
    posts: page.content.sections.some((s) => s.type === "blogg"),
  });
  return <PageRenderer content={page.content} theme={site.theme} ctx={ctx} canonicalUrl={`${origin}/`} />;
}
