"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "@/app/studio/actions";
import { saveManualBillingAction } from "./actions";

/** Bare for plattformadmin: kunder som faktureres utenom Stripe, for eksempel piloter. */
export function ManualBilling({ siteId, manual, note }: { siteId: string; manual: boolean; note: string }) {
  const [on, setOn] = useState(manual);
  const [text, setText] = useState(note);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 space-y-3">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={on} onChange={() => setOn(!on)} className="mt-1" />
        <span>
          <span className="block font-medium">Fakturert utenom Stripe</span>
          <span className="block text-sm text-neutral-600">
            For kunder du fakturerer selv. Nettstedet regnes da som betalende og kan koble til eget domene. Kunden ser at abonnementet faktureres
            direkte, men ikke notatet.
          </span>
        </span>
      </label>
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium">Notat</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="For eksempel faktura 3012, betalt ut 2027"
          className="w-full rounded-md border border-neutral-400 px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await saveManualBillingAction(siteId, { manual: on, note: text })))}
        className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        Lagre
      </button>
      <FormStatus state={state} />
    </div>
  );
}
