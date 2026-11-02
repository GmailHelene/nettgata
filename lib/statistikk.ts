import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { inquiries, pages, visitDays, visitHashes, visitPages, visitSources } from "@/db/schema";
import { normalizeHost, resolveHost } from "@/lib/hosts";
import { addDays, osloDate, parseOsloDate } from "@/lib/oslo-time";
import { normalizePath } from "@/lib/publishing";

/**
 * Cookiefri besøksstatistikk for kundenettstedene.
 *
 * Sidene caches ikke i dag, men nettstedene bytter side i nettleseren (next/link) og henter sider på forhånd.
 * Telling på serveren ville da talt forhåndshentinger og gått glipp av sidebytter, så nettleseren sender i stedet
 * en liten melding til /api/besok når en side faktisk vises (components/site/visit-beacon.tsx).
 * Det virker også den dagen sidene caches i kanten.
 *
 * Ingen informasjonskapsler og ingenting lagret i nettleseren. For å skille besøkende fra hverandre lages en
 * hash av IP-adresse og nettleser med et salt som byttes hver dag. IP-adressen lagres aldri, og hashen slettes
 * neste natt (lib/retention.ts). Alt annet er bare tall per dag.
 */

/** Visninger per besøkende per dag som telles. Mer enn dette er en robot eller noen som prøver å blåse opp tallene. */
export const MAX_VIEWS_PER_VISITOR = 300;
/** Lengre stier er nesten alltid søppel, og de skal ikke fylle opp tabellen. */
const MAX_PATH_LENGTH = 200;
const MAX_SOURCE_LENGTH = 100;

/** Søkemotorer, forhåndsvisninger i meldingsapper, overvåking og skript. Ikke fullstendig, men tar de vanlige. */
const BOT_PATTERN =
  /(?<!cu)bot\b|bot\/|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|whatsapp|curl|wget|python|httpclient|okhttp|go-http|java\/|axios|node-fetch|libwww|phantomjs|selenium|puppeteer|playwright|chrome-lighthouse/i;

export function isBot(userAgent: string): boolean {
  const ua = userAgent.trim();
  return ua.length < 20 || BOT_PATTERN.test(ua);
}

export type Device = "mobil" | "datamaskin";

/** Nettbrett regnes som mobil. Grovt, men godt nok til å se om de fleste bruker telefonen. */
export function deviceOf(userAgent: string): Device {
  return /mobi|android|iphone|ipad|ipod/i.test(userAgent) ? "mobil" : "datamaskin";
}

/**
 * Kilden til et besøk: vertsnavnet besøkende kom fra, uten www, aldri sti eller spørring.
 * Tom tekst er direkte besøk (skrev adressen, bokmerke, app uten Referer). Null betyr at besøkende
 * kom fra en annen side på samme nettsted, og da er det ikke et nytt besøk.
 */
export function sourceOf(referrer: string, ownHost: string): string | null {
  if (!referrer) return "";
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    return "";
  }
  const strip = (h: string) => normalizeHost(h).replace(/^www\./, "");
  const from = strip(host);
  if (!from) return "";
  if (from === strip(ownHost)) return null;
  return from.slice(0, MAX_SOURCE_LENGTH);
}

