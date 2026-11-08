"use client";

import { useId, useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "../../../../actions";
import { abandonRefundAction, refundPartAction } from "../../../../shop-actions";

export type RefundableLine = {
  id: string;
  name: string;
  variantLabel: string | null;
  /** Antall som kan refunderes nå. */
  remaining: number;
  quantity: number;
  unitPriceOre: number;
  /** Linjens del av rabatten på hele ordren. */
  discountShareOre: number;
};

const kr = (ore: number) => `${(ore / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

/**
 * «Refunder varer»: velg antall per vare og om frakten skal med, som i Shopify. Beløpet her er en forhåndsvisning
 * med samme regel som serveren (lib/shop/refunds.ts). Serveren regner ut beløpet på nytt og bestemmer.
 */
export function RefundForm({
  siteId,
  orderId,
  lines,
  shippingLeftOre,
  paymentLabel,
  online,
  pending,
}: {
  siteId: string;
  orderId: string;
  lines: RefundableLine[];
  shippingLeftOre: number;
  paymentLabel: string;
  online: boolean;
  pending: { id: string; error: string | null; lines: { lineId: string; quantity: number }[]; shippingOre: number; reason: string | null } | null;
}) {
  const [open, setOpen] = useState(Boolean(pending));
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries((pending?.lines ?? []).map((l) => [l.lineId, l.quantity])));
  const [shipping, setShipping] = useState(Boolean(pending && pending.shippingOre > 0));
  const [reason, setReason] = useState(pending?.reason ?? "");
  const [notify, setNotify] = useState(true);
  const [restock, setRestock] = useState(true);
  const [state, setState] = useState<ActionState>(null);
  const [busy, start] = useTransition();
  const formId = useId();

  const amount =
    lines.reduce((sum, l) => {
      const q = qty[l.id] ?? 0;
      return sum + l.unitPriceOre * q - Math.round((l.discountShareOre * q) / l.quantity);
    }, 0) + (shipping ? shippingLeftOre : 0);
  const nothingLeft = lines.every((l) => l.remaining === 0) && shippingLeftOre <= 0;
  if (nothingLeft) return null;

  const submit = () => {
    if (amount <= 0) return setState({ ok: false, message: "Velg minst én vare eller frakten." });
    const question = online
      ? `Betale tilbake ${kr(amount)} til kunden med ${paymentLabel} nå?`
      : `Registrere refusjon på ${kr(amount)}? Du betaler selv pengene tilbake til kunden.`;
    if (!confirm(question)) return;
    start(async () => {
      const result = await refundPartAction(siteId, orderId, {
        lines: Object.entries(qty).map(([lineId, quantity]) => ({ lineId, quantity })),
        shipping,
        reason,
        notifyCustomer: notify,
        restock,
      });
      setState(result);
      if (result?.ok) {
        setQty({});
        setShipping(false);
        setReason("");
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <div className="mt-3">
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          Refunder deler av ordren
        </button>
        <FormStatus state={state} />
      </div>
    );
  }

  return (
    <section aria-labelledby={`${formId}-tittel`} className="mt-6 rounded-lg border bg-white p-5">
      <h2 id={`${formId}-tittel`} className="font-semibold">
        Refunder varer
      </h2>
      <p className="mt-1 text-sm text-neutral-700">
        Velg hvor mange av hver vare kunden skal få pengene tilbake for. Rabatten på ordren trekkes fra i samme forhold.
      </p>

      {pending?.error && (
        <div role="alert" className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Forrige forsøk ble ikke fullført</p>
          <p>{pending.error}</p>
          <p className="mt-1">Trykk Refunder for å prøve igjen. Kunden får ikke pengene to ganger.</p>
          <button
            type="button"
            disabled={busy}
            className="mt-2 underline"
            onClick={() => {
              if (!confirm(`Avbryte refusjonen? Gjør det bare hvis du har sjekket i ${paymentLabel} at pengene ikke er sendt.`)) return;
              start(async () => setState(await abandonRefundAction(siteId, pending.id)));
            }}
          >
            Avbryt refusjonen
          </button>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Varer som kan refunderes</caption>
        <thead>
          <tr className="border-b text-left text-neutral-600">
            <th scope="col" className="py-2 pr-3 font-medium">
              Vare
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Antall
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Pris per stk.
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {l.name}
                {l.variantLabel && <span className="block text-neutral-600">{l.variantLabel}</span>}
                {l.remaining < l.quantity && <span className="block text-xs text-neutral-600">{l.quantity - l.remaining} refundert før</span>}
              </th>
              <td className="py-2 pr-3">
                <label className="flex items-center gap-2">
                  <span className="sr-only">Antall {l.name} å refundere</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={l.remaining}
                    disabled={l.remaining === 0 || Boolean(pending)}
                    value={qty[l.id] ?? 0}
                    onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(l.remaining, Math.floor(Number(e.target.value) || 0))) })}
                    className="w-20 rounded-md border px-2 py-1.5"
                  />
                  <span className="text-neutral-600">av {l.remaining}</span>
                </label>
              </td>
              <td className="py-2 text-right tabular-nums">{kr(l.unitPriceOre)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-3 text-sm">
        {shippingLeftOre > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={shipping} disabled={Boolean(pending)} onChange={(e) => setShipping(e.target.checked)} />
            Refunder frakten ({kr(shippingLeftOre)})
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          Legg varene tilbake på lager
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Send e-post til kunden om refusjonen
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Melding til kunden (valgfritt)</span>
          <input
            value={reason}
            maxLength={300}
            disabled={Boolean(pending)}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For eksempel: Returen er mottatt. Takk!"
            className="w-full rounded-md border px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" disabled={busy || amount <= 0} onClick={submit} className="rounded-md bg-[#173b6c] px-5 py-2.5 font-semibold text-white disabled:opacity-60">
          {busy ? "Refunderer..." : `Refunder ${kr(Math.max(amount, 0))}`}
        </button>
        {!pending && (
          <button type="button" onClick={() => setOpen(false)} className="text-sm underline">
            Lukk
          </button>
        )}
        <p className="text-sm text-neutral-700">
          {online ? `Pengene går tilbake med ${paymentLabel}.` : "Du betaler pengene tilbake til kunden selv."} Det lages en kreditnota.
        </p>
      </div>
      <div className="mt-3" aria-live="polite">
        <FormStatus state={state} />
      </div>
    </section>
  );
}
