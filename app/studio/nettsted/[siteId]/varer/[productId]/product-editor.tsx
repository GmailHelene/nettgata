"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { ImageInput, SiteIdContext } from "@/components/studio/image-input";
import { inputClass } from "@/components/studio/info-fields";
import type { ImageValue } from "@/lib/content/fields";
import type { ProductInput } from "@/lib/shop/catalog";
import { parseNok } from "@/lib/shop/money";
import type { ActionState } from "../../../../actions";
import { archiveProductAction, saveProductAction } from "../../../../shop-actions";

/** weight er variantens egen vekt i gram. Tom betyr samme vekt som varen. */
type VariantRow = { id?: string; optionValues: string[]; sku: string; price: string; stock: string; weight: string };
type OptionRow = { name: string; values: string };

const gramsText = (grams: number | null | undefined) => (grams === null || grams === undefined ? "" : String(grams));

/** «» blir null (vekten mangler), «850» blir 850. Alt annet er ugyldig (undefined). */
function parseGrams(text: string): number | null | undefined {
  const value = text.replace(/\s/g, "");
  if (value === "") return null;
  if (!/^\d+$/.test(value) || Number(value) > 1_000_000) return undefined;
  return Number(value);
}

const vatChoices = [
  { rate: 25, label: "25 % (de fleste varer)" },
  { rate: 15, label: "15 % (mat og drikke)" },
  { rate: 12, label: "12 % (f.eks. transport og kino)" },
  { rate: 0, label: "0 % (f.eks. bøker og aviser)" },
];

const keyOf = (values: string[]) => values.join(" / ");
const splitValues = (text: string) => [...new Set(text.split(",").map((v) => v.trim()).filter(Boolean))];

/** Alle kombinasjoner av valgene: Størrelse S, M og Farge Blå, Rød gir fire varianter. */
function combinations(options: { values: string[] }[]): string[][] {
  return options.reduce<string[][]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => [...combo, v])), [[]]);
}

const priceText = (ore: number) => (ore === 0 ? "" : (ore / 100).toString().replace(".", ","));

