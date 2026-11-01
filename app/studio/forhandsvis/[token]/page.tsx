import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageRenderer } from "@/components/sections";
import { getDb } from "@/db";
import { pages, sites } from "@/db/schema";
import { validatePageContent } from "@/lib/content/registry";
import { verifyPreviewToken } from "@/lib/preview";
import { buildRenderContext } from "@/lib/render";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Viser kladden for den som har lenken. Krever ikke innlogging, men lenken er signert og utløper. */
export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pageId = await verifyPreviewToken(token);
  if (!pageId) notFound();

  const db = await getDb();
  const [row] = await db
    .select({ page: pages, site: sites })
    .from(pages)
    .innerJoin(sites, eq(pages.siteId, sites.id))
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!row) notFound();
  // Kladden kan være uferdig. Den vises likevel, slik den ser ut i redigereren.
  const result = validatePageContent(row.page.draft, "draft");
  if (!result.ok) notFound();

  return (
    <>
      <p className="sticky top-0 z-50 bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-black">
        Forhåndsvisning av kladd: {row.page.title}. Denne versjonen er ikke publisert.
      </p>
      <PageRenderer
        content={result.content}
        theme={row.site.theme}
        ctx={await buildRenderContext(db, row.site, row.page.path, true)}
      />
    </>
  );
}
