import Link from "next/link";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, inquiries, orders, pages } from "@/db/schema";
import { displayHost, rootOf } from "@/lib/domains";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { getPublishedPage } from "@/lib/publishing";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { change, lowStock, orderCounts, salesOverview, topProducts, type Period } from "@/lib/shop/reports";
import { availablePaymentMethods, readShopSettings } from "@/lib/shop/settings";
import { fikenView } from "@/lib/fiken/state";
import { getEmailProvider } from "@/lib/email/send";
import { hasActiveSubscription } from "@/lib/billing/state";
import { orderStatusLabel } from "./ordre/order-status";
import { SalesChart } from "./sales-chart";
import { SiteLinks } from "./site-links";
import { SiteNav } from "./site-nav";

type Task = { text: string; href: string; tone?: "warning" };

/** Hele kroner holder i oversikten. Ørene står på hver ordre. */
const kroner = (ore: number) => formatNok(Math.round(ore / 100) * 100);

function Tile({ label, period, delta }: { label: string; period: Period; delta?: number | null }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm text-neutral-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{kroner(period.ore)}</p>
      <p className="text-sm text-neutral-600">
        {period.orders} ordre{period.orders > 0 && ` · snitt ${kroner(Math.round(period.ore / period.orders))}`}
      </p>
      {delta !== undefined && (
        <p className={`mt-1 text-sm ${delta === null ? "text-neutral-600" : delta >= 0 ? "text-green-800" : "text-red-800"}`}>
          {delta === null ? "Ingen salg i de 30 dagene før" : `${delta >= 0 ? "▲ +" : "▼ "}${delta} % mot de 30 dagene før`}
        </p>
      )}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const base = `/studio/nettsted/${site.id}`;
  const isShop = site.kind === "nettbutikk";

  const [[{ unread }], [{ unpublished }], latestInquiries, domainRows] = await Promise.all([
    db.select({ unread: count() }).from(inquiries).where(and(eq(inquiries.siteId, site.id), isNull(inquiries.readAt))),
    db.select({ unpublished: count() }).from(pages).where(and(eq(pages.siteId, site.id), isNull(pages.publishedVersionId))),
    db.select().from(inquiries).where(eq(inquiries.siteId, site.id)).orderBy(desc(inquiries.createdAt)).limit(3),
    db.select().from(domains).where(eq(domains.siteId, site.id)),
  ]);

  const tasks: Task[] = [];
  let shop: {
    sales: Awaited<ReturnType<typeof salesOverview>>;
    top: Awaited<ReturnType<typeof topProducts>>;
    low: Awaited<ReturnType<typeof lowStock>>;
    recent: (typeof orders.$inferSelect)[];
    lowStockAt: number;
  } | null = null;

  if (isShop) {
    const settings = readShopSettings(site.shop);
    const [sales, top, low, counts, recent, terms] = await Promise.all([
      salesOverview(db, site.id),
      topProducts(db, site.id),
      lowStock(db, site.id, settings.lowStockAt),
      orderCounts(db, site.id),
      db.select().from(orders).where(eq(orders.siteId, site.id)).orderBy(desc(orders.createdAt)).limit(5),
      getPublishedPage(db, site.id, settings.termsPath),
    ]);
    shop = { sales, top, low, recent, lowStockAt: settings.lowStockAt };
    if (!terms) tasks.push({ text: "Kassen er stengt til kjøpsvilkårene er publisert", href: `${base}/sider`, tone: "warning" });
    // Klar til åpning: uten e-post får kundene ingen ordrebekreftelse, og angreskjemaet skal komme på e-post.
    if (getEmailProvider().name === "logg") {
      tasks.push({ text: "E-post er ikke slått på ennå, så kundene får ingen ordrebekreftelse. Ikke åpne butikken før dette er på plass", href: `${base}/innstillinger`, tone: "warning" });
    }
    // Fiken trakk tilbake tilgangen (fornyelsen feilet), eller eieren har ikke valgt selskap ennå.
    const fiken = fikenView(site.shop);
    if (fiken?.needsReconnect) tasks.push({ text: "Fiken er koblet fra. Koble til Fiken på nytt for å sende ordre dit", href: `${base}/betaling#fiken-tittel`, tone: "warning" });
    else if (fiken && !fiken.companySlug) tasks.push({ text: "Velg hvilket selskap i Fiken ordrene skal til", href: `${base}/betaling#fiken-tittel` });
    if (!availablePaymentMethods(settings).some((m) => m === "vipps" || m === "klarna" || m === "kustom")) {
      tasks.push({ text: "Vipps eller Klarna er ikke koblet til ennå", href: `${base}/betaling` });
    }
    if (counts.paid) tasks.push({ text: `${counts.paid} ${counts.paid === 1 ? "ordre er betalt og klar" : "ordre er betalt og klare"} til sending`, href: `${base}/ordre?status=klar` });
    if (counts.pending_payment) tasks.push({ text: `${counts.pending_payment} ordre venter på betaling`, href: `${base}/ordre?status=venter` });
    if (low.length) tasks.push({ text: `${low.length}${low.length === 8 ? "+" : ""} varianter har ${settings.lowStockAt} eller færre igjen`, href: `${base}/varer?lager=lite` });
  }
  for (const d of domainRows.filter((r) => r.failingSince)) {
    tasks.push({ text: `${displayHost(d.hostname)} peker ikke hit lenger. Sjekk DNS hos domeneforhandleren`, href: `${base}/domene`, tone: "warning" });
  }
  for (const root of new Set(domainRows.filter((r) => r.status === "pending" && r.kind !== "apex").map(rootOf))) {
    tasks.push({ text: `${displayHost(root)} venter på DNS-pekerne`, href: `${base}/domene` });
  }
  if (unread) tasks.push({ text: `${unread} ${unread === 1 ? "ny henvendelse" : "nye henvendelser"}`, href: `${base}/henvendelser` });
  if (unpublished) tasks.push({ text: `${unpublished} ${unpublished === 1 ? "side er" : "sider er"} ikke publisert`, href: `${base}/sider` });
  if (!hasActiveSubscription(site.billing)) tasks.push({ text: "Nettstedet har ikke abonnement ennå. Eget domene krever abonnement", href: `${base}/abonnement` });

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={isShop} active="oversikt" />
      <SiteLinks siteId={site.id} slug={site.slug} />

      <section aria-labelledby="gjoremal" className="mb-6 rounded-lg border bg-white p-5">
        <h2 id="gjoremal" className="mb-3 font-semibold">
          Dette bør du se på
        </h2>
        {tasks.length === 0 ? (
          <p className="text-neutral-700">Alt er i orden. Ingen ordre venter og ingen meldinger er ulest.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.text}>
                <Link
                  href={t.href}
                  className={`flex items-center justify-between gap-4 rounded-md px-3 py-2 hover:underline ${t.tone === "warning" ? "bg-amber-50 font-medium text-amber-950" : "bg-neutral-50"}`}
                >
                  <span>
                    {t.tone === "warning" && <span aria-hidden="true">⚠ </span>}
                    {t.text}
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {shop && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Tile label="I dag" period={shop.sales.today} />
            <Tile label="Siste 7 dager" period={shop.sales.week} />
            <Tile label="Siste 30 dager" period={shop.sales.month} delta={change(shop.sales.month.ore, shop.sales.previousMonth.ore)} />
          </div>

          <section className="mb-6 rounded-lg border bg-white p-5">
            <h2 className="font-semibold">Salg per dag, siste 30 dager</h2>
            <p className="mb-6 text-sm text-neutral-600">Inkludert MVA og frakt. Kansellerte og refunderte ordre er ikke med.</p>
            {shop.sales.month.orders === 0 ? (
              <p className="text-neutral-700">Ingen salg de siste 30 dagene ennå. Når de første ordrene kommer, vises de her.</p>
            ) : (
              <SalesChart daily={shop.sales.daily} />
            )}
          </section>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <Card title="Mest solgt, siste 30 dager">
              {shop.top.length === 0 ? (
                <p className="text-sm text-neutral-600">Ingen salg ennå.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {shop.top.map((p, i) => (
                    <li key={p.productId ?? p.name} className="flex items-baseline justify-between gap-3">
                      <span>
                        <span className="mr-2 text-neutral-500">{i + 1}.</span>
                        {p.productId ? (
                          <Link href={`${base}/varer/${p.productId}`} className="hover:underline">
                            {p.name}
                          </Link>
                        ) : (
                          p.name
                        )}
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-neutral-700">
                        {p.quantity} stk · {kroner(p.ore)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card
              title="Lite på lager"
              action={
                <Link href={`${base}/varer/pris-og-lager`} className="text-sm underline">
                  Oppdater lager
                </Link>
              }
            >
              {shop.low.length === 0 ? (
                <p className="text-sm text-neutral-600">Ingen varer har {shop.lowStockAt} eller færre igjen.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {shop.low.map((v) => (
                    <li key={v.variantId} className="flex items-baseline justify-between gap-3">
                      <Link href={`${base}/varer/${v.productId}`} className="hover:underline">
                        {v.name}
                        {v.optionValues.length > 0 && <span className="text-neutral-600"> · {v.optionValues.join(" / ")}</span>}
                      </Link>
                      <span className={`whitespace-nowrap tabular-nums ${v.stock === 0 ? "font-semibold text-red-800" : "text-neutral-700"}`}>
                        {v.stock === 0 ? "Utsolgt" : `${v.stock} igjen`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card
            title="Siste ordre"
            action={
              <Link href={`${base}/ordre`} className="text-sm underline">
                Alle ordre
              </Link>
            }
          >
            {shop.recent.length === 0 ? (
              <p className="text-sm text-neutral-600">Ingen ordre ennå.</p>
            ) : (
              <ul className="divide-y text-sm">
                {shop.recent.map((o) => (
                  <li key={o.id}>
                    <Link href={`${base}/ordre/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 hover:underline">
                      <span className="w-14 font-semibold">#{o.number}</span>
                      <span className="mr-auto">{o.customerName}</span>
                      <span className="text-neutral-600">{formatOsloDateTime(o.createdAt)}</span>
                      <span className="tabular-nums">{formatNok(o.totalOre)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${orderStatusLabel[o.status].className}`}>{orderStatusLabel[o.status].text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {!shop && (
        <Card
          title="Siste henvendelser"
          action={
            <Link href={`${base}/henvendelser`} className="text-sm underline">
              Alle henvendelser
            </Link>
          }
        >
          {latestInquiries.length === 0 ? (
            <p className="text-sm text-neutral-600">Ingen henvendelser ennå. Meldinger fra kontaktskjemaet havner her.</p>
          ) : (
            <ul className="divide-y text-sm">
              {latestInquiries.map((q) => (
                <li key={q.id} className="py-2">
                  <p className="flex justify-between gap-3">
                    <span className={q.readAt ? "" : "font-semibold"}>{q.name}</span>
                    <span className="text-neutral-600">{formatOsloDateTime(q.createdAt)}</span>
                  </p>
                  <p className="line-clamp-2 text-neutral-700">{q.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </main>
  );
}
