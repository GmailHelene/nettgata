import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageRenderer } from "@/components/sections";
import { getDb } from "@/db";
import { isPlatformHost, resolveSiteByHost } from "@/lib/hosts";
import { getPublishedPage } from "@/lib/publishing";
import { themeToCssVars } from "@/lib/theme";

type Params = { params: Promise<{ path?: string[] }> };

/** Samme oppslag brukes av både metadata og side; cache() hindrer dobbel spørring per forespørsel. */
const load = cache(async (host: string, path: string) => {
  const db = await getDb();
  const site = await resolveSiteByHost(db, host);
  if (!site) return null;
  const page = await getPublishedPage(db, site.id, path);
  return page ? { site, page } : null;
});

async function currentRequest({ params }: Params) {
  const { path = [] } = await params;
  const host = (await headers()).get("host") ?? "";
  return { host, path: "/" + path.join("/") };
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const { host, path } = await currentRequest(props);
  if (isPlatformHost(host)) return { title: "Plattformen" };
  const data = await load(host, path);
  if (!data) return {};
  const { site, page } = data;
  return {
    title: page.content.seo.title || `${page.title} | ${site.name}`,
    description: page.content.seo.description || undefined,
  };
}

export default async function PublicPage(props: Params) {
  const { host, path } = await currentRequest(props);

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
  return <PageRenderer content={data.page.content} style={themeToCssVars(data.site.theme)} />;
}
