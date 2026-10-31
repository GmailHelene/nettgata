import Link from "next/link";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { PageRenderer, SiteChrome } from "@/components/sections";
import { ProductPage, ProductsPage, OrderPage, CartPage, shopTitle, type ShopRoute } from "@/components/shop/pages";
import { getDb } from "@/db";
import { productCategories, sites } from "@/db/schema";
import { isPlatformHost, resolveHost } from "@/lib/hosts";
import { getPublishedPage, normalizePath } from "@/lib/publishing";
import { buildRenderContext } from "@/lib/render";
import { listCatalog } from "@/lib/shop/catalog";
import { readShopSettings } from "@/lib/shop/settings";
import { parseBrowseQuery } from "@/lib/shop/browse";
import { themeToCssVars } from "@/lib/theme";

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
  return { target, isPlatformRoot: target === null && segments.length === 0, origin: `${proto}://${host}` };
}

const keyOf = (t: Target) => (t.kind === "host" ? t.host : t.slug);

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { target, origin } = await currentRequest(props);
  if (!target) return { title: "Nettgata", description: "Nettsider og nettbutikker for norske bedrifter." };
  const loaded = await loadSite(target.kind, keyOf(target));
  if (!loaded) return {};
  if (loaded.redirectHost) await redirectToPrimary(loaded.redirectHost, props);
  const { site, db } = loaded;
  const path = "/" + target.segments.join("/");
  // Visningen via plattformens adresse er en kopi og skal ikke konkurrere med kundens eget domene i Google.
  const indexing =
    target.kind === "host" ? { alternates: { canonical: `${origin}${normalizePath(path)}` } } : { robots: { index: false, follow: false } };

  const route = site.kind === "nettbutikk" ? shopRoute(target.segments) : null;
  if (route) {
    const title = await shopTitle(db, site, route);
    // Handlekurv og ordre skal aldri i søkemotorer.
    const noindex = route.kind === "cart" || route.kind === "order";
    return { title: `${title} | ${site.name}`, ...(noindex ? { robots: { index: false, follow: false } } : indexing) };
  }

  const page = await getPublishedPage(db, site.id, path);
  if (!page) return {};
  return {
    title: page.content.seo.title || `${page.title} | ${site.name}`,
    description: page.content.seo.description || undefined,
    openGraph: { siteName: site.name, locale: "nb_NO", type: "website" },
    ...indexing,
  };
}

export default async function PublicPage(props: Props) {
  const { target, isPlatformRoot, origin } = await currentRequest(props);

  if (!target) {
    if (!isPlatformRoot) notFound();
    return (
      <main className="mx-auto max-w-2xl px-5 py-24">
        <h1 className="text-4xl font-bold">Nettgata</h1>
        <p className="mt-4 text-lg text-neutral-700">Nettsider og nettbutikker for norske bedrifter. Åpner snart.</p>
        <p className="mt-8 text-sm">
          <Link href="/studio" className="underline">
            Logg inn
          </Link>
        </p>
      </main>
    );
  }

  const loaded = await loadSite(target.kind, keyOf(target));
  if (!loaded) notFound();
  if (loaded.redirectHost) await redirectToPrimary(loaded.redirectHost, props);
  const { db, site, basePath } = loaded;
  const path = "/" + target.segments.join("/");
  const style = themeToCssVars(site.theme);

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
      <SiteChrome style={style} ctx={ctx}>
        {body}
      </SiteChrome>
    );
  }

  const page = await getPublishedPage(db, site.id, path);
  if (!page) notFound();
  const ctx = await buildRenderContext(db, site, normalizePath(path), false, basePath);
  return <PageRenderer content={page.content} style={style} ctx={ctx} canonicalUrl={`${origin}/`} />;
}