export function ProductEditor({
  siteId,
  initial,
  categories,
  viewPath,
}: {
  siteId: string;
  initial: ProductInput & { id?: string };
  categories: { id: string; name: string }[];
  viewPath: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [images, setImages] = useState<ImageValue[]>(initial.images ?? []);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [vatRate, setVatRate] = useState(initial.vatRate);
  const [status, setStatus] = useState(initial.status);
  const [options, setOptions] = useState<OptionRow[]>((initial.options ?? []).map((o) => ({ name: o.name, values: o.values.join(", ") })));
  const [weight, setWeight] = useState(gramsText(initial.weightGrams));
  const [variants, setVariants] = useState<VariantRow[]>(
    initial.variants.map((v) => ({
      id: v.id,
      optionValues: v.optionValues,
      sku: v.sku ?? "",
      price: priceText(v.priceOre),
      stock: v.stock === null || v.stock === undefined ? "" : String(v.stock),
      weight: gramsText(v.weightGrams),
    })),
  );
  const [bulkPrice, setBulkPrice] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  /** Lager variantlisten på nytt fra valgene, men beholder pris, lager og ID for kombinasjoner som fortsatt finnes. */
  const applyOptions = (next: OptionRow[]) => {
    setOptions(next);
    const parsed = next.map((o) => ({ values: splitValues(o.values) })).filter((o) => o.values.length > 0);
    if (parsed.length !== next.length) return; // venter til alle valg har verdier
    const existing = new Map(variants.map((v) => [keyOf(v.optionValues), v]));
    const fallback = variants[0];
    setVariants(
      combinations(parsed).map((combo) => {
        const found = existing.get(keyOf(combo));
        return found ?? { optionValues: combo, sku: "", price: fallback?.price ?? "", stock: fallback?.stock ?? "", weight: "" };
      }),
    );
  };

  const updateVariant = (i: number, patch: Partial<VariantRow>) => setVariants(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const save = () =>
    startTransition(async () => {
      const weightGrams = parseGrams(weight);
      if (weightGrams === undefined) {
        setState({ ok: false, message: "Skriv vekten i hele gram, for eksempel 850" });
        return;
      }
      const builtVariants = [];
      for (const v of variants) {
        const priceOre = parseNok(v.price || "");
        if (priceOre === null) {
          setState({ ok: false, message: `Skriv en gyldig pris for ${keyOf(v.optionValues) || "varen"}` });
          return;
        }
        const stock = v.stock.trim() === "" ? null : Number(v.stock);
        if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
          setState({ ok: false, message: `Lager må være et helt tall for ${keyOf(v.optionValues) || "varen"}` });
          return;
        }
        // Med bare én variant står vekten på varen. Med flere kan hver variant ha sin egen.
        const variantWeight = variants.length > 1 ? parseGrams(v.weight) : null;
        if (variantWeight === undefined) {
          setState({ ok: false, message: `Skriv vekten i hele gram for ${keyOf(v.optionValues)}, eller la feltet stå tomt` });
          return;
        }
        builtVariants.push({ id: v.id, optionValues: v.optionValues, sku: v.sku, priceOre, stock, weightGrams: variantWeight });
      }
      const result = await saveProductAction(siteId, initial.id ?? null, {
        name,
        description,
        images,
        options: options.map((o) => ({ name: o.name.trim(), values: splitValues(o.values) })),
        vatRate,
        status,
        categoryId: categoryId || null,
        weightGrams,
        variants: builtVariants,
      });
      setState(result);
      if (result.ok && !initial.id && result.productId) router.replace(`/studio/nettsted/${siteId}/varer/${result.productId}`);
      else if (result.ok) router.refresh();
    });

  return (
    <SiteIdContext.Provider value={siteId}>
      <div className="space-y-8">
        <section className="space-y-4 rounded-lg border bg-white p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Navn</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="F.eks. Strikket lue i ull" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Beskrivelse</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputClass}>
                <option value="draft">Kladd (vises ikke)</option>
                <option value="active">I butikken</option>
                <option value="archived">Arkivert</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Kategori</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
                <option value="">Ingen</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">MVA</span>
              <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className={inputClass}>
                {vatChoices.map((v) => (
                  <option key={v.rate} value={v.rate}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Bilder</h2>
          {images.map((img, i) => (
            <ImageInput
              key={i}
              label={i === 0 ? "Hovedbilde" : `Bilde ${i + 1}`}
              withFocus
              value={img}
              onChange={(v) => setImages(v ? images.map((x, j) => (j === i ? v : x)) : images.filter((_, j) => j !== i))}
            />
          ))}
          <ImageInput label={images.length ? "Legg til bilde" : "Hovedbilde"} optional value={null} onChange={(v) => v && setImages([...images, v])} />
        </section>

        <section className="space-y-3 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Valg</h2>
          <p className="text-sm text-neutral-600">For eksempel Størrelse: S, M, L. Variantene lages automatisk av kombinasjonene.</p>
          {options.map((o, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[12rem_1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Navn på valget</span>
                <input value={o.name} onChange={(e) => applyOptions(options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Verdier, skilt med komma</span>
                <input value={o.values} onChange={(e) => applyOptions(options.map((x, j) => (j === i ? { ...x, values: e.target.value } : x)))} className={inputClass} />
              </label>
              <button type="button" className="mb-2 text-sm underline" onClick={() => applyOptions(options.filter((_, j) => j !== i))}>
                Fjern
              </button>
            </div>
          ))}
          {options.length < 3 && (
            <button type="button" className="text-sm underline" onClick={() => setOptions([...options, { name: "", values: "" }])}>
              + Legg til valg (størrelse, farge, materiale)
            </button>
          )}
        </section>

        <section className="space-y-3 rounded-lg border bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-semibold">{variants.length > 1 ? `Varianter (${variants.length})` : "Pris og lager"}</h2>
            {variants.length > 1 && (
              <div className="flex items-end gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs">Samme pris på alle</span>
                  <input value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} inputMode="decimal" className={`${inputClass} w-28`} />
                </label>
                <button type="button" className="mb-1 text-sm underline" onClick={() => bulkPrice && setVariants(variants.map((v) => ({ ...v, price: bulkPrice })))}>
                  Bruk
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block max-w-xs">
              <span className="mb-1 block text-sm font-medium">Vekt (gram)</span>
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="F.eks. 850"
                aria-describedby="vekt-hjelp"
                className={inputClass}
              />
            </label>
            <p id="vekt-hjelp" className="mt-1 text-xs text-neutral-600">
              Vekten pakken får, med emballasje. Den brukes til fraktprisen fra Bring.{" "}
              {variants.length > 1 && "Veier en variant noe annet, skriver du vekten i tabellen under. "}
              Uten vekt kan varen fortsatt selges, men kassen bruker da reserveprisen du har satt for Bring.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-600">
                  {variants.length > 1 && <th className="py-2 pr-3 font-medium">Variant</th>}
                  <th className="py-2 pr-3 font-medium">Pris (kr, inkl. MVA)</th>
                  <th className="py-2 pr-3 font-medium">På lager</th>
                  {variants.length > 1 && <th className="py-2 pr-3 font-medium">Vekt (gram)</th>}
                  <th className="py-2 font-medium">Varenummer (valgfritt)</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={keyOf(v.optionValues) || i} className="border-t">
                    {variants.length > 1 && <td className="py-2 pr-3 font-medium">{keyOf(v.optionValues)}</td>}
                    <td className="py-2 pr-3">
                      <input aria-label="Pris" value={v.price} onChange={(e) => updateVariant(i, { price: e.target.value })} inputMode="decimal" className={`${inputClass} w-32`} />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label="På lager"
                        value={v.stock}
                        onChange={(e) => updateVariant(i, { stock: e.target.value })}
                        inputMode="numeric"
                        placeholder="Følges ikke"
                        className={`${inputClass} w-28`}
                      />
                    </td>
                    {variants.length > 1 && (
                      <td className="py-2 pr-3">
                        <input
                          aria-label={`Vekt i gram for ${keyOf(v.optionValues)}`}
                          value={v.weight}
                          onChange={(e) => updateVariant(i, { weight: e.target.value })}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="Som varen"
                          className={`${inputClass} w-28`}
                        />
                      </td>
                    )}
                    <td className="py-2">
                      <input aria-label="Varenummer" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} className={`${inputClass} w-40`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-600">
            La lager stå tomt for varer som lages på bestilling. Setter du ned prisen, viser butikken førpris automatisk etter markedsføringsloven.
          </p>
        </section>

        <FormStatus state={state} />
        <div className="flex flex-wrap gap-3">
          <button disabled={pending} onClick={save} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
            {pending ? "Lagrer..." : initial.id ? "Lagre" : "Opprett vare"}
          </button>
          {viewPath && status === "active" && (
            <a href={viewPath} target="_blank" rel="noreferrer" className="rounded-md border border-[#173b6c] px-5 py-3 font-semibold">
              Se i butikken
            </a>
          )}
          {initial.id && status !== "archived" && (
            <button
              disabled={pending}
              className="ml-auto text-sm text-red-800 underline"
              onClick={() => {
                if (!confirm("Arkivere varen? Den forsvinner fra butikken, men gamle ordre beholdes.")) return;
                startTransition(async () => {
                  setState(await archiveProductAction(siteId, initial.id!));
                  setStatus("archived");
                });
              }}
            >
              Arkiver
            </button>
          )}
        </div>
      </div>
    </SiteIdContext.Provider>
  );
}
