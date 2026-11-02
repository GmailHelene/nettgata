"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { carrierKeys, carriers, type CarrierKey } from "@/lib/shop/tracking";
import type { ActionState } from "../../../../actions";
import { retryCreditNoteAction, saveStaffNoteAction, saveTrackingAction } from "../../../../shop-actions";

const inputClass = "w-full rounded-md border border-neutral-400 px-3 py-2";

/** Sporing kan lagres alene, eller sammen med «sendt» når ordren er betalt, så det blir ett trykk i stedet for to. */
export function TrackingForm({
  siteId,
  orderId,
  status,
  carrier,
  number,
}: {
  siteId: string;
  orderId: string;
  status: string;
  carrier: string | null;
  number: string | null;
}) {
  const [selected, setSelected] = useState<CarrierKey>((carrier as CarrierKey) ?? "posten");
  const [value, setValue] = useState(number ?? "");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const save = (markFulfilled: boolean) =>
    startTransition(async () => setState(await saveTrackingAction(siteId, orderId, { carrier: selected, number: value }, markFulfilled)));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="block">
          <span className="mb-1 block text-sm">Transportør</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value as CarrierKey)} className={inputClass}>
            {carrierKeys.map((k) => (
              <option key={k} value={k}>
                {carriers[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Sporingsnummer</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" className={inputClass} />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {status === "paid" && (
          <button
            type="button"
            disabled={pending || !value.trim()}
            onClick={() => save(true)}
            className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Lagre og marker som sendt
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => save(false)}
          className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {value.trim() || !number ? "Lagre sporing" : "Fjern sporing"}
        </button>
      </div>
      <p className="text-xs text-neutral-600">Kunden ser sporingen og en lenke til transportøren på ordresiden sin.</p>
      <FormStatus state={state} />
    </div>
  );
}

export function StaffNoteForm({ siteId, orderId, note }: { siteId: string; orderId: string; note: string | null }) {
  const [value, setValue] = useState(note ?? "");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Internt notat</span>
        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={2000} className={inputClass} />
      </label>
      <button
        type="button"
        disabled={pending || value === (note ?? "")}
        onClick={() => startTransition(async () => setState(await saveStaffNoteAction(siteId, orderId, value)))}
        className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        Lagre notat
      </button>
      <FormStatus state={state} />
    </div>
  );
}

/** Knappen når kreditnotaen ikke ble laget sammen med kanselleringen eller refusjonen. */
export function CreditNoteRetry({ siteId, orderId }: { siteId: string; orderId: string }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await retryCreditNoteAction(siteId, orderId)))}
        className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Lager kreditnota …" : "Lag kreditnota"}
      </button>
      <FormStatus state={state} />
    </div>
  );
}
