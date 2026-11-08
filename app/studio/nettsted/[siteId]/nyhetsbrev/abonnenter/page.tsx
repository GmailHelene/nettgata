import type { Metadata } from "next";
import Link from "next/link";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { canSendNewsletter } from "@/lib/nyhetsbrev/send";
import { listSubscribers, parseSubscriberQuery, subscriberCounts, subscriberStatuses, SUBSCRIBERS_PER_PAGE, type SubscriberStatus } from "@/lib/nyhetsbrev/subscribers";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { deleteSubscriberAction } from "../actions";
import { ConfirmButton } from "@/components/studio/confirm-button";
import { NewsletterTabs } from "../newsletter-tabs";

export const metadata: Metadata = { title: "Abonnenter" };

const statusStyle: Record<SubscriberStatus, string> = {
  bekreftet: "bg-[#e9f1ed] text-[#1e3d30]",
  venter: "bg-[#fdf3dc] text-[#5c4300]",
  avmeldt: "bg-[#eef0f2] text-[#3a444d]",
};

export default async function SubscribersPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);
  const db = await getDb();
  const query = parseSubscriberQuery(await searchParams);
  const [counts, found] = await Promise.all([subscriberCounts(db, site.id), listSubscribers(db, site.id, query)]);
  const rows = found.slice(0, SUBSCRIBERS_PER_PAGE);
  const hasNext = found.length > SUBSCRIBERS_PER_PAGE;
  const base = `/studio/nettsted/${site.id}/nyhetsbrev/abonnenter`;
  const href = (changes: Record<string, string | number>) => {
    const merged = { q: query.search, status: query.status, side: query.page, ...changes };
    const next = new URLSearchParams();
    if (merged.q) next.set("q", String(merged.q));
    if (merged.status !== "alle") next.set("status", String(merged.status));
    if (Number(merged.side) > 1) next.set("side", String(merged.side));
    const qs = next.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const canDelete = canSendNewsletter(role);
  const filters: { key: SubscriberStatus | "alle"; label: string }[] = [
    { key: "alle", label: `Alle (${counts.bekreftet + counts.venter + counts.avmeldt})` },
    ...(Object.keys(subscriberStatuses) as SubscriberStatus[]).map((key) => ({ key, label: `${subscriberStatuses[key]} (${counts[key]})` })),
  ];

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="nyhetsbrev" />
      <NewsletterTabs siteId={site.id} active="abonnenter" counts={counts} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action={base} role="search" className="flex flex-1 gap-2">
          {query.status !== "alle" && <input type="hidden" name="status" value={query.status} />}
          <label htmlFor="abonnent-sok" className="sr-only">
            Søk i abonnenter
          </label>
          <input
            id="abonnent-sok"
            name="q"
            type="search"
            defaultValue={query.search}
            placeholder="E-post eller navn"
            className="min-w-0 flex-1 rounded-md border border-neutral-400 px-3 py-2"
          />
          <button className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">Søk</button>
        </form>
        <a href={`/studio/nettsted/${site.id}/nyhetsbrev/eksport`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          Last ned CSV
        </a>
      </div>

      <nav aria-label="Vis abonnenter" className="-mx-5 mb-4 overflow-x-auto px-5">
        <ul className="flex min-w-max gap-2">
          {filters.map((f) => (
            <li key={f.key}>
              <Link
                href={href({ status: f.key, side: 1 })}
                aria-current={f.key === query.status ? "page" : undefined}
                className="block rounded-full border px-3 py-1 text-sm aria-[current=page]:border-[#173b6c] aria-[current=page]:bg-[#173b6c] aria-[current=page]:text-white"
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-neutral-700">
          {query.search
            ? `Ingen abonnenter passer «${query.search}».`
            : "Ingen her ennå. Legg seksjonen «Nyhetsbrev» på en side, så kan folk melde seg på."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
              <span className="mr-auto min-w-48">
                <span className="block font-medium">{s.email}</span>
                {s.name && <span className="text-sm text-neutral-600">{s.name}</span>}
              </span>
              <span className="text-sm text-neutral-700">
                Påmeldt {formatOsloDateTime(s.consentedAt)}
                {s.confirmedAt && s.status === "bekreftet" && `, bekreftet ${formatOsloDateTime(s.confirmedAt)}`}
                {s.unsubscribedAt && s.status === "avmeldt" && `, meldt av ${formatOsloDateTime(s.unsubscribedAt)}`}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[s.status]}`}>{subscriberStatuses[s.status]}</span>
              {canDelete && (
                <form action={deleteSubscriberAction.bind(null, site.id, s.id)}>
                  <ConfirmButton className="text-sm text-[#a13a2c] underline" label={`Slett ${s.email}`} question={`Slette ${s.email} fra listen? Det kan ikke angres.`}>
                    Slett
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {(query.page > 1 || hasNext) && (
        <nav aria-label="Sider" className="mt-4 flex items-center justify-between text-sm">
          {query.page > 1 ? (
            <Link href={href({ side: query.page - 1 })} className="underline">
              Forrige side
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-600">Side {query.page}</span>
          {hasNext ? (
            <Link href={href({ side: query.page + 1 })} className="underline">
              Neste side
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <p className={`mt-8 text-sm ${ui.muted}`}>
        Bare bekreftede får nyhetsbrev. De som har meldt seg av, blir stående, så de aldri får nyhetsbrev igjen ved en feil. Slett en abonnent
        bare når personen ber om det. Da forsvinner også avmeldingen. Påmeldinger som ikke er bekreftet, slettes etter 30 dager.
      </p>
    </main>
  );
}
