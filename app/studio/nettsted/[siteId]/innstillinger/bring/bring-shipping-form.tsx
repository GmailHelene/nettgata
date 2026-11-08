"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import { bringProductIds, bringProducts, type BringProductId } from "@/lib/bring/products";
import type { BringSender, BringShipping } from "@/lib/bring/state";
import { formatNok, parseNok } from "@/lib/shop/money";
import type { ActionState } from "../../../../actions";
import { saveBringShippingAction } from "./actions";

const kr = (ore: number) => (ore / 100).toString().replace(".", ",");
const cm = (value: number | undefined) => (value === undefined ? "" : String(value));

type ProductRow = { enabled: boolean; fallback: string };

/**
 * Hvilke Bring-tjenester kassen viser, med en fast reservepris for hver, og hvor pakkene sendes fra.
 * Reserveprisen brukes når Bring ikke svarer, eller når en vare i handlekurven mangler vekt, så kassen aldri stopper.
 */
export function BringShippingForm({
  siteId,
  initial,
  defaults,
  canEdit,
  ready,
}: {
  siteId: string;
  initial: BringShipping | null;
  defaults: BringSender;
  canEdit: boolean;
  ready: boolean;
}) {
  const [rows, setRows] = useState<Record<BringProductId, ProductRow>>(() => {
    const chosen = new Map((initial?.products ?? []).map((p) => [p.id, p.fallbackOre]));
    return Object.fromEntries(
      bringProductIds.map((id) => [id, { enabled: chosen.has(id), fallback: chosen.has(id) ? kr(chosen.get(id)!) : "" }]),
    ) as Record<BringProductId, ProductRow>;
  });
  const [sender, setSender] = useState<BringSender>(initial?.sender ?? defaults);
  const [size, setSize] = useState({ length: cm(initial?.packageCm?.length), width: cm(initial?.packageCm?.width), height: cm(initial?.packageCm?.height) });
  const [atPostOffice, setAtPostOffice] = useState(initial?.atPostOffice ?? false);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <section aria-labelledby="bring-frakt-tittel" className="space-y-3 rounded-lg border bg-white p-5">
        <h3 id="bring-frakt-tittel" className="text-lg font-semibold">
          Fraktvalg med Bring
        </h3>
        {initial?.products.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {initial.products.map((p) => (
              <li key={p.id}>
                {bringProducts[p.id].name}, reservepris {formatNok(p.fallbackOre)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-700">Ingen Bring-tjenester er valgt ennå.</p>
        )}
      </section>
    );
  }

  const save = () =>
    startTransition(async () => {
      const products = [];
      for (const id of bringProductIds) {
        const row = rows[id];
        if (!row.enabled) continue;
        const fallbackOre = parseNok(row.fallback);
        if (fallbackOre === null) return setState({ ok: false, message: `Skriv reserveprisen for ${bringProducts[id].name} i kroner, for eksempel 149` });
        products.push({ id, fallbackOre });
      }
      const filled = [size.length, size.width, size.height].filter((v) => v.trim() !== "");
      if (filled.length !== 0 && filled.length !== 3) return setState({ ok: false, message: "Fyll inn lengde, bredde og høyde, eller la alle tre stå tomme" });
      const packageCm = filled.length === 3 ? { length: Number(size.length), width: Number(size.width), height: Number(size.height) } : null;
      if (packageCm && Object.values(packageCm).some((v) => !Number.isInteger(v))) {
        return setState({ ok: false, message: "Skriv pakkestørrelsen i hele centimeter" });
      }
      setState(await saveBringShippingAction(siteId, { products, sender, packageCm, atPostOffice }));
    });

  const senderField = (key: keyof BringSender, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input value={sender[key]} onChange={(e) => setSender({ ...sender, [key]: e.target.value })} required className={inputClass} {...extra} />
    </label>
  );

  return (
    <section aria-labelledby="bring-frakt-tittel" className="space-y-5 rounded-lg border bg-white p-5">
      <h3 id="bring-frakt-tittel" className="text-lg font-semibold">
        Fraktvalg med Bring
      </h3>
      {!ready && <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">Bring vises i kassen når tilkoblingen over er testet og virker.</p>}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">Tjenester i kassen</legend>
          <p className="text-xs text-neutral-600">
            Kassen henter prisen fra Bring for vekten av varene og postnummeret til kunden. Reserveprisen brukes når Bring ikke svarer, eller når en
            vare mangler vekt. Dine vanlige regler gjelder fortsatt, også gratis frakt over et beløp.
          </p>
          {bringProductIds.map((id) => {
            const row = rows[id];
            const product = bringProducts[id];
            return (
              <div key={id} className="grid items-end gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-[1fr_10rem]">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => setRows({ ...rows, [id]: { ...row, enabled: e.target.checked } })}
                    aria-describedby={`bring-${id}-om`}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{product.name}</span>
                    <span id={`bring-${id}-om`} className="block text-xs text-neutral-600">
                      {product.description} Hos Bring heter tjenesten {product.bringName} ({id}).
                    </span>
                  </span>
                </label>
                {row.enabled && (
                  <label className="block">
                    <span className="mb-1 block text-xs">
                      Reservepris (kr)<span className="sr-only"> for {product.name}</span>
                    </span>
                    <input
                      value={row.fallback}
                      required
                      inputMode="decimal"
                      placeholder="F.eks. 149"
                      onChange={(e) => setRows({ ...rows, [id]: { ...row, fallback: e.target.value } })}
                      className={inputClass}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">Avsender</legend>
          <p className="text-xs text-neutral-600">Adressen pakkene sendes fra. Den står på etiketten, og prisen regnes ut fra postnummeret.</p>
          {senderField("name", "Navn", { maxLength: 35, autoComplete: "organization" })}
          {senderField("street", "Gateadresse", { maxLength: 35, autoComplete: "street-address" })}
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            {senderField("postalCode", "Postnr.", { inputMode: "numeric", maxLength: 4, pattern: "[0-9]{4}", autoComplete: "postal-code" })}
            {senderField("city", "Poststed", { maxLength: 35, autoComplete: "address-level2" })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">Vanlig pakkestørrelse (valgfritt)</legend>
          <p className="text-xs text-neutral-600">Bring trenger mål for å gi riktig pris på Pakke til hentested og Pakke levert hjem. Skriv målene på esken du bruker mest.</p>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {(
              [
                ["length", "Lengde (cm)"],
                ["width", "Bredde (cm)"],
                ["height", "Høyde (cm)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs">{label}</span>
                <input value={size[key]} inputMode="numeric" onChange={(e) => setSize({ ...size, [key]: e.target.value })} className={inputClass} />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={atPostOffice} onChange={(e) => setAtPostOffice(e.target.checked)} className="mt-1" />
          <span>
            Jeg leverer pakkene på et postkontor eller i Post i Butikk
            <span className="block text-xs text-neutral-600">Bring kan ha en annen pris når pakkene leveres der i stedet for å bli hentet.</span>
          </span>
        </label>

        <FormStatus state={state} />
        <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? "Lagrer..." : "Lagre fraktvalg"}
        </button>
      </form>
    </section>
  );
}
