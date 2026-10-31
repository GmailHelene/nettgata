import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, pages } from "@/db/schema";
import { requireSiteAccess } from "@/lib/session";

export default async function SitePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const [pageRows, domainRows] = await Promise.all([
    db.select().from(pages).where(eq(pages.siteId, site.id)).orderBy(asc(pages.sortOrder), asc(pages.path)),
    db.select().from(domains).where(eq(domains.siteId, site.id)),
  ]);
  const freeHost = `${site.slug}.${process.env.SITES_ROOT_DOMAIN ?? "localhost"}`;

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <Link href="/studio" className="text-sm underline">
        Alle nettsteder
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{site.name}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Gratis adresse:{" "}
        <a className="underline" href={`http://${freeHost}`} target="_blank" rel="noreferrer">
          {freeHost}
        </a>
        {domainRows.map((d) => (
          <span key={d.id}>
            {" "}· {d.hostname} {d.status === "pending" ? "(venter på DNS)" : ""}
          </span>
        ))}
      </p>

      <h2 className="mb-4 mt-10 text-lg font-semibold">Sider</h2>
      <ul className="divide-y rounded-lg border bg-white">
        {pageRows.map((page) => {
          const unpublished = !page.publishedVersionId;
          return (
            <li key={page.id}>
              <Link href={`/studio/nettsted/${site.id}/side/${page.id}`} className="flex items-center justify-between p-4 hover:bg-neutral-50">
                <span>
                  <span className="font-medium">{page.title}</span>{" "}
                  <span className="text-sm text-neutral-600">{page.path}</span>
                </span>
                <span className={`text-sm ${unpublished ? "text-amber-800" : "text-green-800"}`}>
                  {unpublished ? "Ikke publisert" : "Publisert"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
