"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { ADDON } from "@/lib/billing/plans";
import { formatNok } from "@/lib/shop/money";
import { toggleAddonAction } from "./actions";

/** Legge til eller fjerne AI-teamet på et abonnement som allerede løper. */
export function AddonToggle({ siteId, active, yearly }: { siteId: string; active: boolean; yearly: boolean }) {
  const [state, action, pending] = useActionState(toggleAddonAction.bind(null, siteId, !active), null);
  const price = yearly ? `${formatNok(ADDON.yearOre)} pluss mva per år` : `${formatNok(ADDON.monthOre)} pluss mva per måned`;
  return (
    <form action={action} aria-labelledby="tillegg-ai" className="mt-6 space-y-2 border-t border-neutral-200 pt-4">
      <h3 id="tillegg-ai" className="font-semibold">
        {ADDON.label}
      </h3>
      <p className="text-sm text-neutral-700">
        {active
          ? "Tillegget er med i abonnementet. Fjerner du det, får du tilbake det du har betalt for resten av perioden på neste faktura."
          : `${ADDON.includes} Koster ${price}. Du betaler bare for resten av perioden nå, og det kommer på neste faktura.`}
      </p>
      <button disabled={pending} className="rounded-md border border-[#173b6c] px-4 py-2 font-semibold disabled:opacity-60">
        {pending ? "Oppdaterer..." : active ? "Fjern AI-teamet" : `Legg til AI-teamet, ${price}`}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
