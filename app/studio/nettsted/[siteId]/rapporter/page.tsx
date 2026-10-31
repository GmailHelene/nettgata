import Link from "next/link";
import { getDb } from "@/db";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { parseReportQuery, periodReport, reportPresets } from "@/lib/shop/reports";
import { paymentLabels, type PaymentMethod } from "@/lib/shop/settings";
import { SiteNav } from "../site-nav";

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("nb-NO", { timeZone: "UTC", month: "long", year: "numeric" });
};
const dayLabel = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("nb-NO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
};

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const period = parseReportQuery(await searchParams);
  const report = await periodReport(await getDb(), site.id, period.from, period.to);
  const base = `/studio/nettsted/${site.id}/rapporter`;
  const csvHref = `${base}/eksport?fra=${period.from}&til=${period.to}`;

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop active="rapporter" />

      <nav aria-label="Velg periode" className="-mx-5 mb-3 overflow-x-auto px-5">
        <ul className="flex min-w-max gap-2">
          {reportPresets().map((p) => (
            <li key={p.key}>
              <Link
                href={`${base}?periode=${p.key}`}
                aria-current={p.key === period.key ? "page" : undefined}
                className="block rounded-full border px-3 py-1 text-sm aria-[current=page]:border-neutral-900 aria-[current=page]:bg-neutral-900 aria-[current=page]:text-white"
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form action={base} className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block">Fra og med</span>
          <input type="date" name="fra" defaultValue={period.from} required className="rounded-md border border-neutral-400 px-3 py-2" />
        </label>
        <label className="block">
          <span className="mb-1 block">Til og med</span>
          <input type="date" name="til" defaultValue={period.to} required className="rounded-md border border-neutral-400 px-3 py-2" />
        </label>
        <button className="rounded-md border border-neutral-900 px-4 py-2 font-semibold">Vis periode</button>
        <a href={csvHref} className="ml-auto rounded-md border border-neutral-900 px-4 py-2 font-semibold">
          Last ned CSV
        </a>
      </form>
      {period.error && (
        <p role="alert" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          {period.error}
        </p>
      )}

      <h2 className="mb-4 text-lg font-semibold">
        {dayLabel(period.from)} til {dayLabel(period.to)}
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: "Salg inkl. MVA", value: formatNok(report.totalOre) },
          { label: "Herav MVA", value: formatNok(report.vatOre) },
          { label: "Salg eks. MVA", value: formatNok(report.netOre) },
          { label: "Ordre", value: String(report.orders) },
        ].map((t) => (
          <div key={t.label} className="rounded-lg border bg-white p-4">
            <p className="text-sm text-neutral-600">{t.label}</p>
            <p className="mt-1 text-xl font-semibold sm:text-2xl">{t.value}</p>
          </div>
        ))}
      </div>

      {report.orders === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">Ingen salg i denne perioden.</p>
      ) : (
        <>
          <section className="mb-6 overflow-x-auto rounded-lg border bg-white p-5">
            <h3 className="mb-1 font-semibold">MVA per sats</h3>
            <p className="mb-3 text-sm text-neutral-600">Frakt er fordelt på satsene etter varene i hver ordre, og rabatt er trukket fra før MVA er regnet ut.</p>
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Sats</th>
                  <th className="py-2 text-right font-medium">Eks. MVA</th>
                  <th className="py-2 text-right font-medium">MVA</th>
                  <th className="py-2 text-right font-medium">Inkl. MVA</th>
                </tr>
              </thead>
              <tbody>
                {report.vat.map((r) => (
                  <tr key={r.rate} className="border-b">
                    <td className="py-2">{r.rate} %</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(r.netOre)}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(r.vatOre)}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(r.grossOre)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">Totalt</td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(report.netOre)}</td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(report.vatOre)}</td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right">{formatNok(report.totalOre)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-lg border bg-white p-5">
              <h3 className="mb-3 font-semibold">Fordelt på</h3>
              <dl className="space-y-1 text-sm tabular-nums">
                <div className="flex justify-between">
                  <dt>Varer før rabatt</dt>
                  <dd>{formatNok(report.subtotalOre)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Rabatt</dt>
                  <dd>{report.discountOre ? `−${formatNok(report.discountOre)}` : formatNok(0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Frakt</dt>
                  <dd>{formatNok(report.shippingOre)}</dd>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <dt>Salg inkl. MVA</dt>
                  <dd>{formatNok(report.totalOre)}</dd>
                </div>
              </dl>
            </section>
            <section className="rounded-lg border bg-white p-5">
              <h3 className="mb-3 font-semibold">Betalingsmåter</h3>
              <ul className="space-y-1 text-sm tabular-nums">
                {report.payments.map((p) => (
                  <li key={p.method} className="flex justify-between gap-3">
                    <span>
                      {paymentLabels[p.method as PaymentMethod] ?? p.method} <span className="text-neutral-600">({p.orders} ordre)</span>
                    </span>
                    <span>{formatNok(p.ore)}</span>
                  </li>
                ))}
              </ul>
              {report.unpaidOrders > 0 && (
                <p className="mt-3 text-sm text-amber-900">
                  {report.unpaidOrders} ordre for {formatNok(report.unpaidOre)} venter fortsatt på betaling og er tatt med over.
                </p>
              )}
            </section>
          </div>

          {report.months.length > 1 && (
            <section className="mb-6 rounded-lg border bg-white p-5">
              <h3 className="mb-3 font-semibold">Per måned</h3>
              <ul className="space-y-1 text-sm tabular-nums">
                {report.months.map((m) => (
                  <li key={m.month} className="flex justify-between gap-3">
                    <span className="first-letter:uppercase">
                      {monthLabel(m.month)} <span className="text-neutral-600">({m.orders} ordre)</span>
                    </span>
                    <span>{formatNok(m.ore)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="text-sm text-neutral-600">
        Med i rapporten: ordre bestilt i perioden, også de som venter på betaling. Kansellerte og refunderte ordre er ikke med. Rapporten er et grunnlag
        for regnskapet. Kontroller tallene mot regnskapet før du leverer MVA-meldingen.
      </p>
    </main>
  );
}
