import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageRenderer } from "@/components/sections";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";
import { getPublishedPage, normalizePath } from "@/lib/publishing";
import { buildRenderContext } from "@/lib/render";
import { themeToCssVars } from "@/lib/theme";

type Params = { params: Promise<{ path?: string[] }> };

/**
 * To måter å nå et nettsted på:
 * - eget domene eller gratis underdomene: siten slås opp på vertsnavnet
 * - plattformens adresse + /vis/<slug>/...: for pilot og før DNS er koblet til
 */
type Target = { kind: "host"; host: string; path: string } | { kind: "slug"; slug: string; path: string };

/** Samme oppslag brukes av både metadata og side; cache() hindrer dobbel spørring per forespørsel. */
const load = cache(async (kind: Target["kind"], key: string, path: string) => {
  const db = await getDb();
  const site =
    kind === "host"
      ? await resolveSiteByHost(db, key)
      : ((await db.select().from(sites).where(eq(sites.slug, key)).limit(1))[0] ?? null);
  if (!site) return null;
  const page = await getPublishedPage(db, site.id, path);
  if (!page) return null;
  const basePath = kind === "slug" ? `/vis/${site.slug}` : "";
  const ctx = await buildRenderContext(db, site, normalizePath(path), false, basePath);
  return { site, page, ctx };
});

async function currentRequest({ params }: Params) {
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
    ? { kind: "host", host, path: "/" + segments.join("/") }
    : segments[0] === "vis" && segments[1]
      ? { kind: "slug", slug: segments[1], path: "/" + segments.slice(2).join("/") }
      : null;
  // Vertsnavnet er allerede slått opp mot kjente domener, så det er trygt å bruke i kanoniske lenker.
  return { target, isPlatformRoot: target === null && segments.length === 0, origin: `${proto}://${host}` };
}

const loadTarget = (t: Target) => load(t.kind, t.kind === "host" ? t.host : t.slug, t.path);

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { target, origin } = await currentRequest(props);
  if (!target) return { title: "Plattformen" };
  const data = await loadTarget(target);
  if (!data) return {};
  const { site, page } = data;
  return {
    title: page.content.seo.title || `${page.title} | ${site.name}`,
    description: page.content.seo.description || undefined,
    openGraph: { siteName: site.name, locale: "nb_NO", type: "website" },
    // Visningen via plattformens adresse er en kopi og skal ikke konkurrere med kundens eget domene i Google.
    ...(target.kind === "host"
      ? { alternates: { canonical: `${origin}${normalizePath(target.path)}` } }
      : { robots: { index: false, follow: false } }),
  };
}

export default async function PublicPage(props: Params) {
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

  const data = await loadTarget(target);
  if (!data) notFound();
  return (
    <PageRenderer content={data.page.content} style={themeToCssVars(data.site.theme)} ctx={data.ctx} canonicalUrl={`${origin}/`} />
  );
}