/** Navn i stedet for vertsnavn for de største kildene, så google.no og google.com blir én linje. */
export function sourceLabel(source: string): string {
  if (!source) return "Direkte eller ukjent";
  const known: [RegExp, string][] = [
    [/(^|\.)google\.[a-z.]+$/, "Google"],
    [/(^|\.)bing\.com$/, "Bing"],
    [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
    [/(^|\.)kvasir\.no$/, "Kvasir"],
    [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
    [/(^|\.)instagram\.com$/, "Instagram"],
    [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
    [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "X"],
    [/(^|\.)tiktok\.com$/, "TikTok"],
    [/(^|\.)snapchat\.com$/, "Snapchat"],
    [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
    [/(^|\.)(finn\.no)$/, "Finn"],
    [/(^|\.)(1881\.no)$/, "1881"],
    [/(^|\.)(gulesider\.no)$/, "Gule Sider"],
    [/(^|\.)(proff\.no)$/, "Proff"],
    [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
  ];
  return known.find(([pattern]) => pattern.test(source))?.[1] ?? source;
}

export type Hit = { path: string; referrer: string; entry: boolean };

/**
 * Leser meldingen fra nettleseren: { p: sti, r: referrer, e: 1 for første side i besøket }.
 * Spørring og fragment fjernes, så nøkler i adressen aldri lagres. Null for alt som ikke ser riktig ut.
 */
export function parseHit(text: string): Hit | null {
  if (!text || text.length > 4000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { p, r, e } = data as Record<string, unknown>;
  if (typeof p !== "string" || !p.startsWith("/")) return null;
  let path = p.split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Beholdes som den er. Ugyldig koding er sjelden og ufarlig.
  }
  path = normalizePath(path);
  if (path.length > MAX_PATH_LENGTH || /[\u0000-\u001f\u007f]/.test(path)) return null;
  return { path, referrer: typeof r === "string" ? r.slice(0, 2000) : "", entry: e === 1 || e === true };
}

/**
 * Koden som skiller besøkende fra hverandre i dag. Saltet er avledet fra hemmeligheten og datoen, så koden
 * blir en annen i morgen og på et annet nettsted. 128 bit holder lenge for å unngå kollisjoner.
 */
export async function visitorHash(secret: Uint8Array, day: string, siteId: string, ip: string, userAgent: string): Promise<string> {
  const encoder = new TextEncoder();
  const daily = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const salt = await crypto.subtle.sign("HMAC", daily, encoder.encode(`besok:${day}`));
  const key = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${siteId}\n${ip}\n${userAgent}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type VisitInput = Hit & { host: string; ip: string; userAgent: string };
export type VisitResult = "telt" | "ukjent-nettsted" | "ikke-publisert" | "over-grensen";

/**
 * Teller én visning. Kalles etter at svaret er sendt (after() i app/api/besok), så den aldri gjør siden tregere.
 * Bare vertsnavn som hører til et nettsted med publiserte sider teller. Plattformens egne adresser og /vis
 * stoppes før dette, i ruten.
 */
export async function recordVisit(db: Db, secret: Uint8Array, input: VisitInput, now = new Date()): Promise<VisitResult> {
  const match = await resolveHost(db, input.host);
  // Adresser som sendes videre til hovedadressen, telles der.
  if (!match || match.redirectHost) return "ukjent-nettsted";
  const siteId = match.site.id;
  const [published] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.siteId, siteId), isNotNull(pages.publishedVersionId)))
    .limit(1);
  if (!published) return "ikke-publisert";

  const day = osloDate(now);
  const hash = await visitorHash(secret, day, siteId, input.ip, input.userAgent);
  const [visitor] = await db
    .insert(visitHashes)
    .values({ siteId, day, hash, views: 1 })
    .onConflictDoUpdate({ target: [visitHashes.siteId, visitHashes.day, visitHashes.hash], set: { views: sql`${visitHashes.views} + 1` } })
    .returning({ views: visitHashes.views });
  if (visitor.views > MAX_VIEWS_PER_VISITOR) return "over-grensen";

  const isNew = visitor.views === 1 ? 1 : 0;
  const mobile = isNew && deviceOf(input.userAgent) === "mobil" ? 1 : 0;
  const source = input.entry ? sourceOf(input.referrer, input.host) : null;

  await Promise.all([
    db
      .insert(visitDays)
      .values({ siteId, day, views: 1, visitors: isNew, mobileVisitors: mobile })
      .onConflictDoUpdate({
        target: [visitDays.siteId, visitDays.day],
        set: {
          views: sql`${visitDays.views} + 1`,
          visitors: sql`${visitDays.visitors} + ${isNew}`,
          mobileVisitors: sql`${visitDays.mobileVisitors} + ${mobile}`,
        },
      }),
    db
      .insert(visitPages)
      .values({ siteId, day, path: input.path, views: 1 })
      .onConflictDoUpdate({ target: [visitPages.siteId, visitPages.day, visitPages.path], set: { views: sql`${visitPages.views} + 1` } }),
    source === null
      ? Promise.resolve()
      : db
          .insert(visitSources)
          .values({ siteId, day, source, visits: 1 })
          .onConflictDoUpdate({ target: [visitSources.siteId, visitSources.day, visitSources.source], set: { visits: sql`${visitSources.visits} + 1` } }),
  ]);
  return "telt";
}

// ---------- Til studioet ----------

export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export function parsePeriod(value: unknown): StatsPeriod {
  const n = Number(value);
  return STATS_PERIODS.find((p) => p === n) ?? 30;
}

export type DailyVisits = { date: string; views: number; visitors: number };
export type Ranked = { label: string; count: number };

/** Besøk de siste dagene, til og med i dag. Dager uten besøk er med som null, så grafen ikke hopper over dem. */
export async function visitStats(db: Db, siteId: string, days: StatsPeriod, now = new Date()) {
  const to = osloDate(now);
  const from = addDays(to, -(days - 1));

  const [dayRows, pageRows, sourceRows] = await Promise.all([
    db.select().from(visitDays).where(and(eq(visitDays.siteId, siteId), gte(visitDays.day, from), lte(visitDays.day, to))),
    db
      .select({ path: visitPages.path, count: sql<number>`cast(sum(${visitPages.views}) as int)` })
      .from(visitPages)
      .where(and(eq(visitPages.siteId, siteId), gte(visitPages.day, from), lte(visitPages.day, to)))
      .groupBy(visitPages.path)
      .orderBy(desc(sql`sum(${visitPages.views})`), visitPages.path)
      .limit(10),
    db
      .select({ source: visitSources.source, count: sql<number>`cast(sum(${visitSources.visits}) as int)` })
      .from(visitSources)
      .where(and(eq(visitSources.siteId, siteId), gte(visitSources.day, from), lte(visitSources.day, to)))
      .groupBy(visitSources.source),
  ]);

  const byDay = new Map(dayRows.map((r) => [r.day, r]));
  const daily: DailyVisits[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const row = byDay.get(date);
    daily.push({ date, views: row?.views ?? 0, visitors: row?.visitors ?? 0 });
  }
  const totals = dayRows.reduce(
    (sum, r) => ({ views: sum.views + r.views, visitors: sum.visitors + r.visitors, mobile: sum.mobile + r.mobileVisitors }),
    { views: 0, visitors: 0, mobile: 0 },
  );
  return {
    from,
    to,
    daily,
    ...totals,
    pages: pageRows.map((r) => ({ label: r.path, count: Number(r.count) })),
    sources: mergeSources(sourceRows.map((r) => ({ source: r.source, count: Number(r.count) }))),
  };
}

/** Slår sammen kilder med samme navn (google.no og google.com) og gir de ti største. */
export function mergeSources(rows: { source: string; count: number }[], limit = 10): Ranked[] {
  const merged = new Map<string, number>();
  for (const r of rows) {
    const label = sourceLabel(r.source);
    merged.set(label, (merged.get(label) ?? 0) + r.count);
  }
  return [...merged.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "nb"))
    .slice(0, limit);
}

/** De siste månedene som «2026-11», eldste først, med inneværende måned sist. */
export function lastMonths(count: number, now = new Date()): string[] {
  const [y, m] = osloDate(now).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Henvendelser per måned i norsk tid. Henvendelser slettes etter tolv måneder, så lenger tilbake blir tallene for lave. */
export async function inquiriesPerMonth(db: Db, siteId: string, months = 12, now = new Date()) {
  const keys = lastMonths(months, now);
  const start = parseOsloDate(`${keys[0]}-01`)!;
  const rows = await db
    .select({ createdAt: inquiries.createdAt })
    .from(inquiries)
    .where(and(eq(inquiries.siteId, siteId), gte(inquiries.createdAt, start)));
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const key = osloDate(r.createdAt).slice(0, 7);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return keys.map((month) => ({ month, count: counts.get(month)! }));
}
