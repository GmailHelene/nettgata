import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageRenderer } from "@/components/sections";
import { getDb } from "@/db";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";
import { getPublishedPage, normalizePath } from "@/lib/publishing";
import { buildRenderContext } from "@/lib/render";
import { themeToCssVars } from "@/lib/theme";

type Params = { params: Promise<{ path?: string[] }> };

/** Samme oppslag brukes av både metadata og side; cache() hindrer dobbel spørring per forespørsel. */
const load = cache(async (host: string, path: string) => {
  const db = await getDb();
  const site = await resolveSiteByHost(db, host);
  if (!site) return null;
  const page = await getPublishedPage(db, site.id, path);
  if (!page) return null;
  const ctx = await buildRenderContext(db, site, normalizePath(path), false);
  return { site, page, ctx };
});

async function currentRequest({ params }: Params) {
  const { path = [] } = await params;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  let decoded: string;
  try {
    decoded = "/" + path.map(decodeURIComponent).join("/");
  } catch {
    notFound();
  }
  // Vertsnavnet er allerede slått opp mot kjente domener, så det er trygt å bruke i kanoniske lenker.
  return { host, path: decoded, origin: `${proto}://${host}` };
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { host, path, origin } = await currentRequest(props);
  if (isPlatformHost(host)) return { title: "Plattformen" };
  const data = await load(host, path);
  if (!data) return {};
  const { site, page } = data;
  return {
    title: page.content.seo.title || `${page.title} | ${site.name}`,
    description: page.content.seo.description || undefined,
    alternates: { canonical: `${origin}${normalizePath(path)}` },
    openGraph: { siteName: site.name, locale: "nb_NO", type: "website" },
  };
}

export default async function PublicPage(props: Params) {
  const { host, path, origin } = await currentRequest(props);

  if (isPlatformHost(host)) {
    if (path !== "/") notFound();
    return (
      <main className="mx-auto max-w-2xl px-5 py-24">
        <h1 className="text-4xl font-bold">Plattformen</h1>
        <p className="mt-4 text-lg text-neutral-600">Under bygging. Studioet ligger på /studio.</p>
      </main>
    );
  }

  const data = await load(host, path);
  if (!data) notFound();
  return (
    <PageRenderer
      content={data.page.content}
      style={themeToCssVars(data.site.theme)}
      ctx={data.ctx}
      canonicalUrl={`${origin}/`}
    />
  );
}
