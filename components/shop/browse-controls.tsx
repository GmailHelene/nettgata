"use client";

import { useRef } from "react";
import { sortOptions, type BrowseQuery } from "@/lib/shop/browse";

/**
 * Sortering og filtre som et vanlig GET-skjema: virker uten JavaScript (med «Vis»-knappen),
 * og sender seg selv automatisk når JavaScript er på.
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
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();
  const select = "rounded-[var(--radius)] border border-[var(--c-muted)]/50 bg-[var(--c-bg)] px-3 py-2";

  return (
    <form ref={formRef} action={action} method="get" className="mb-8 flex flex-wrap items-end gap-4 border-y border-[var(--c-muted)]/20 py-4">
      {category && <input type="hidden" name="kategori" value={category} />}
      {filters.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-xs text-[var(--c-muted)]">{f.name}</span>
          <select name={`valg-${f.key}`} defaultValue={query.options[f.key] ?? ""} onChange={submit} className={select}>
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
        <input type="checkbox" name="lager" value="1" defaultChecked={query.inStock} onChange={submit} />
        Bare på lager
      </label>
      <label className="ml-auto block">
        <span className="mb-1 block text-xs text-[var(--c-muted)]">Sorter</span>
        <select name="sorter" defaultValue={query.sort} onChange={submit} className={select}>
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button className="rounded-[var(--radius)] border px-4 py-2">Vis</button>
      </noscript>
      <p className="w-full text-sm text-[var(--c-muted)]" aria-live="polite">
        {count} {count === 1 ? "vare" : "varer"}
      </p>
    </form>
  );
}
