import { and, asc, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, inquiries, pages } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";
import { PageList } from "./page-list";
import { SiteNav } from "./site-nav";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [pageRows, domainRows, [{ unread }]] = await Promise.all([
    db.select().from(pages).where(eq(pages.siteId, site.id)).orderBy(asc(pages.sortOrder), asc(pages.path)),
    db.select().from(domains).where(eq(domains.siteId, site.id)),
    db.select({ unread: count() }).from(inquiries).where(and(eq(inquiries.siteId, site.id), isNull(inquiries.readAt))),
  ]);
  const root = process.env.SITES_ROOT_DOMAIN ?? "localhost";
  const freeHost = root ? `${site.slug}.${root}` : null;
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="sider" unread={unread} />
      <p className="mb-8 text-sm text-neutral-600">
        <a className="underline" href={`/vis/${site.slug}`} target="_blank" rel="noreferrer">
          Se nettstedet
        </a>
        {freeHost && (
          <>
            {" "}
            · Gratis adresse:{" "}
            <a className="underline" href={`${protocol}://${freeHost}`} target="_blank" rel="noreferrer">
              {freeHost}
            </a>
          </>
        )}
        {domainRows.map((d) => (
          <span key={d.id}>
            {" "}
            · {d.hostname} {d.status === "pending" ? "(venter på DNS)" : ""}
          </span>
        ))}
      </p>
      <PageList
        siteId={site.id}
        pages={pageRows.map((p) => ({
          id: p.id,
          title: p.title,
          path: p.path,
          showInMenu: p.showInMenu,
          published: p.publishedVersionId !== null,
        }))}
      />
    </main>
  );
}
