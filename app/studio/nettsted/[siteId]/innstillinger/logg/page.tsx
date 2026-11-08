import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, like, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { logAmount, logGroup, logGroups, logLabel, prefixesIn, type LogGroup } from "@/lib/endringslogg";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../../site-nav";
import { OwnerOnly } from "../owner-note";

export const metadata: Metadata = { title: "Logg" };

const PER_PAGE = 100;

/**
 * Innstillinger › Logg: hvem som gjorde hva, og når. Plattformen har skrevet revisjonsloggen hele tiden. Her blir den
 * synlig for eieren, som i Shopify (Innstillinger › Aktivitet). Bare eieren, fordi loggen viser hva hver bruker har gjort.
 */
export default async function LogPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const q = await searchParams;
  const { site, role } = await requireSiteAccess(siteId);
  const base = `/studio/nettsted/${site.id}/innstillinger/logg`;
  if (role !== "owner") {
    return (
      <main className="mx-auto max-w-4xl px-5 py-12">
        <SiteNav siteId={site.id} active="innstillinger" title="Logg" />
        <OwnerOnly>Bare eieren kan se loggen, fordi den viser hva hver bruker har gjort.</OwnerOnly>
      </main>
    );
  }

  const group = typeof q.gruppe === "string" && q.gruppe in logGroups ? (q.gruppe as LogGroup) : null;
  const before = typeof q.for === "string" && !Number.isNaN(Date.parse(q.for)) ? new Date(q.for) : null;
  const prefixes = group ? prefixesIn(group) : [];
  const rows = await (await getDb())
    .select({ id: auditLog.id, action: auditLog.action, detail: auditLog.detail, createdAt: auditLog.createdAt, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(
      and(
        eq(auditLog.siteId, site.id),
        before ? lt(auditLog.createdAt, before) : undefined,
        group ? (prefixes.length ? or(...prefixes.map((p) => like(auditLog.action, `${p}.%`))) : like(auditLog.action, "%")) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(PER_PAGE + 1);
  const more = rows.length > PER_PAGE;
  const shown = rows.slice(0, PER_PAGE);
  const href = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const g = "gruppe" in changes ? changes.gruppe : group;
    if (g) p.set("gruppe", g);
    if (changes.for) p.set("for", changes.for);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Logg" />
      <p className="-mt-4 mb-6 text-neutral-700">Alt som er gjort i studioet, hvem som gjorde det og når.</p>

      <nav aria-label="Vis bare" className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link href={href({ gruppe: null })} aria-current={!group ? "page" : undefined} className="rounded-full border px-3 py-1.5 aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white">
          Alt
        </Link>
        {(Object.keys(logGroups) as LogGroup[])
          .filter((g) => g !== "annet")
          .map((g) => (
            <Link key={g} href={href({ gruppe: g })} aria-current={group === g ? "page" : undefined} className="rounded-full border px-3 py-1.5 aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white">
              {logGroups[g]}
            </Link>
          ))}
      </nav>

      {shown.length === 0 ? (
        <p className="rounded-lg border bg-white p-5 text-neutral-700">Ingenting er logget her ennå.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Logg, nyeste først</caption>
            <thead>
              <tr className="border-b text-left text-neutral-600">
                <th scope="col" className="px-4 py-2 font-medium">
                  Når
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Hva
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Hvem
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const orderId = typeof r.detail?.orderId === "string" ? r.detail.orderId : null;
                const amount = logAmount(r.detail);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-700">{formatOsloDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2">
                      {logLabel(r.action)}
                      {amount !== null && <span className="text-neutral-700"> · {formatNok(amount)}</span>}
                      {orderId && logGroup(r.action) !== "kunder" && (
                        <>
                          {" "}
                          <Link href={`/studio/nettsted/${site.id}/ordre/${orderId}`} className="underline">
                            Se ordren
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-neutral-700">{r.email ?? "Nettgata (automatisk)"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <p className="mt-4">
          <Link href={href({ for: shown[shown.length - 1].createdAt.toISOString() })} className="underline">
            Vis eldre
          </Link>
        </p>
      )}
    </main>
  );
}
