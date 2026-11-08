"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "../../../../actions";
import { eraseCustomerAction } from "../../../../shop-actions";

/**
 * Personvern for én kunde: last ned alt (innsyn) og slett (sletting). Kunden har rett til begge etter GDPR,
 * og butikken skal svare innen en måned. Sletting spør først, med navnet i spørsmålet (WCAG 3.3.4).
 */
export function PrivacyPanel({ siteId, customerId, name, owner }: { siteId: string; customerId: string; name: string; owner: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <section aria-labelledby="personvern" className="mt-6 rounded-lg border bg-white p-5">
      <h3 id="personvern" className="mb-1 font-semibold">
        Personvern
      </h3>
      <p className="mb-4 text-sm text-neutral-700">
        Ber kunden om å få se eller slette opplysningene sine, gjør du det her. Du må svare innen en måned.
      </p>
      {owner ? (
        <div className="flex flex-wrap gap-3">
          <a href={`/studio/nettsted/${siteId}/kunder/${customerId}/innsyn`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
            Last ned alt om kunden
          </a>
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-red-800 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60"
            onClick={() => {
              if (
                !confirm(
                  `Slette ${name}? Kundekortet, henvendelser, nyhetsbrev og timebestillinger slettes. Ordre som regnskapet må ha i fem år, blir stående. Dette kan ikke angres.`,
                )
              )
                return;
              start(async () => {
                const result = await eraseCustomerAction(siteId, customerId);
                setState(result);
                if (result?.ok) setTimeout(() => router.push(`/studio/nettsted/${siteId}/kunder`), 4000);
              });
            }}
          >
            {pending ? "Sletter..." : "Slett kunden"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-neutral-700">Bare eieren av butikken kan laste ned eller slette opplysningene om en kunde.</p>
      )}
      <div className="mt-3" aria-live="polite">
        <FormStatus state={state} />
      </div>
      <p className="mt-3 text-xs text-neutral-600">
        Filen er maskinlesbar (JSON), som personvernforordningen krever. Send den til kunden på e-post, eller skriv ut det kunden trenger.
      </p>
    </section>
  );
}
