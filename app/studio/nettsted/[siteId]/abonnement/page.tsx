import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { NOT_READY } from "@/lib/billing/checkout";
import { ADDON, planForKind, quote } from "@/lib/billing/plans";
import {
  blocksNewCheckout,
  hasActiveSubscription,
  intervalLabel,
  planLabel,
  readBilling,
  summarizeBilling,
  type BillingTone,
} from "@/lib/billing/state";
import { getStripe, missingBillingConfig } from "@/lib/billing/stripe";
import { confirmCheckoutSession } from "@/lib/billing/sync";
import { formatOsloDateTime, formatOsloDay } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../site-nav";
import { ManualBilling } from "./manual-billing";
import { PlanForm } from "./plan-form";
import { PortalButton } from "./portal-button";

export const metadata: Metadata = { title: "Abonnement" };

const chip: Record<BillingTone, string> = {
  ok: "bg-green-100 text-green-900",
  warning: "bg-amber-100 text-amber-900",
  problem: "bg-red-100 text-red-900",
  neutral: "bg-neutral-100 text-neutral-800",
};

const day = (iso: string) => formatOsloDay(new Date(iso));

export default async function SubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const { site, user, role } = await requireSiteAccess(siteId);
  const stripe = getStripe();
  let billing = readBilling(site.billing);

  // Tilbake fra Stripe. Webhooken kan komme noen sekunder etter kunden, så økten sjekkes her også.
  let returnNote: { text: string; done: boolean } | null = null;
  if (query.betaling === "fullfort") {
    const sessionId = typeof query.okt === "string" ? query.okt : "";
    if (stripe && sessionId && !hasActiveSubscription(billing)) {
      try {
        const db = await getDb();
        await confirmCheckoutSession(db, stripe, site.id, sessionId);
        const [row] = await db.select({ billing: sites.billing }).from(sites).where(eq(sites.id, site.id)).limit(1);
        billing = readBilling(row?.billing);
      } catch (err) {
        console.error("Klarte ikke å sjekke betalingen hos Stripe", err);
      }
    }
    returnNote = hasActiveSubscription(billing)
      ? { text: "Takk! Betalingen er gjennomført, og abonnementet er aktivt.", done: true }
      : { text: "Takk! Stripe behandler fortsatt betalingen. Last siden på nytt om et minutt hvis abonnementet ikke vises her.", done: false };
  } else if (query.betaling === "avbrutt") {
    returnNote = { text: "Betalingen ble avbrutt, og ingenting er trukket.", done: false };
  }

  const summary = summarizeBilling(billing, day);
  const isOwner = role === "owner";
  const plan = billing.plan ?? planForKind(site.kind);
  const price =
    billing.stripeSubscriptionId && billing.interval
      ? `${formatNok(quote(plan, { interval: billing.interval, addon: billing.addon, setup: false }).recurringOre)} pluss mva ${billing.interval === "month" ? "per måned" : "per år"}`
      : null;
  const showPicker = !billing.manual && !blocksNewCheckout(billing);
  // Bare når det har vært et abonnement. En kunde som avbrøt første betaling, har ingen fakturaer å se.
  const showPortal = Boolean(stripe && billing.stripeCustomerId && billing.stripeSubscriptionId && !billing.manual && isOwner);
  const missing = missingBillingConfig();
  const dashboard = billing.stripeCustomerId
    ? `https://dashboard.stripe.com/${stripe?.mode === "test" ? "test/" : ""}customers/${billing.stripeCustomerId}`
    : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="abonnement" />

      {returnNote && (
        <p role="status" className={`mb-6 rounded-md p-3 text-sm ${returnNote.done ? "bg-green-50 text-green-900" : "bg-neutral-100 text-neutral-900"}`}>
          {returnNote.text}
        </p>
      )}

      <section aria-labelledby="status" className="mb-8 rounded-lg border bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="status" className="mr-auto text-lg font-semibold">
            Abonnement
          </h2>
          <span className={`rounded-full px-3 py-1 text-sm ${chip[summary.tone]}`}>{summary.label}</span>
        </div>
        {summary.text && <p className="mt-2 text-neutral-700">{summary.text}</p>}

        {billing.stripeSubscriptionId && !billing.manual && (
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-600">Abonnement</dt>
            <dd>
              {planLabel(billing.plan)}
              {billing.interval && `, ${intervalLabel(billing.interval)}`}
            </dd>
            <dt className="text-neutral-600">Tillegg</dt>
            <dd>{billing.addon ? ADDON.label : "Ingen"}</dd>
            {price && (
              <>
                <dt className="text-neutral-600">Pris</dt>
                <dd>{price}</dd>
              </>
            )}
            {billing.setupPaidAt && (
              <>
                <dt className="text-neutral-600">Oppstart</dt>
                <dd>Betalt {day(billing.setupPaidAt)}</dd>
              </>
            )}
          </dl>
        )}

        {showPortal && (
          <PortalButton siteId={site.id} label={hasActiveSubscription(billing) || billing.status === "unpaid" ? "Bytt kort, se fakturaer eller si opp" : "Se fakturaer"} />
        )}
        {!isOwner && (billing.stripeCustomerId || showPicker) && <p className="mt-4 text-sm text-neutral-600">Bare eieren av nettstedet kan endre abonnementet.</p>}
      </section>

      {showPicker && isOwner && <PlanForm siteId={site.id} plan={planForKind(site.kind)} blockedReason={stripe ? null : NOT_READY} />}

      {user.isPlatformAdmin && (
        <section aria-labelledby="admin-betaling" className="mt-10 rounded-lg border border-neutral-300 bg-white p-5">
          <h2 id="admin-betaling" className="text-lg font-semibold">
            For plattformadmin
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            <li>
              Stripe: {stripe ? (stripe.mode === "live" ? "live, ekte penger" : stripe.mode === "test" ? "testmodus" : "nøkkel av ukjent type") : "ikke satt opp"}
              {missing.length > 0 && `. Mangler ${missing.join(" og ")}, se docs/BETALING-PLATTFORM.md`}
            </li>
            {billing.syncedAt && <li>Sist oppdatert fra Stripe {formatOsloDateTime(new Date(billing.syncedAt))}</li>}
            {billing.status !== "none" && <li>Status hos Stripe: {billing.status}</li>}
            {dashboard && (
              <li>
                <a href={dashboard} target="_blank" rel="noreferrer" className="underline">
                  Åpne kunden i Stripe
                </a>
              </li>
            )}
          </ul>
          <ManualBilling siteId={site.id} manual={billing.manual} note={billing.manualNote} />
        </section>
      )}
    </main>
  );
}
