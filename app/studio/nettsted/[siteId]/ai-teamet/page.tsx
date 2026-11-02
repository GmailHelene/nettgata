import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNotNull } from "drizzle-orm";
import { ui } from "@/components/studio/ui";
import { getDb } from "@/db";
import { pages } from "@/db/schema";
import { aiTeamActive, weeklyAiActive } from "@/lib/ai/access";
import { getAiClient } from "@/lib/ai/client";
import { MONTHLY_CAP_ORE, WEEKLY_CAP_ORE, WEEKLY_MAX_SUGGESTIONS } from "@/lib/ai/config";
import { CAP_REACHED, spentThisMonth, underCap } from "@/lib/ai/runs";
import { listSuggestions, type Suggestion } from "@/lib/ai/suggestions";
import { ADDON } from "@/lib/billing/plans";
import { sectionRegistry } from "@/lib/content/registry";
import { pageContentSchema } from "@/lib/content/types";
import { formatOsloDay } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../site-nav";
import { RunNowButton, SuggestionCard, type CardData } from "./suggestion-card";

export const metadata: Metadata = { title: "AI-teamet" };

const ROLE_LABELS: Record<string, string> = { seo: "SEO", innhold: "Innhold og markedsføring", butikk: "Butikk og drift" };
const KIND_LABELS: Record<string, string> = {
  seo_tittel: "Tittel i Google",
  seo_beskrivelse: "Beskrivelse i Google",
  tekst: "Tekst på siden",
  blogginnlegg: "Blogginnlegg",
  sosialt_innlegg: "Sosiale medier",
  tips: "Tips",
};
const STATUS_LABELS: Record<string, string> = { godkjent: "Godkjent", avvist: "Avvist", utdatert: "Ikke brukt, teksten var endret" };

type PageInfo = { title: string; sections: Map<string, string> };

function fieldLabel(s: Suggestion, info: PageInfo | undefined): string | null {
  if (s.kind !== "tekst" || !s.sectionId || !s.field) return null;
  const type = info?.sections.get(s.sectionId);
  const def = type ? sectionRegistry[type as keyof typeof sectionRegistry] : undefined;
  const field = def?.fields.find((f) => f.key === s.field);
  return def ? `${def.label}, ${field?.label.toLowerCase() ?? s.field}` : null;
}

