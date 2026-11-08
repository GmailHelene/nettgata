"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { AdminProduct } from "@/lib/shop/admin";
import type { BulkProductChange } from "@/lib/shop/catalog";
import { formatNok } from "@/lib/shop/money";
import type { ActionState } from "../../../actions";
import { bulkProductsAction } from "../../../shop-actions";

const statusLabel = { draft: "Kladd", active: "I butikken", archived: "Arkivert" } as const;

/** Varelisten med avkrysning. Når noe er valgt, kommer en linje med handlinger for alle de valgte. */
export function ProductTable({
  siteId,
  products,
  categories,
}: {
  siteId: string;
  products: AdminProduct[];
  categories: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = (change: BulkProductChange, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    startTransition(async () => {
      const result = await bulkProductsAction(siteId, [...selected], change);
      setState(result);
      if (result?.ok) setSelected(new Set());
    });
  };

  return (
    <div>
      <div className="sticky top-14 z-10 mb-2 flex min-h-12 flex-wrap items-center gap-2 rounded-lg border bg-white px-4 py-2" aria-live="polite">
        <label className="mr-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)))}
            aria-label="Velg alle varene i listen"
          />
          {selected.size > 0 ? `${selected.size} valgt` : "Velg alle"}
        </label>
        {selected.size > 0 && (
          <>
            <button type="button" disabled={pending} onClick={() => apply({ status: "active" })} className="rounded-md border border-[#173b6c] px-3 py-1 text-sm disabled:opacity-60">
              Sett i butikken
            </button>
            <button type="button" disabled={pending} onClick={() => apply({ status: "draft" })} className="rounded-md border border-[#173b6c] px-3 py-1 text-sm disabled:opacity-60">
              Gjør til kladd
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => apply({ status: "archived" }, `Arkivere ${selected.size} varer? De forsvinner fra butikken, men gamle ordre beholder dem.`)}
              className="rounded-md border border-[#173b6c] px-3 py-1 text-sm disabled:opacity-60"
            >
              Arkiver
            </button>
            {categories.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="sr-only">Flytt til kategori</span>
                <select
                  disabled={pending}
                  value=""
                  onChange={(e) => e.target.value && apply({ categoryId: e.target.value === "ingen" ? null : e.target.value })}
                  className="rounded-md border border-[#173b6c] px-2 py-1"
                >
                  <option value="">Flytt til kategori...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="ingen">Uten kategori</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
      <FormStatus state={state} />

      <ul className="mt-2 divide-y rounded-lg border bg-white">
        {products.map((p) => (
          <li key={p.id} className={`flex items-center gap-3 px-4 ${selected.has(p.id) ? "bg-neutral-50" : ""}`}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Velg ${p.name}`} className="shrink-0" />
            <Link href={`/studio/nettsted/${siteId}/varer/${p.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:underline">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded bg-neutral-100" />
              )}
              <span className="mr-auto min-w-0">
                <span className="block font-medium">{p.name}</span>
                <span className="text-sm text-neutral-600">
                  {p.variantCount} {p.variantCount === 1 ? "variant" : "varianter"}
                  {p.variantCount > 0 && ` · fra ${formatNok(p.fromPriceOre)}`}
                  {p.category && ` · ${p.category}`}
                </span>
              </span>
              <span className={`text-sm ${p.tracked && p.low ? "font-medium text-red-800" : "text-neutral-700"}`}>
                {!p.tracked ? "Lager følges ikke" : p.stock === 0 ? "Utsolgt" : `${p.stock} på lager${p.low ? " · lite igjen" : ""}`}
              </span>
              <span className={`text-sm sm:w-24 sm:text-right ${p.status === "active" ? "text-green-800" : "text-neutral-600"}`}>{statusLabel[p.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
