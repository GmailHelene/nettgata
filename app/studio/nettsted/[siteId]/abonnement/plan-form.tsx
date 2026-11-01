"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { ADDON, ADDON_AVAILABLE, PLANS, VAT_PERCENT, quote, type BillingInterval, type Plan } from "@/lib/billing/plans";
import { formatNok } from "@/lib/shop/money";
import { startCheckoutAction } from "./actions";

const card = "flex cursor-pointer items-start gap-3 rounded-md border border-neutral-300 p-4 has-checked:border-[#173b6c] has-checked:bg-neutral-50";

/**
 * Valg av betaling, tillegg og oppstart. Planen følger nettstedets type. Prisene og summen regnes ut her
 * bare for visning. Det kunden trekkes, avgjøres av prisene i Stripe, som sjekkes på serveren.
 */
export function PlanForm({
  siteId,
  plan,
  blockedReason,
}: {
  siteId: string;
  plan: Plan;
  /** Hvorfor kunden ikke kan bestille her og nå, for eksempel at kortbetaling ikke er slått på. null når alt er klart. */
  blockedReason: string | null;
}) {
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [addon, setAddon] = useState(false);
  const [setup, setSetup] = useState(false);
  const [state, action, pending] = useActionState(startCheckoutAction.bind(null, siteId), null);
  const p = PLANS[plan];
  const q = quote(plan, { interval, addon, setup });

  return (
    <form action={action} aria-labelledby="velg" className="space-y-6 rounded-lg border bg-white p-5">
      <div>
        <h2 id="velg" className="text-lg font-semibold">
          Velg abonnement: {p.label}
        </h2>
        <p className="mt-1 text-sm text-neutral-700">
          Abonnementet følger typen nettsted. Alle priser er uten mva, og {VAT_PERCENT} % mva kommer i tillegg.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 font-medium">Betaling</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={card}>
            <input type="radio" name="interval" value="month" checked={interval === "month"} onChange={() => setBillingInterval("month")} className="mt-1" />
            <span>
              <span className="block font-semibold">Månedlig</span>
              <span className="block">{formatNok(p.monthOre)} per måned</span>
            </span>
          </label>
          <label className={card}>
            <input type="radio" name="interval" value="year" checked={interval === "year"} onChange={() => setBillingInterval("year")} className="mt-1" />
            <span>
              <span className="block font-semibold">Årlig</span>
              <span className="block">{formatNok(p.yearOre / 12)} per måned</span>
              <span className="block text-sm text-neutral-600">{formatNok(p.yearOre)} betales for ett år om gangen</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Tillegg</legend>
        {ADDON_AVAILABLE && (
        <label className="flex items-start gap-3">
          <input type="checkbox" name="addon" checked={addon} onChange={() => setAddon(!addon)} className="mt-1" />
          <span>
            <span className="block font-semibold">
              {ADDON.label}, {formatNok(ADDON.monthOre)} per måned
            </span>
            <span className="block text-sm text-neutral-600">
              {ADDON.includes}
              {interval === "year" && ` Med årlig betaling blir det ${formatNok(ADDON.yearOre)} for året.`}
            </span>
          </span>
        </label>
        )}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="setup" checked={setup} onChange={() => setSetup(!setup)} className="mt-1" />
          <span>
            <span className="block font-semibold">«Jeg setter den opp for deg», {formatNok(p.setupOre)}</span>
            <span className="block text-sm text-neutral-600">Betales én gang, sammen med første betaling. {p.setupIncludes}</span>
          </span>
        </label>
      </fieldset>

      <section aria-labelledby="oppsummering" className="rounded-md bg-neutral-50 p-4">
        <h3 id="oppsummering" className="font-semibold">
          Første betaling
        </h3>
        <dl className="mt-2 space-y-1 text-sm">
          {q.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-4">
              <dt>{line.label}</dt>
              <dd className="tabular-nums">{formatNok(line.amountOre)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt>Mva {VAT_PERCENT} %</dt>
            <dd className="tabular-nums">{formatNok(q.vatOre)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-neutral-300 pt-2 font-semibold">
            <dt>Totalt</dt>
            <dd className="tabular-nums">{formatNok(q.totalOre)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-neutral-700" aria-live="polite">
          Deretter {formatNok(q.recurringOre)} pluss mva {interval === "month" ? "hver måned" : "hvert år"}.
        </p>
      </section>

      {blockedReason ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">{blockedReason}</p>
      ) : (
        <div>
          <label className="mb-4 flex items-start gap-3">
            <input type="checkbox" name="terms" required className="mt-1" />
            <span className="text-sm">
              Jeg har lest og godtar{" "}
              <a href="/vilkar" target="_blank" rel="noopener" className="underline">
                vilkårene<span className="sr-only"> (åpnes i ny fane)</span>
              </a>{" "}
              og{" "}
              <a href="/databehandleravtale" target="_blank" rel="noopener" className="underline">
                databehandleravtalen<span className="sr-only"> (åpnes i ny fane)</span>
              </a>{" "}
              på vegne av bedriften.
            </span>
          </label>
          <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-2 font-semibold text-white disabled:opacity-60">
            {pending ? "Åpner betalingen..." : "Gå til betaling"}
          </button>
          <p className="mt-2 text-sm text-neutral-600">
            Du betaler med kort hos Stripe. Du kan si opp når du vil, og abonnementet gjelder ut perioden du har betalt for.
          </p>
        </div>
      )}
      <FormStatus state={state} />
    </form>
  );
}
