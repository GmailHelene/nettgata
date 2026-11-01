"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { OrderStatus } from "@/lib/shop/orders";
import type { ActionState } from "../../../../actions";
import { setOrderStatusAction } from "../../../../shop-actions";

/**
 * Knappene følger de samme statusreglene som serveren, så bare lovlige steg vises.
 * Med Vipps og Klarna flytter statusen ekte penger: sendt trekker beløpet, kansellert frigjør reservasjonen,
 * refundert betaler tilbake. Uten dem må butikken ordne pengene selv.
 */
function actionsFor(status: string, online: boolean): { to: OrderStatus; label: string; confirm?: string; primary?: boolean }[] {
  switch (status) {
    case "pending_payment":
      return [
        { to: "paid", label: online ? "Sjekk betalingen" : "Marker som betalt", primary: true },
        { to: "cancelled", label: "Kanseller", confirm: "Kansellere ordren? Varene legges tilbake på lager." },
      ];
    case "paid":
      return [
        { to: "fulfilled", label: online ? "Marker som sendt (beløpet trekkes)" : "Marker som sendt eller hentet", primary: true },
        {
          to: "cancelled",
          label: "Kanseller",
          confirm: online ? "Kansellere ordren? Reservasjonen hos kunden frigjøres automatisk." : "Kansellere en betalt ordre? Husk å betale tilbake til kunden.",
        },
        {
          to: "refunded",
          label: online ? "Refunder" : "Marker som refundert",
          confirm: online ? "Betale tilbake hele beløpet til kunden nå?" : "Har du betalt tilbake hele beløpet til kunden?",
        },
      ];
    case "fulfilled":
      return [
        {
          to: "refunded",
          label: online ? "Refunder (retur)" : "Marker som refundert (retur)",
          confirm: online ? "Har du fått varene tilbake? Hele beløpet betales tilbake til kunden nå." : "Har du fått varene tilbake og betalt tilbake til kunden?",
        },
      ];
    default:
      return [];
  }
}

export function OrderActions({ siteId, orderId, status, online, owner }: { siteId: string; orderId: string; status: string; online: boolean; owner: boolean }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  // Samme regel som setOrderStatusAction: refusjon og kansellering av betalte ordre er eierens.
  const all = actionsFor(status, online);
  const available = owner ? all : all.filter((a) => a.to !== "refunded" && !(a.to === "cancelled" && status !== "pending_payment"));
  const hidden = all.length > available.length;
  if (available.length === 0 && !hidden) return null;

  return (
    <div className="space-y-3">
      {hidden && <p className="text-sm text-neutral-700">Refusjon og kansellering av betalte ordre gjøres av eieren av butikken.</p>}
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
                ? "rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                : "rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60"
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
