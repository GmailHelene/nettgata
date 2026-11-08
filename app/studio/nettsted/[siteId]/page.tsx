import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, inquiries, orders, pages, products } from "@/db/schema";
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
import { hasCheckoutTerms } from "@/lib/legal/kundesider";
import { juridiskeMangler } from "@/lib/legal/felles";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "./site-nav";

export const metadata: Metadata = { title: "Hjem" };

type Task = { text: string; href: string; tone?: "warning" };
type Step = { label: string; detail: string; href: string; done: boolean; optional?: boolean };

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

/**
 * «Kom i gang»: det som må være på plass før nettstedet kan åpne, med fremdrift. Erstatter de mange like varslene
 * som sto i «Dette bør du se på» (gjennomgangen av studioet, november 2026). Forsvinner når alt er ferdig.
 */
function GettingStarted({ steps }: { steps: Step[] }) {
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  if (steps.every((s) => s.done)) return null;
  return (
    <section aria-labelledby="kom-i-gang" className="mb-6 rounded-lg border bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="kom-i-gang" className="font-semibold">
          Kom i gang
        </h2>
        <p className="text-sm text-neutral-700">
          {done} av {required.length} ferdig
        </p>
      </div>
      <div aria-hidden="true" className="mb-4 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full rounded-full bg-[#2f5a47]" style={{ width: `${Math.round((done / required.length) * 100)}%` }} />
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.label}>
            {step.done ? (
              <p className="flex items-center gap-3 rounded-md px-3 py-2 text-neutral-600">
                <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2f5a47] text-sm text-white">
                  ✓
                </span>
                <span>
                  {step.label}
                  <span className="sr-only"> (ferdig)</span>
                </span>
              </p>
            ) : (
              <Link href={step.href} className="group flex items-center gap-3 rounded-md bg-neutral-50 px-3 py-2 hover:bg-neutral-100">
                <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border-2 border-neutral-500" />
                <span className="mr-auto">
                  <span className="block font-medium group-hover:underline">
                    {step.label}
                    {step.optional && <span className="font-normal text-neutral-600"> (valgfritt)</span>}
                  </span>
                  <span className="block text-sm text-neutral-700">{step.detail}</span>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Er nettstedet ute på nett, og hvor? Står øverst, så eieren aldri må gjette. */
function LiveStatus({ live, reason, url, label, preview }: { live: boolean; reason: string; url: string; label: string; preview: string }) {
  return (
    <section
      aria-label="Status for nettstedet"
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${live ? "border-[#2f5a47]/40 bg-[#eef6f1]" : "border-amber-300 bg-amber-50"}`}
    >
      <p>
        <strong className="font-semibold">{live ? "✓ Ute på nett" : "Ikke ute på nett ennå"}</strong>
        <span className="block text-sm text-neutral-800">{live ? label : reason}</span>
      </p>
      <a href={live ? url : preview} target="_blank" rel="noreferrer" className="rounded-md border border-[#173b6c] bg-white px-4 py-2 text-sm font-semibold">
        {live ? "Se nettstedet" : "Forhåndsvis"}
        <span className="sr-only"> (åpnes i ny fane)</span>
      </a>
    </section>
  );
}

function LowStockCard({ base, low, lowStockAt }: { base: string; low: Awaited<ReturnType<typeof lowStock>>; lowStockAt: number }) {
  return (
    <Card
      title="Lite på lager"
      action={
        <Link href={`${base}/varer/pris-og-lager`} className="text-sm underline">
          Oppdater lager
        </Link>
      }
    >
      {low.length === 0 ? (
        <p className="text-sm text-neutral-600">Ingen varer har {lowStockAt} eller færre igjen.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {low.map((v) => (
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
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSiteAccess(siteId);
  const db = await getDb();
  const base = `/studio/nettsted/${site.id}`;
  const isShop = site.kind === "nettbutikk";

  const [[{ unread }], [{ unpublished }], latestInquiries, domainRows, [{ productCount }], [home]] = await Promise.all([
    db.select({ unread: count() }).from(inquiries).where(and(eq(inquiries.siteId, site.id), isNull(inquiries.readAt))),
    db.select({ unpublished: count() }).from(pages).where(and(eq(pages.siteId, site.id), isNull(pages.publishedVersionId))),
    db.select().from(inquiries).where(eq(inquiries.siteId, site.id)).orderBy(desc(inquiries.createdAt)).limit(3),
    db.select().from(domains).where(eq(domains.siteId, site.id)),
    isShop ? db.select({ productCount: count() }).from(products).where(eq(products.siteId, site.id)) : Promise.resolve([{ productCount: 0 }]),
    db
      .select({ published: pages.publishedVersionId })
      .from(pages)
      .where(and(eq(pages.siteId, site.id), eq(pages.path, "/")))
      .limit(1),
  ]);

  const tasks: Task[] = [];
  let shop: {
    sales: Awaited<ReturnType<typeof salesOverview>>;
    top: Awaited<ReturnType<typeof topProducts>>;
    low: Awaited<ReturnType<typeof lowStock>>;
    recent: (typeof orders.$inferSelect)[];
    lowStockAt: number;
  } | null = null;

  // Opplysningene loven krever på nettstedet (ehandelsloven § 8, angrerettloven § 8). Står i «Kom i gang», ikke som fire like varsler.
  const info = readSiteInfo(site.info);
  const mangler = juridiskeMangler({ navn: site.name, info }, { nettbutikk: isShop });
  const missingFields = [
    !info.orgnr && "org.nr.",
    (!info.street || !info.postalCode || !info.city) && "adresse",
    !info.email && "e-post",
    isShop && !info.phone && "telefon",
  ].filter((f): f is string => Boolean(f));
  let termsReady = true;
  let paymentReady = true;
  let bringReady = true;
  if (isShop) {
    const settings = readShopSettings(site.shop);
    const [sales, top, low, counts, recent, terms] = await Promise.all([
      salesOverview(db, site.id),
      topProducts(db, site.id),
      lowStock(db, site.id, settings.lowStockAt),
      orderCounts(db, site.id),
      db.select().from(orders).where(eq(orders.siteId, site.id)).orderBy(desc(orders.createdAt)).limit(5),
      hasCheckoutTerms(site, settings.termsPath, (p) => getPublishedPage(db, site.id, p)),
    ]);
    shop = { sales, top, low, recent, lowStockAt: settings.lowStockAt };
    termsReady = terms;
    // Klar til åpning: uten e-post får kundene ingen ordrebekreftelse, og angreskjemaet skal komme på e-post.
    if (getEmailProvider().name === "logg") {
      tasks.push({ text: "E-post er ikke slått på ennå, så kundene får ingen ordrebekreftelse. Ikke åpne butikken før dette er på plass", href: `${base}/innstillinger/varsler`, tone: "warning" });
    }
    // Fiken trakk tilbake tilgangen (fornyelsen feilet), eller eieren har ikke valgt selskap ennå.
    const fiken = fikenView(site.shop);
    if (fiken?.needsReconnect) tasks.push({ text: "Fiken er koblet fra. Koble til Fiken på nytt for å sende ordre dit", href: `${base}/innstillinger/regnskap#fiken-tittel`, tone: "warning" });
    else if (fiken && !fiken.companySlug) tasks.push({ text: "Velg hvilket selskap i Fiken ordrene skal til", href: `${base}/innstillinger/regnskap#fiken-tittel` });
    bringReady = Boolean(settings.bringShipping);
    paymentReady = availablePaymentMethods(settings).some((m) => m === "vipps" || m === "klarna" || m === "kustom");
    if (counts.paid) tasks.push({ text: `${counts.paid} ${counts.paid === 1 ? "ordre er betalt og klar" : "ordre er betalt og klare"} til sending`, href: `${base}/ordre?status=klar` });
    if (counts.pending_payment) tasks.push({ text: `${counts.pending_payment} ordre venter på betaling`, href: `${base}/ordre?status=venter` });
    if (low.length) tasks.push({ text: `${low.length}${low.length === 8 ? "+" : ""} varianter har ${settings.lowStockAt} eller færre igjen`, href: `${base}/varer?lager=lite` });
  }
  for (const d of domainRows.filter((r) => r.failingSince)) {
    tasks.push({ text: `${displayHost(d.hostname)} peker ikke hit lenger. Sjekk DNS hos domeneforhandleren`, href: `${base}/domene`, tone: "warning" });
  }
  if (unread) tasks.push({ text: `${unread} ${unread === 1 ? "ny henvendelse" : "nye henvendelser"}`, href: `${base}/henvendelser` });

  const subscribed = hasActiveSubscription(site.billing);
  const primary = domainRows.find((d) => d.isPrimary && d.status === "active");
  const pendingRoot = [...new Set(domainRows.filter((r) => r.status === "pending" && r.kind !== "apex").map(rootOf))][0];
  const steps: Step[] = [
    {
      label: "Fyll ut firma og kontakt",
      detail: missingFields.length ? `Mangler ${missingFields.join(", ")}. Loven krever det på nettstedet.` : "Navn, adresse og kontaktinfo",
      href: `${base}/innstillinger`,
      done: mangler.length === 0,
    },
    ...(isShop
      ? [
          { label: "Legg inn den første varen", detail: "Navn, bilde, pris og antall på lager", href: `${base}/varer/ny`, done: productCount > 0 },
          { label: "Koble til betaling", detail: "Kustom eller Vipps, med butikkens egen avtale", href: `${base}/betaling`, done: paymentReady },
          {
            label: "Koble til Bring",
            detail: "Uten Bring betaler kunden fast posttakst, og du lager fraktetikettene selv. Med Bring får kunden riktig pris og hentested.",
            href: `${base}/innstillinger/frakt`,
            done: bringReady,
            optional: true,
          },
          {
            label: "Få kjøpsvilkårene på plass",
            detail: mangler.length ? "Lages av seg selv når firma og kontakt er fylt ut. Kassen er stengt til da." : "Siden med kjøpsvilkår er ikke publisert",
            href: mangler.length ? `${base}/innstillinger` : `${base}/innstillinger/butikk`,
            done: termsReady,
          },
        ]
      : []),
    {
      label: "Publiser sidene",
      detail: `${unpublished} ${unpublished === 1 ? "side er" : "sider er"} ikke publisert ennå`,
      href: `${base}/sider`,
      done: unpublished === 0,
    },
    { label: "Velg abonnement", detail: "Gratis å bygge. Abonnement for å åpne og bruke eget domene.", href: `${base}/abonnement`, done: subscribed },
    {
      label: "Koble til eget domene",
      detail: pendingRoot ? `${displayHost(pendingRoot)} venter på DNS-pekerne` : "For eksempel dinbedrift.no",
      href: `${base}/domene`,
      done: Boolean(primary),
      optional: true,
    },
  ];

  // Ute på nett: forsiden er publisert, og nettstedet har abonnement hvis kunden har laget det selv.
  const live = Boolean(home?.published) && (!site.selfServe || subscribed);
  const root = process.env.SITES_ROOT_DOMAIN;
  const liveHost = primary ? primary.hostname : root ? `${site.slug}.${root}` : null;
  const liveUrl = liveHost ? `${process.env.NODE_ENV === "production" ? "https" : "http"}://${liveHost}` : `/vis/${site.slug}`;
  const notLiveReason = !home?.published ? "Forsiden er ikke publisert." : "Velg abonnement for å åpne nettstedet.";
  const anySales = shop ? shop.recent.length > 0 : false;

  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={isShop} active="oversikt" />
      <LiveStatus live={live} reason={notLiveReason} url={liveUrl} label={liveHost ? displayHost(liveHost) : "Se nettstedet"} preview={`/vis/${site.slug}`} />
      <GettingStarted steps={steps} />

      <section aria-labelledby="gjoremal" className="mb-6 rounded-lg border bg-white p-5">
        <h2 id="gjoremal" className="mb-3 font-semibold">
          Dette bør du se på
        </h2>
        {tasks.length === 0 ? (
          <p className="text-neutral-700">Alt er i orden. {isShop ? "Ingen ordre venter og ingen meldinger er ulest." : "Ingen meldinger er ulest."}</p>
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

      {/* Salgstallene vises først når butikken har hatt en ordre. Til da er de bare nuller (gjennomgangen, november 2026). */}
      {shop && !anySales && shop.low.length > 0 && (
        <div className="mb-6">
          <LowStockCard base={base} low={shop.low} lowStockAt={shop.lowStockAt} />
        </div>
      )}

      {shop && anySales && (
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
            <LowStockCard base={base} low={shop.low} lowStockAt={shop.lowStockAt} />
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
