"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "../../../actions";
import { deleteDiscountAction, setDiscountActiveAction } from "../../../shop-actions";

export function DiscountRowActions({ siteId, discountId, code, active, used }: { siteId: string; discountId: string; code: string; active: boolean; used: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await setDiscountActiveAction(siteId, discountId, !active)))}
        aria-label={`${active ? "Slå av" : "Slå på"} rabattkoden ${code}`}
        className="underline disabled:opacity-60"
      >
        {active ? "Slå av" : "Slå på"}
      </button>
      {!used && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Slette rabattkoden ${code}?`)) return;
            startTransition(async () => setState(await deleteDiscountAction(siteId, discountId)));
          }}
          aria-label={`Slett rabattkoden ${code}`}
          className="underline disabled:opacity-60"
        >
          Slett
        </button>
      )}
      {state && !state.ok && (
        <span role="alert" className="text-red-800">
          {state.message}
        </span>
      )}
    </span>
  );
}
