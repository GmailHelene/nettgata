import { and, asc, count, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { inquiries, monthlyReports, pages, pageVersions, sites, visitDays, visitPages, visitSources } from "@/db/schema";
import { seoHints } from "@/lib/content/seo";
import { pageContentSchema } from "@/lib/content/types";
import { deliver, type EmailProvider } from "@/lib/email/send";
import { emailParts, type Rendered } from "@/lib/email/templates";
import { addDays, osloDate, parseOsloDate } from "@/lib/oslo-time";
import { formatNok } from "@/lib/shop/money";
import { periodReport } from "@/lib/shop/reports";
import { platformUrl } from "@/lib/site-url";
import { mergeSources, type Ranked } from "@/lib/statistikk";
import { reportRecipients, type Recipient } from "./mottakere";

/*
 * Månedsrapporten på e-post. Den 1. i måneden (norsk tid) får eieren, og redaktører som har slått den på,
 * en kort oversikt over forrige måned: besøk, mest leste sider, kilder, henvendelser, salg for nettbutikker,
 * og ett eller to «fiks nå» fra SEO-sjekken. Ingen AI, så den koster ingenting å lage.
 *
 * Bakgrunnsjobben hvert tiende minutt sender til MONTHLY_REPORT_SITES_PER_RUN nettsteder per kjøring, så mange
 * nettsteder ikke får Workeren til å gå tom for tid. En rad i monthly_reports lages før noe sendes, så samme
 * rapport aldri går ut to ganger, heller ikke når to kjøringer går samtidig.
 */

/** Nettsteder per kjøring. Hvert nettsted er noen få spørringer og én e-post per mottaker. */
export const MONTHLY_REPORT_SITES_PER_RUN = 25;
/** Rapportene sendes fra den 1. Står bakgrunnsjobben stille en stund, tar den igjen det som mangler til og med denne dagen. */
export const MONTHLY_REPORT_LAST_DAY = 3;

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

export type ReportMonth = { key: string; from: string; to: string; label: string; previous: { key: string; from: string; to: string; label: string } };

function monthOf(year: number, month: number) {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const from = `${key}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { key, from, to: addDays(next, -1), label: MONTHS[month - 1] };
}

/** Måneden rapporten gjelder: forrige kalendermåned i norsk tid, og måneden før den til sammenligning. */
export function reportMonth(now: Date): ReportMonth {
  const [y, m] = osloDate(now).split("-").map(Number);
  const [ry, rm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  const [py, pm] = rm === 1 ? [ry - 1, 12] : [ry, rm - 1];
  return { ...monthOf(ry, rm), previous: monthOf(py, pm) };
}

export type MonthlyReport = {
  siteName: string;
  shop: boolean;
  month: string;
  previousMonth: string;
  visitors: number;
  previousVisitors: number;
  views: number;
  previousViews: number;
  pages: Ranked[];
  sources: Ranked[];
  inquiries: number;
  orders: number | null;
  salesOre: number | null;
  fixNow: string[];
  statsUrl: string;
  settingsUrl: string;
};

async function visitTotals(db: Db, siteId: string, from: string, to: string) {
  const [row] = await db
    .select({ views: sql<number>`coalesce(sum(${visitDays.views}), 0)::int`, visitors: sql<number>`coalesce(sum(${visitDays.visitors}), 0)::int` })
    .from(visitDays)
    .where(and(eq(visitDays.siteId, siteId), gte(visitDays.day, from), lte(visitDays.day, to)));
  return { views: Number(row.views), visitors: Number(row.visitors) };
}

/** Opptil to ting fra SEO-sjekken på de publiserte sidene, i samme rekkefølge som sidene står i menyen. */
export async function fixNowItems(db: Db, siteId: string, siteName: string, max = 2): Promise<string[]> {
  const rows = await db
    .select({ title: pages.title, content: pageVersions.content })
    .from(pages)
    .innerJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
    .where(eq(pages.siteId, siteId))
    .orderBy(asc(pages.sortOrder), asc(pages.path));
  const items: string[] = [];
  for (const row of rows) {
    const parsed = pageContentSchema.safeParse(row.content);
    if (!parsed.success) continue;
    for (const hint of seoHints({ pageTitle: row.title, siteName, content: parsed.data })) {
      items.push(`Siden «${row.title}»: ${hint}`);
      if (items.length >= max) return items;
    }
  }
  return items;
}

export async function buildMonthlyReport(db: Db, site: { id: string; name: string; kind: string }, month: ReportMonth): Promise<MonthlyReport> {
  const start = parseOsloDate(month.from)!;
  const end = parseOsloDate(addDays(month.to, 1))!;

  const [current, previous, pageRows, sourceRows, [{ n: inquiryCount }], fixNow] = await Promise.all([
    visitTotals(db, site.id, month.from, month.to),
    visitTotals(db, site.id, month.previous.from, month.previous.to),
    db
      .select({ path: visitPages.path, count: sql<number>`cast(sum(${visitPages.views}) as int)` })
      .from(visitPages)
      .where(and(eq(visitPages.siteId, site.id), gte(visitPages.day, month.from), lte(visitPages.day, month.to)))
      .groupBy(visitPages.path)
      .orderBy(desc(sql`sum(${visitPages.views})`), visitPages.path)
      .limit(3),
    db
      .select({ source: visitSources.source, count: sql<number>`cast(sum(${visitSources.visits}) as int)` })
      .from(visitSources)
      .where(and(eq(visitSources.siteId, site.id), gte(visitSources.day, month.from), lte(visitSources.day, month.to)))
      .groupBy(visitSources.source),
    db
      .select({ n: count() })
      .from(inquiries)
      .where(and(eq(inquiries.siteId, site.id), gte(inquiries.createdAt, start), lt(inquiries.createdAt, end))),
    fixNowItems(db, site.id, site.name),
  ]);

  const shop = site.kind === "nettbutikk";
  // Samme tall som under Rapporter, så kunden ikke ser to forskjellige omsetninger for samme måned.
  const sales = shop ? await periodReport(db, site.id, month.from, month.to) : null;
  const base = `${platformUrl()}/studio/nettsted/${site.id}`;

  return {
    siteName: site.name,
    shop,
    month: month.label,
    previousMonth: month.previous.label,
    visitors: current.visitors,
    previousVisitors: previous.visitors,
    views: current.views,
    previousViews: previous.views,
    pages: pageRows.map((r) => ({ label: r.path, count: Number(r.count) })),
    sources: mergeSources(sourceRows.map((r) => ({ source: r.source, count: Number(r.count) })), 3),
    inquiries: Number(inquiryCount),
    orders: sales ? sales.orders : null,
    salesOre: sales ? sales.totalOre : null,
    fixNow,
    statsUrl: `${base}/statistikk`,
    settingsUrl: `${base}/innstillinger/varsler`,
  };
}

/** «opp 12 % fra september», «ned 5 % fra september», «som i september». Tom når forrige måned var null. */
export function changeText(current: number, previous: number, previousMonth: string): string {
  if (previous === 0) return "";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `som i ${previousMonth}`;
  return `${pct > 0 ? "opp" : "ned"} ${Math.abs(pct)} % fra ${previousMonth}`;
}

const numberFormat = new Intl.NumberFormat("nb-NO");
const fmt = (n: number) => numberFormat.format(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** E-posten fra Nettgata til kunden. Kort og med vanlige ord. role styrer bare forklaringen nederst. */
export function monthlyReportEmail(r: MonthlyReport, role: Recipient["role"]): Rendered {
  const { esc, button, paragraph, layout, platformFooter } = emailParts;
  const subject = `Slik gikk ${r.month} for ${r.siteName}`;
  const visitorsChange = changeText(r.visitors, r.previousVisitors, r.previousMonth);
  const viewsChange = changeText(r.views, r.previousViews, r.previousMonth);

  const figures: [string, string][] = [
    ["Besøkende", `${fmt(r.visitors)}${visitorsChange ? `, ${visitorsChange}` : ""}`],
    ["Sidevisninger", `${fmt(r.views)}${viewsChange ? `, ${viewsChange}` : ""}`],
    ["Henvendelser fra skjemaet", fmt(r.inquiries)],
    ...(r.shop && r.orders !== null && r.salesOre !== null
      ? ([
          ["Ordre", fmt(r.orders)],
          ["Omsetning inkl. mva", formatNok(r.salesOre)],
        ] as [string, string][])
      : []),
  ];
  const row = (left: string, right: string) =>
    `<tr><td style="padding:8px 12px 8px 0;font-size:15px;border-bottom:1px solid #eeeeee;">${esc(left)}</td><td style="padding:8px 0;font-size:15px;text-align:right;border-bottom:1px solid #eeeeee;"><strong>${esc(right)}</strong></td></tr>`;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${figures.map(([a, b]) => row(a, b)).join("")}</table>`;
  const list = (items: string[]) =>
    `<ol style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.6;">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
  const heading = (text: string) => `<h2 style="margin:22px 0 8px;font-size:17px;">${esc(text)}</h2>`;

  const pagesText = r.pages.map((p) => `${p.label} (${fmt(p.count)} visninger)`);
  const sourcesText = r.sources.map((s) => `${s.label} (${fmt(s.count)} besøk)`);
  const noVisits = r.views === 0;
  const footer =
    role === "owner"
      ? `Du får denne e-posten fordi du er eier av ${r.siteName}. Vil du ikke ha den, slår du den av under Innstillinger, Rapporter på e-post.`
      : `Du får denne e-posten fordi du har slått på månedsrapporten for ${r.siteName} under Innstillinger. Der kan du slå den av igjen.`;

  const body = [
    paragraph(esc(`Her er tallene for ${r.siteName} i ${r.month}.`)),
    table,
    noVisits ? paragraph(esc("Ingen besøk ble telt denne måneden. Er nettstedet nytt, kommer tallene når folk finner det.")) : "",
    pagesText.length ? heading("Mest leste sider") + list(pagesText) : "",
    sourcesText.length ? heading("Hvor besøkende kom fra") + list(sourcesText) : "",
    r.fixNow.length
      ? heading("Fiks nå") +
        paragraph(esc(r.fixNow.length === 1 ? "Dette kan gjøre nettstedet bedre i Google:" : "To ting som kan gjøre nettstedet bedre i Google:")) +
        `<ul style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.6;">${r.fixNow.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
      : "",
    button(r.statsUrl, "Se hele statistikken"),
    paragraph(esc("Statistikken teller uten informasjonskapsler. Den viser hvor mange som var innom, ikke hvem."), "font-size:14px;color:#555555;"),
  ].join("");

  const text = [
    `Her er tallene for ${r.siteName} i ${r.month}.`,
    "",
    ...figures.map(([a, b]) => `${a}: ${b}`),
    ...(noVisits ? ["", "Ingen besøk ble telt denne måneden. Er nettstedet nytt, kommer tallene når folk finner det."] : []),
    ...(pagesText.length ? ["", "Mest leste sider:", ...pagesText.map((p, i) => `${i + 1}. ${p}`)] : []),
    ...(sourcesText.length ? ["", "Hvor besøkende kom fra:", ...sourcesText.map((s, i) => `${i + 1}. ${s}`)] : []),
    ...(r.fixNow.length ? ["", "Fiks nå:", ...r.fixNow.map((f) => `* ${f}`)] : []),
    "",
    `Hele statistikken: ${r.statsUrl}`,
    "",
    footer,
  ].join("\n");

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: `${fmt(r.visitors)} besøkende og ${fmt(r.inquiries)} henvendelser i ${r.month}`,
      brand: "Nettgata",
      heading: `${capitalize(r.month)} på ${r.siteName}`,
      body,
      footer: platformFooter(footer),
    }),
  };
}

