import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/studio/ui";
import { PageIntro } from "@/components/studio/help";
import { getDb } from "@/db";
import { osloDate } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { periodReport } from "@/lib/shop/reports";
import { inquiriesPerMonth, lastMonths, parsePeriod, STATS_PERIODS, visitStats, type Ranked } from "@/lib/statistikk";
import { SiteNav } from "../site-nav";
import { VisitChart } from "./visit-chart";

export const metadata: Metadata = { title: "Besøk" };

const whole = new Intl.NumberFormat("nb-NO");

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("nb-NO", { timeZone: "UTC", month: "long", year: "numeric" });
};

/** Liste med tall og en stolpe som viser andelen. Stolpen er pynt, tallet står alltid som tekst. */
function RankedList({ title, rows, unit, empty }: { title: string; rows: Ranked[]; unit: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className={`${ui.card} p-5`}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className={`text-sm ${ui.muted}`}>{empty}</p>
      ) : (
        <table className="w-full table-fixed text-sm tabular-nums">
          <thead className="sr-only">
            <tr>
              <th scope="col">{title}</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="relative py-1.5 pr-3 text-left font-normal">
                  <span aria-hidden="true" className="absolute inset-y-1 left-0 rounded bg-[#e3ebf4]" style={{ width: `${(r.count / max) * 100}%` }} />
                  <span className="relative block truncate px-2" title={r.label}>
                    {r.label}
                  </span>
                </th>
                <td className="w-20 py-1.5 text-right">{whole.format(r.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function StatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const days = parsePeriod((await searchParams).dager);
  const shop = site.kind === "nettbutikk";
  const db = await getDb();
  const now = new Date();
  const months = lastMonths(12, now);
  // Salget per måned regnes med samme funksjon som Rapporter, så tallene alltid er like.
  const [stats, inquiryMonths, sales] = await Promise.all([
    visitStats(db, site.id, days, now),
    inquiriesPerMonth(db, site.id, 12, now),
    shop ? periodReport(db, site.id, `${months[0]}-01`, osloDate(now)) : null,
  ]);
  const salesByMonth = new Map((sales?.months ?? []).map((m) => [m.month, m]));
  const base = `/studio/nettsted/${site.id}/statistikk`;
  const mobileShare = stats.visitors ? Math.round((stats.mobile / stats.visitors) * 100) : 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={shop} active="statistikk" />
      <PageIntro article="statistikk">Besøk på de publiserte sidene, telt uten informasjonskapsler.</PageIntro>

      <nav aria-label="Velg periode" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {STATS_PERIODS.map((p) => (
            <li key={p}>
              <Link
                href={`${base}?dager=${p}`}
                aria-current={p === days ? "page" : undefined}
                className="block rounded-full border border-[#d5dbe0] px-3 py-1 text-sm aria-[current=page]:border-[#173b6c] aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white"
              >
                Siste {p} dager
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: "Besøkende", value: whole.format(stats.visitors) },
          { label: "Sidevisninger", value: whole.format(stats.views) },
          { label: "Sider per besøkende", value: stats.visitors ? (stats.views / stats.visitors).toLocaleString("nb-NO", { maximumFractionDigits: 1 }) : "0" },
          { label: "På mobil", value: `${mobileShare} %` },
        ].map((t) => (
          <div key={t.label} className={`${ui.card} p-4`}>
            <p className={`text-sm ${ui.muted}`}>{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{t.value}</p>
          </div>
        ))}
      </div>

      <section className={`${ui.card} mb-6 p-5`}>
        <h2 className="mb-4 font-semibold">Besøkende per dag</h2>
        {stats.views === 0 ? (
          <p className={`text-sm ${ui.muted}`}>
            Ingen besøk i denne perioden ennå. Besøk telles når nettstedet er publisert og noen åpner det på adressen sin. Visninger fra studioet telles
            ikke.
          </p>
        ) : (
          <VisitChart daily={stats.daily} visitors={stats.visitors} />
        )}
      </section>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <RankedList title="Mest leste sider" unit="Sidevisninger" rows={stats.pages} empty="Ingen sidevisninger ennå." />
        <RankedList title="Hvor besøkene kom fra" unit="Besøk" rows={stats.sources} empty="Ingen besøk ennå." />
      </div>

      <section className={`${ui.card} mb-6 overflow-x-auto p-5`}>
        <h2 className="mb-1 font-semibold">Per måned</h2>
        <p className={`mb-3 text-sm ${ui.muted}`}>Siste tolv måneder. Henvendelser slettes etter tolv måneder, så tallene går ikke lenger tilbake.</p>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="py-2 font-medium">
                Måned
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Henvendelser
              </th>
              {shop && (
                <>
                  <th scope="col" className="py-2 text-right font-medium">
                    Ordre
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Salg inkl. MVA
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {[...inquiryMonths].reverse().map((m) => (
              <tr key={m.month} className="border-b last:border-0">
                <th scope="row" className="py-2 text-left font-normal first-letter:uppercase">
                  {monthLabel(m.month)}
                </th>
                <td className="py-2 text-right">{whole.format(m.count)}</td>
                {shop && (
                  <>
                    <td className="py-2 text-right">{whole.format(salesByMonth.get(m.month)?.orders ?? 0)}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(salesByMonth.get(m.month)?.ore ?? 0)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {shop && (
          <p className={`mt-3 text-sm ${ui.muted}`}>
            Salget regnes som i{" "}
            <Link href={`/studio/nettsted/${site.id}/rapporter`} className={ui.link}>
              Rapporter
            </Link>
            : ordre bestilt i måneden, også de som venter på betaling, uten kansellerte og refunderte.
          </p>
        )}
      </section>

      <p className={`text-sm ${ui.muted}`}>
        Besøk telles uten informasjonskapsler, og ingen ser hvem som har vært innom. En besøkende telles én gang per dag, så den som kommer tilbake en
        annen dag, telles på nytt. Søkemotorer og andre roboter holdes utenfor så godt det lar seg gjøre.
      </p>
    </main>
  );
}
