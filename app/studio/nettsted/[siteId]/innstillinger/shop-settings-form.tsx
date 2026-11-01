"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import { parseNok } from "@/lib/shop/money";
import { paymentLabels, type PaymentMethod, type ShopSettings } from "@/lib/shop/settings";
import type { ActionState } from "../../../actions";
import { saveShopSettingsAction } from "../../../shop-actions";

type ShippingRow = { code: string; name: string; price: string; requiresAddress: boolean };

const kr = (ore: number) => (ore / 100).toString().replace(".", ",");
const codeFrom = (name: string, taken: string[]) => {
  const base =
    name
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "frakt";
  let code = base;
  for (let i = 2; taken.includes(code); i++) code = `${base}-${i}`;
  return code;
};

const selectable: { method: PaymentMethod; note?: string; disabled?: boolean }[] = [
  { method: "ved-henting" },
  { method: "faktura", note: "Du sender faktura selv etter bestillingen" },
  { method: "test", note: "Vises bare under utvikling, aldri i produksjon" },
];

export function ShopSettingsForm({ siteId, initial, pages }: { siteId: string; initial: ShopSettings; pages: { path: string; title: string; published: boolean }[] }) {
  const [shipping, setShipping] = useState<ShippingRow[]>(
    initial.shippingOptions.map((o) => ({ code: o.code, name: o.name, price: kr(o.priceOre), requiresAddress: o.requiresAddress })),
  );
  const [freeOver, setFreeOver] = useState(initial.freeShippingOverOre === null ? "" : kr(initial.freeShippingOverOre));
  const [methods, setMethods] = useState<PaymentMethod[]>(initial.paymentMethods);
  const [termsPath, setTermsPath] = useState(initial.termsPath);
  const [lowStockAt, setLowStockAt] = useState(String(initial.lowStockAt));
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const termsPage = pages.find((p) => p.path === termsPath);

  const save = () =>
    startTransition(async () => {
      const options = [];
      for (const row of shipping) {
        const priceOre = parseNok(row.price || "0");
        if (priceOre === null) return setState({ ok: false, message: `Ugyldig pris for «${row.name}»` });
        options.push({ code: row.code, name: row.name, priceOre, requiresAddress: row.requiresAddress });
      }
      const freeShippingOverOre = freeOver.trim() === "" ? null : parseNok(freeOver);
      if (freeOver.trim() !== "" && freeShippingOverOre === null) return setState({ ok: false, message: "Ugyldig beløp for gratis frakt" });
      const lowStock = Number(lowStockAt);
      if (!/^\d+$/.test(lowStockAt.trim()) || lowStock > 10_000) return setState({ ok: false, message: "Grensen for lite på lager må være et helt tall" });
      setState(await saveShopSettingsAction(siteId, { shippingOptions: options, freeShippingOverOre, paymentMethods: methods, termsPath, lowStockAt: lowStock }));
    });

  return (
    <section className="mt-8 space-y-6 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Butikk</h2>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium">Leveringsmåter</legend>
        {shipping.map((row, i) => (
          <div key={row.code} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto_auto]">
            <label className="block">
              <span className="mb-1 block text-xs">Navn</span>
              <input value={row.name} onChange={(e) => setShipping(shipping.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs">Pris (kr)</span>
              <input value={row.price} inputMode="decimal" onChange={(e) => setShipping(shipping.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))} className={inputClass} />
            </label>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={row.requiresAddress} onChange={(e) => setShipping(shipping.map((r, j) => (j === i ? { ...r, requiresAddress: e.target.checked } : r)))} />
              Trenger adresse
            </label>
            <button type="button" disabled={shipping.length === 1} className="mb-2 text-sm underline disabled:opacity-40" onClick={() => setShipping(shipping.filter((_, j) => j !== i))}>
              Fjern
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-sm underline"
          onClick={() => setShipping([...shipping, { code: codeFrom("Ny leveringsmåte", shipping.map((r) => r.code)), name: "Ny leveringsmåte", price: "", requiresAddress: true }])}
        >
          + Legg til leveringsmåte
        </button>
      </fieldset>

      <label className="block max-w-xs">
        <span className="mb-1 block text-sm font-medium">Gratis frakt ved kjøp over (kr)</span>
        <input value={freeOver} inputMode="decimal" placeholder="Ingen grense" onChange={(e) => setFreeOver(e.target.value)} className={inputClass} />
      </label>

      <label className="block max-w-xs">
        <span className="mb-1 block text-sm font-medium">Lite på lager når det er igjen (stk.)</span>
        <input value={lowStockAt} inputMode="numeric" onChange={(e) => setLowStockAt(e.target.value)} className={inputClass} />
        <span className="mt-1 block text-xs text-neutral-600">Varer med så få eller færre vises i oversikten, så du rekker å bestille nye.</span>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Betalingsmåter</legend>
        <p className="mb-2 text-xs text-neutral-600">Vipps og Klarna kobler du til under fanen Betaling, med butikkens egne avtaler.</p>
        <div className="space-y-2">
          {selectable.map(({ method, note, disabled }) => (
            <label key={method} className={`flex items-start gap-2 ${disabled ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={methods.includes(method)}
                onChange={(e) => setMethods(e.target.checked ? [...methods, method] : methods.filter((m) => m !== method))}
                className="mt-1"
              />
              <span>
                {paymentLabels[method]}
                {note && <span className="block text-xs text-neutral-600">{note}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium">Siden med kjøpsvilkår</span>
        <select value={termsPath} onChange={(e) => setTermsPath(e.target.value)} className={inputClass}>
          {!termsPage && <option value={termsPath}>{termsPath} (finnes ikke)</option>}
          {pages.map((p) => (
            <option key={p.path} value={p.path}>
              {p.title} ({p.path})
            </option>
          ))}
        </select>
        {(!termsPage || !termsPage.published) && (
          <span role="alert" className="mt-2 block text-sm text-red-800">
            Butikken tar ikke imot bestillinger før kjøpsvilkårene er publisert.
          </span>
        )}
      </label>

      <FormStatus state={state} />
      <button disabled={pending} onClick={save} className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Lagrer..." : "Lagre butikkinnstillinger"}
      </button>
    </section>
  );
}
