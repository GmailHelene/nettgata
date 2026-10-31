import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageRenderer, SiteChrome } from "@/components/sections";
import { ProductPage, ProductsPage, OrderPage, CartPage, shopTitle, type ShopRoute } from "@/components/shop/pages";
import { getDb } from "@/db";
import { productCategories, sites } from "@/db/schema";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";
import { getPublishedPage, normalizePath } from "@/lib/publishing";
import { buildRenderContext } from "@/lib/render";
import { listCatalog } from "@/lib/shop/catalog";
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
  const site =
    kind === "host"
      ? await resolveSiteByHost(db, key)
      : ((await db.select().from(sites).where(eq(sites.slug, key)).limit(1))[0] ?? null);
  return site ? { db, site, basePath: kind === "slug" ? `/vis/${site.slug}` : "" } : null;
});

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
  if (!target) return { title: "Plattformen" };
  const loaded = await loadSite(target.kind, keyOf(target));
  if (!loaded) return {};
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
        <h1 className="text-4xl font-bold">Plattformen</h1>
        <p className="mt-4 text-lg text-neutral-600">Under bygging. Studioet ligger på /studio.</p>
      </main>
    );
  }

  const loaded = await loadSite(target.kind, keyOf(target));
  if (!loaded) notFound();
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
        body = <ProductsPage products={items} categories={categories} activeSlug={active?.slug ?? null} basePath={basePath} />;
        break;
      }
      case "product": {
        const [product] = await listCatalog(db, site.id, { slug: route.slug });
        if (!product) notFound();
        body = <ProductPage siteId={site.id} product={product} basePath={basePath} />;
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
