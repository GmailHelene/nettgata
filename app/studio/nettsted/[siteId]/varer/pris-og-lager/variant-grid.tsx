"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { VariantChange } from "@/lib/shop/catalog";
import { parseNok } from "@/lib/shop/money";
import { saveVariantGridAction } from "../../../../shop-actions";

export type GridRow = {
  variantId: string;
  name: string;
  variantLabel: string;
  sku: string | null;
  status: string;
  priceOre: number;
  stock: number | null;
};

const kr = (ore: number) => (ore / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
const cell = "w-full rounded border border-neutral-300 px-2 py-1 text-right tabular-nums aria-[invalid=true]:border-red-700";

/**
 * Pris og lager for alle varianter i én tabell, som et regneark. Bare endrede felt sendes,
 * og lager sendes med verdien det hadde da siden ble åpnet, så et salg i mellomtiden ikke skrives over.
 */
export function VariantGrid({ siteId, rows }: { siteId: string; rows: GridRow[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, { price?: string; stock?: string }>>({});
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const changes = useMemo(() => {
    const result: { change: VariantChange; error: string | null; label: string }[] = [];
    for (const row of rows) {
      const edit = edits[row.variantId];
      if (!edit) continue;
      const label = row.variantLabel ? `${row.name} (${row.variantLabel})` : row.name;
      const change: VariantChange = { variantId: row.variantId };
      let error: string | null = null;
      if (edit.price !== undefined && edit.price !== kr(row.priceOre)) {
        const ore = parseNok(edit.price);
        if (ore === null) error = `Ugyldig pris for ${label}`;
        else if (ore !== row.priceOre) change.priceOre = ore;
      }
      if (edit.stock !== undefined && edit.stock !== (row.stock === null ? "" : String(row.stock))) {
        const text = edit.stock.trim();
        if (text !== "" && !/^\d+$/.test(text)) error = `Lager for ${label} må være et helt tall, eller tomt hvis det ikke følges`;
        else {
          change.stock = text === "" ? null : Number(text);
          change.expectedStock = row.stock;
        }
      }
      if (error || change.priceOre !== undefined || change.stock !== undefined) result.push({ change, error, label });
    }
    return result;
  }, [edits, rows]);
  const dirty = changes.length > 0;

  // Varsle før siden lukkes med endringer som ikke er lagret.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const visible = filter.trim()
    ? rows.filter((r) => `${r.name} ${r.variantLabel} ${r.sku ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : rows;

  const save = () => {
    const firstError = changes.find((c) => c.error);
    if (firstError) return setMessage({ ok: false, text: firstError.error! });
    startTransition(async () => {
      const result = await saveVariantGridAction(siteId, changes.map((c) => c.change));
      setMessage({ ok: result.ok, text: result.message });
      // Rader som ble lagret, nullstilles. Rader med lagerkonflikt beholder det som ble skrevet, så det kan prøves igjen.
      const conflicts = new Set(result.conflicts ?? []);
      const keep = new Set(changes.filter((c) => conflicts.has(c.label)).map((c) => c.change.variantId));
      setEdits((current) => Object.fromEntries(Object.entries(current).filter(([id]) => keep.has(id))));
      router.refresh();
    });
  };

  const setEdit = (variantId: string, key: "price" | "stock", value: string) =>
    setEdits((current) => ({ ...current, [variantId]: { ...current[variantId], [key]: value } }));

  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3">
        <label htmlFor="grid-filter" className="sr-only">
          Finn vare
        </label>
        <input
          id="grid-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Finn vare eller varenummer"
          className="min-w-0 flex-1 basis-full rounded-md border border-neutral-400 px-3 py-2 sm:basis-auto"
        />
        <span className="mr-auto text-sm text-neutral-600 sm:mr-0" aria-live="polite">
          {dirty ? `${changes.length} ${changes.length === 1 ? "endring" : "endringer"} ikke lagret` : "Ingen endringer"}
        </span>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() => setEdits({})}
          className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Angre
        </button>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Lagrer..." : "Lagre endringer"}
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mb-3 rounded-md p-3 text-sm ${message.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3 font-medium">Vare</th>
              <th className="hidden p-3 font-medium sm:table-cell">Varenr.</th>
              <th className="w-24 p-3 text-right font-medium sm:w-36">Pris (kr)</th>
              <th className="w-20 p-3 text-right font-medium sm:w-32">Lager</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const edit = edits[row.variantId] ?? {};
              const changed = changes.some((c) => c.change.variantId === row.variantId);
              const label = row.variantLabel ? `${row.name}, ${row.variantLabel}` : row.name;
              return (
                <tr key={row.variantId} className={`border-b last:border-0 ${changed ? "bg-amber-50" : ""}`}>
                  <td className="p-3">
                    {row.name}
                    {row.variantLabel && <span className="text-neutral-600"> · {row.variantLabel}</span>}
                    {row.status === "draft" && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs">Kladd</span>}
                  </td>
                  <td className="hidden p-3 text-neutral-700 sm:table-cell">{row.sku ?? ""}</td>
                  <td className="p-2">
                    <input
                      value={edit.price ?? kr(row.priceOre)}
                      inputMode="decimal"
                      aria-label={`Pris for ${label}`}
                      aria-invalid={edit.price !== undefined && parseNok(edit.price) === null}
                      onChange={(e) => setEdit(row.variantId, "price", e.target.value)}
                      className={cell}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      value={edit.stock ?? (row.stock === null ? "" : String(row.stock))}
                      inputMode="numeric"
                      placeholder="Følges ikke"
                      aria-label={`Lager for ${label}`}
                      aria-invalid={edit.stock !== undefined && edit.stock.trim() !== "" && !/^\d+$/.test(edit.stock.trim())}
                      onChange={(e) => setEdit(row.variantId, "stock", e.target.value)}
                      className={cell}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-neutral-600">
        La lagerfeltet stå tomt for varer der lager ikke følges, som tjenester eller varer som lages på bestilling. Prisendringer lagres i prishistorikken,
        så førpris ved salg regnes ut automatisk.
      </p>
    </div>
  );
}
