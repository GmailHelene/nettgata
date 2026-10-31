"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { OrderStatus } from "@/lib/shop/orders";
import type { ActionState } from "../../../../actions";
import { setOrderStatusAction } from "../../../../shop-actions";

/** Knappene følger de samme statusreglene som serveren, så bare lovlige steg vises. */
const actions: Record<string, { to: OrderStatus; label: string; confirm?: string; primary?: boolean }[]> = {
  pending_payment: [
    { to: "paid", label: "Marker som betalt", primary: true },
    { to: "cancelled", label: "Kanseller", confirm: "Kansellere ordren? Varene legges tilbake på lager." },
  ],
  paid: [
    { to: "fulfilled", label: "Marker som sendt eller hentet", primary: true },
    { to: "cancelled", label: "Kanseller", confirm: "Kansellere en betalt ordre? Husk å betale tilbake til kunden." },
    { to: "refunded", label: "Marker som refundert", confirm: "Har du betalt tilbake hele beløpet til kunden?" },
  ],
  fulfilled: [{ to: "refunded", label: "Marker som refundert (retur)", confirm: "Har du fått varene tilbake og betalt tilbake til kunden?" }],
  cancelled: [],
  refunded: [],
};

export function OrderActions({ siteId, orderId, status }: { siteId: string; orderId: string; status: string }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const available = actions[status] ?? [];
  if (available.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {available.map((a) => (
          <button
            key={a.to}
            disabled={pending}
            onClick={() => {
              if (a.confirm && !confirm(a.confirm)) return;
              startTransition(async () => setState(await setOrderStatusAction(siteId, orderId, a.to)));
            }}
            className={
              a.primary
                ? "rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                : "rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            }
          >
            {a.label}
          </button>
        ))}
      </div>
      <FormStatus state={state} />
    </div>
  );
}