export default async function AiTeamPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user, role } = await requireSiteAccess(siteId);
  const db = await getDb();
  const active = aiTeamActive(site.billing);
  // Uten tillegget: den ukentlige AI-rapporten, som er med i grunnprisen når abonnementet er betalt.
  const weekly = !active && weeklyAiActive(site.billing);
  const [published] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.siteId, site.id), isNotNull(pages.publishedVersionId)))
    .limit(1);
  const ready = Boolean(await getAiClient());
  const { open, decided } = await listSuggestions(db, site.id);
  const capOk = active ? await underCap(db, site.id) : weekly ? await underCap(db, site.id, new Date(), "ukentlig") : true;
  const spent = user.isPlatformAdmin ? await spentThisMonth(db, site.id) : 0;

  const pageRows = await db.select({ id: pages.id, title: pages.title, draft: pages.draft }).from(pages).where(eq(pages.siteId, site.id));
  const pageInfo = new Map<string, PageInfo>(
    pageRows.map((p) => {
      const parsed = pageContentSchema.safeParse(p.draft);
      return [p.id, { title: p.title, sections: new Map(parsed.success ? parsed.data.sections.map((s) => [s.id, s.type]) : []) }];
    }),
  );
  const cards: CardData[] = open.map((s) => {
    const info = s.pageId ? pageInfo.get(s.pageId) : undefined;
    return {
      id: s.id,
      roleLabel: ROLE_LABELS[s.role] ?? s.role,
      kindLabel: KIND_LABELS[s.kind] ?? s.kind,
      kind: s.kind,
      title: s.title,
      pageTitle: info?.title ?? null,
      fieldLabel: fieldLabel(s, info),
      before: s.before,
      value: s.proposal.value,
      ingress: s.proposal.ingress || null,
      channel: s.proposal.channel ?? null,
      reason: s.reason,
      effect: s.effect,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="ai-teamet" />

      <section aria-labelledby="om-ai" className="mb-8">
        <h2 id="om-ai" className="text-xl font-semibold">
          AI-teamet
        </h2>
        <p className={`mt-2 ${ui.muted}`}>
          {active
            ? "Hver natt ser AI-teamet gjennom nettstedet og foreslår bedre tekst, titler for Google, blogginnlegg og innlegg til sosiale medier."
            : `Én gang i uka ser AI-teamet gjennom nettstedet og gir deg opptil ${WEEKLY_MAX_SUGGESTIONS} forslag til bedre tekst, titler for Google og blogginnlegg. Det er med i abonnementet.`}{" "}
          Ingenting endres før du trykker Godkjenn, og da bare i kladden. Du publiserer selv.
        </p>
      </section>

      {!active && !weekly && (
        <p role="status" className={`${ui.card} mb-6 p-5`}>
          Den ukentlige AI-rapporten starter når abonnementet er betalt og nettstedet er publisert.
        </p>
      )}

      {weekly && (
        <>
          {!ready && <p className={`${ui.error} mb-6`}>AI-teamet er ikke slått på hos oss ennå. Forslagene kommer så snart det er klart.</p>}
          {!published && (
            <p role="status" className={`${ui.card} mb-6 p-5`}>
              Den ukentlige rapporten starter når nettstedet er publisert.
            </p>
          )}
          {!capOk && (
            <p role="status" className={`${ui.success} mb-6`}>
              {CAP_REACHED}
            </p>
          )}
          <section aria-labelledby="nye-forslag" className="mb-10">
            <h3 id="nye-forslag" className="mb-4 text-lg font-semibold">
              {cards.length ? `Forslag som venter på deg (${cards.length})` : "Ingen forslag venter"}
            </h3>
            {cards.length === 0 ? (
              <p className={ui.muted}>Nye forslag kommer én gang i uka. Du får en e-post når de er klare.</p>
            ) : (
              <div className="space-y-5">
                {cards.map((c) => (
                  <SuggestionCard key={c.id} siteId={site.id} s={c} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {!active ? (
        <section aria-labelledby="ikke-aktiv" className={`${ui.card} p-5`}>
          <h3 id="ikke-aktiv" className="font-semibold">
            Vil du ha forslag hver dag?
          </h3>
          <p className="mt-2">
            {ADDON.includes} Det koster {formatNok(ADDON.monthOre)} pluss mva i måneden.
          </p>
          <p className={`mt-2 text-sm ${ui.muted}`}>
            Med tillegget får du opptil åtte forslag hver natt i stedet for tre i uka, innlegg til Facebook og Instagram, tips til butikken og
            knappen «Lag nye forslag nå». Den ukentlige rapporten er med uansett.
          </p>
          {role === "owner" ? (
            <p className="mt-4">
              <Link href={`/studio/nettsted/${site.id}/abonnement`} className={ui.link}>
                Legg til AI-teamet under Abonnement
              </Link>
            </p>
          ) : (
            <p className={`mt-4 text-sm ${ui.muted}`}>Eieren av nettstedet kan legge det til under Abonnement.</p>
          )}
        </section>
      ) : (
        <>
          {!ready && <p className={`${ui.error} mb-6`}>AI-teamet er ikke slått på hos oss ennå. Forslagene kommer så snart det er klart.</p>}
          {!capOk && (
            <p role="status" className={`${ui.success} mb-6`}>
              {CAP_REACHED}
            </p>
          )}

          <section aria-labelledby="nye-forslag">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 id="nye-forslag" className="text-lg font-semibold">
                {cards.length ? `Forslag som venter på deg (${cards.length})` : "Ingen forslag venter"}
              </h3>
              {ready && capOk && <RunNowButton siteId={site.id} />}
            </div>
            {cards.length === 0 ? (
              <p className={ui.muted}>Nye forslag kommer i løpet av natten.</p>
            ) : (
              <div className="space-y-5">
                {cards.map((c) => (
                  <SuggestionCard key={c.id} siteId={site.id} s={c} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {decided.length > 0 && (
        <details className="mt-10">
          <summary className="cursor-pointer font-semibold">Behandlede forslag</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {decided.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-[#d5dbe0] pb-2">
                <span>{s.title}</span>
                <span className={ui.muted}>
                  {STATUS_LABELS[s.status] ?? s.status}
                  {s.decidedAt && `, ${formatOsloDay(s.decidedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {user.isPlatformAdmin && (active || weekly) && (
        <p className={`mt-10 text-sm ${ui.muted}`}>
          For plattformadmin: brukt {formatNok(spent)} av {formatNok(active ? MONTHLY_CAP_ORE : WEEKLY_CAP_ORE)} denne måneden
          {active ? "" : " (ukentlig rapport)"} (kjøringer som venter, er regnet med antatt pris).
        </p>
      )}
    </main>
  );
}
