"use client";

import { sortOptions, type BrowseQuery } from "@/lib/shop/browse";

/**
 * Søk, sortering og filtre som et vanlig GET-skjema. Det sendes først når kunden trykker «Bruk filter» eller
 * Enter i søkefeltet, ikke når et valg endres: ellers lastes siden på nytt for hver piltast i en liste (WCAG 3.2.2).
 */
export function BrowseControls({
  action,
  category,
  query,
  filters,
  count,
}: {
  action: string;
  category: string | null;
  query: BrowseQuery;
  filters: { key: string; name: string; values: string[] }[];
  count: number;
}) {
  const select = "rounded-[var(--radius)] border border-[var(--c-muted)]/50 bg-[var(--c-bg)] px-3 py-2";

  return (
    <form action={action} method="get" className="mb-8 flex flex-wrap items-end gap-4 border-y border-[var(--c-muted)]/20 py-4">
      {category && <input type="hidden" name="kategori" value={category} />}
      <div className="flex w-full items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-xs text-[var(--c-muted)]">Søk i varene</span>
          <input type="search" name="sok" defaultValue={query.search} placeholder="For eksempel pledd eller lin" className={`${select} w-full`} />
        </label>
        <button className="rounded-[var(--radius)] border border-[var(--c-muted)]/50 px-4 py-2 font-medium">Søk</button>
      </div>
      {filters.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-xs text-[var(--c-muted)]">{f.name}</span>
          <select name={`valg-${f.key}`} defaultValue={query.options[f.key] ?? ""} className={select}>
            <option value="">Alle</option>
            {f.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 pb-2">
        <input type="checkbox" name="lager" value="1" defaultChecked={query.inStock} />
        Bare på lager
      </label>
      <label className="ml-auto block">
        <span className="mb-1 block text-xs text-[var(--c-muted)]">Sorter</span>
        <select name="sorter" defaultValue={query.sort} className={select}>
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-[var(--radius)] border border-[var(--c-muted)]/50 px-4 py-2 font-medium">Bruk filter</button>
      <p className="w-full text-sm text-[var(--c-muted)]" aria-live="polite">
        {count} {count === 1 ? "vare" : "varer"}
      </p>
    </form>
  );
}
