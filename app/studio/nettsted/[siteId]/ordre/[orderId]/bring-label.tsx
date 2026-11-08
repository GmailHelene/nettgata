"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { bringProducts, type BringProductId } from "@/lib/bring/products";
import type { ActionState } from "../../../../actions";
import { createBringLabelAction } from "./bring-actions";

const inputClass = "w-full rounded-md border border-neutral-400 bg-white px-3 py-2";

/**
 * Skjemaet bak «Lag fraktetikett hos Bring». Tjenesten er den kunden valgte i kassen, og vekten er den kassen
 * regnet ut. Begge kan endres før bestillingen, for eksempel når varene ble pakket i to esker til én.
 */
export function BringLabelForm({
  siteId,
  orderId,
  products,
  defaultProduct,
  defaultWeightGrams,
  shopPackageCm,
  test,
}: {
  siteId: string;
  orderId: string;
  products: { id: BringProductId; name: string }[];
  defaultProduct: BringProductId;
  defaultWeightGrams: number | null;
  /** Butikkens vanlige pakkestørrelse, hvis den er fylt ut under Frakt med Bring. */
  shopPackageCm: { length: number; width: number; height: number } | null;
  test: boolean;
}) {
  const [product, setProduct] = useState<BringProductId>(defaultProduct);
  const [weight, setWeight] = useState(defaultWeightGrams === null ? "" : String(defaultWeightGrams));
  const sizeFor = (p: BringProductId) => {
    const s = shopPackageCm ?? bringProducts[p].defaultPackageCm;
    return { length: String(s.length), width: String(s.width), height: String(s.height) };
  };
  const [size, setSize] = useState(() => sizeFor(defaultProduct));
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  const book = () => {
    const grams = Number(weight.replace(/\s/g, ""));
    if (!/^\d+$/.test(weight.replace(/\s/g, "")) || grams < 1) {
      setState({ ok: false, message: "Skriv hvor mye pakken veier, i hele gram" });
      return;
    }
    const packageCm = { length: Number(size.length), width: Number(size.width), height: Number(size.height) };
    if (Object.values(packageCm).some((v) => !Number.isInteger(v) || v < 1)) {
      setState({ ok: false, message: "Skriv pakkens mål i hele centimeter" });
      return;
    }
    startTransition(async () => setState(await createBringLabelAction(siteId, orderId, { product, weightGrams: grams, packageCm })));
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        book();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <label className="block">
          <span className="mb-1 block text-sm">Tjeneste</span>
          <select value={product} onChange={(e) => {
              const next = e.target.value as BringProductId;
              setProduct(next);
              setSize(sizeFor(next));
            }} className={inputClass}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Vekt (gram)</span>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="numeric" autoComplete="off" required aria-describedby="bring-vekt-hjelp" className={inputClass} />
        </label>
      </div>
      <p id="bring-vekt-hjelp" className="text-xs text-neutral-600">
        Vekten på pakken med emballasje. {defaultWeightGrams === null && "Noen av varene mangler vekt, så skriv vekten selv."}
      </p>
      <fieldset>
        <legend className="mb-1 text-sm">Pakkens mål (cm)</legend>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["length", "Lengde"],
              ["width", "Bredde"],
              ["height", "Høyde"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs text-neutral-600">{label}</span>
              <input value={size[key]} onChange={(e) => setSize((s) => ({ ...s, [key]: e.target.value }))} inputMode="numeric" autoComplete="off" required className={inputClass} />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-600">Bring trenger målene for å lage etiketten. Sjekk at de stemmer med esken du bruker.</p>
      </fieldset>
      {test && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          Bring står i testmodus. Dette blir en testbestilling: Bring henter ikke pakken og sender ingen faktura.
        </p>
      )}
      <button disabled={pending} className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Bestiller hos Bring..." : "Lag fraktetikett hos Bring"}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
