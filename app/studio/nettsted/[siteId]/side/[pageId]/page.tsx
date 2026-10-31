import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { listVersions } from "@/lib/publishing";
import { buildRenderContext } from "@/lib/render";
import { themeToCssVars } from "@/lib/theme";
import { requireSiteAccess } from "@/lib/session";
import { PageEditor } from "./page-editor";

export default async function EditPage({ params }: { params: Promise<{ siteId: string; pageId: string }> }) {
  const { siteId, pageId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.siteId, site.id)))
    .limit(1);
  if (!page) notFound();
  const versions = await listVersions(db, page.id);
  const publishedNumber = versions.find((v) => v.id === page.publishedVersionId)?.number ?? null;

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-12">
      <Link href={`/studio/nettsted/${site.id}/sider`} className="text-sm underline">
        {site.name}
      </Link>
      <PageEditor
        siteId={site.id}
        preview={{ ctx: await buildRenderContext(db, site, page.path, true), style: themeToCssVars(site.theme) }}
        pageId={page.id}
        path={page.path}
        initialTitle={page.title}
        initialContent={page.draft}
        publishedNumber={publishedNumber}
        versions={versions.map((v) => ({ id: v.id, number: v.number, createdAt: v.createdAt.toISOString() }))}
      />
    </main>
  );
}