export type MonthlyRunResult = { month: string; sites: number; emails: number; skipped?: string };

/**
 * Sender neste porsjon månedsrapporter. Kalles hvert tiende minutt, men gjør bare noe de første dagene i måneden.
 * Bare nettsteder med minst én publisert side, laget før måneden rapporten gjelder var over.
 */
export async function sendMonthlyReports(
  db: Db,
  provider: EmailProvider,
  { now = new Date(), limit = MONTHLY_REPORT_SITES_PER_RUN }: { now?: Date; limit?: number } = {},
): Promise<MonthlyRunResult> {
  const month = reportMonth(now);
  const day = Number(osloDate(now).slice(8, 10));
  if (day > MONTHLY_REPORT_LAST_DAY) return { month: month.key, sites: 0, emails: 0, skipped: "Ikke tid for månedsrapport" };
  const monthEnd = parseOsloDate(addDays(month.to, 1))!;

  const candidates = await db
    .select({ id: sites.id, name: sites.name, kind: sites.kind })
    .from(sites)
    .where(
      and(
        lt(sites.createdAt, monthEnd),
        sql`exists (select 1 from ${pages} where ${pages.siteId} = ${sites.id} and ${pages.publishedVersionId} is not null)`,
        sql`not exists (select 1 from ${monthlyReports} where ${monthlyReports.siteId} = ${sites.id} and ${monthlyReports.month} = ${month.key})`,
      ),
    )
    .orderBy(asc(sites.createdAt))
    .limit(limit);

  let done = 0;
  let emails = 0;
  for (const site of candidates) {
    // Raden er låsen: bare den kjøringen som får lagt den inn, sender.
    const [claimed] = await db
      .insert(monthlyReports)
      .values({ siteId: site.id, month: month.key, claimedAt: now })
      .onConflictDoNothing()
      .returning({ siteId: monthlyReports.siteId });
    if (!claimed) continue;
    const mine = and(eq(monthlyReports.siteId, site.id), eq(monthlyReports.month, month.key));

    let recipients: Recipient[];
    let report: MonthlyReport;
    try {
      recipients = await reportRecipients(db, site.id, "monthlyReport");
      report = await buildMonthlyReport(db, site, month);
    } catch (err) {
      // Ingenting er sendt ennå, så låsen kan slippes og rapporten prøves igjen neste kjøring.
      console.error("Månedsrapporten kunne ikke lages", site.id, err);
      await db.delete(monthlyReports).where(mine);
      continue;
    }
    if (!recipients.length) {
      await db.update(monthlyReports).set({ status: "ingen", sentAt: now }).where(mine);
      done++;
      continue;
    }
    for (const r of recipients) {
      const email = monthlyReportEmail(report, r.role);
      await deliver(
        db,
        provider,
        { siteId: site.id, kind: "manedsrapport" },
        { ...email, to: { email: r.email, ...(r.name && { name: r.name }) }, fromName: "Nettgata", tags: ["manedsrapport"] },
      );
      emails++;
    }
    await db.update(monthlyReports).set({ status: "sendt", recipients: recipients.length, sentAt: now }).where(mine);
    done++;
  }
  return { month: month.key, sites: done, emails };
}
