"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "../../../../actions";
import { saveCustomerNoteAction } from "../../../../shop-actions";

export function CustomerNote({ siteId, customerId, note }: { siteId: string; customerId: string; note: string | null }) {
  const [value, setValue] = useState(note ?? "");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Notat om kunden</span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="For eksempel: liker å hente selv, ønsker gaveinnpakning"
          className="w-full rounded-md border border-neutral-400 px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={pending || value === (note ?? "")}
        onClick={() => startTransition(async () => setState(await saveCustomerNoteAction(siteId, customerId, value)))}
        className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        Lagre notat
      </button>
      <FormStatus state={state} />
    </div>
  );
}
