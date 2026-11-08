"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { ui } from "@/components/studio/ui";
import { bulkCreateLabelsAction, bulkFulfilAction, bulkPrintLabelsAction, type BulkFulfilState, type BulkLabelsState, type BulkPrintState } from "./bulk-actions";

const MAX = 25;

export type OrderRowData = {
  id: string;
  number: number;
  customerName: string;
  meta: string;
  total: string;
  statusText: string;
  statusClass: string;
  /** Kan velges til etikett: betalt eller sendt, og Bring er koblet til. */
  selectable: boolean;
  /** Betalt og ikke sendt: kan markeres som sendt sammen med andre. */
  canFulfil: boolean;
  label: { state: "booked"; consignmentNumber: string } | { state: "none" } | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Ordrelista med avkrysning og bulkhandlingene «Lag etiketter» og «Skriv ut etiketter».
 * Resultatet leses opp via aria-live. Nøklene til Bring finnes bare på serveren: nettleseren sender ordre-id-er og får tekst tilbake.
 */
export function OrderList({ siteId, base, rows, bulk }: { siteId: string; base: string; rows: OrderRowData[]; bulk: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<BulkLabelsState>(null);
  const [printed, setPrinted] = useState<BulkPrintState>(null);
  const [fulfilled, setFulfilled] = useState<BulkFulfilState>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"create" | "print" | "fulfil" | null>(null);
  const uid = useId();

  // Ordre kan velges for etiketter (Bring er koblet til) eller for «Marker som sendt» (betalt).
  const selectable = useMemo(() => rows.filter((r) => (bulk && r.selectable) || r.canFulfil), [rows, bulk]);
  const fulfilCount = rows.filter((r) => r.canFulfil && selected.includes(r.id)).length;
  const chosen = new Set(selected);
  const full = selected.length >= MAX;
  const allSelected = selectable.length > 0 && selectable.slice(0, MAX).every((r) => chosen.has(r.id));
  const someSelected = selected.length > 0 && !allSelected;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX ? s : [...s, id]));
  const toggleAll = () => setSelected(allSelected ? [] : selectable.slice(0, MAX).map((r) => r.id));

  const run = (kind: "create" | "print" | "fulfil") => {
    if (kind === "fulfil" && !confirm(`Markere ${fulfilCount} ordre som sendt? Med kort, Vipps og Kustom trekkes beløpet nå, og kundene får «Pakken er på vei».`)) return;
    setCreated(null);
    setPrinted(null);
    setFulfilled(null);
    setBusy(kind);
    startTransition(async () => {
      if (kind === "create") setCreated(await bulkCreateLabelsAction(siteId, selected));
      else if (kind === "print") setPrinted(await bulkPrintLabelsAction(siteId, selected));
      else {
        setFulfilled(await bulkFulfilAction(siteId, selected));
        setSelected([]);
      }
      setBusy(null);
    });
  };

  const status = created ?? printed ?? fulfilled;

  return (
    <>
      {selectable.length > 0 && (
        <section aria-label="Handlinger for flere ordre" className={`${ui.card} mb-4 space-y-3 p-4`}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                id={`${uid}-alle`}
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-5 w-5 accent-[#173b6c]"
              />
              <label htmlFor={`${uid}-alle`} className="font-semibold">
                Velg alle ({Math.min(selectable.length, MAX)})
              </label>
            </div>
            <p className={ui.muted}>
              {selected.length === 0 ? `Velg opptil ${MAX} ordre.` : `${plural(selected.length, "ordre valgt", "ordre valgt")}${full ? ` (maks ${MAX})` : ""}.`}
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              {bulk && (
                <>
                  <button type="button" className={ui.button} disabled={pending || selected.length === 0} onClick={() => run("create")}>
                    {pending && busy === "create" ? "Bestiller hos Bring..." : "Lag etiketter"}
                  </button>
                  <button type="button" className={ui.buttonGhost} disabled={pending || selected.length === 0} onClick={() => run("print")}>
                    Skriv ut etiketter
                  </button>
                </>
              )}
              <button type="button" className={ui.buttonGhost} disabled={pending || fulfilCount === 0} onClick={() => run("fulfil")}>
                {pending && busy === "fulfil" ? "Markerer..." : `Marker som sendt${fulfilCount ? ` (${fulfilCount})` : ""}`}
              </button>
            </div>
          </div>
          <p className="text-sm text-neutral-600">
            {bulk &&
              "«Lag etiketter» bestiller hos Bring for ordrene som ikke har etikett. Ordre som hentes, mangler adresse eller vekt, hoppes over. «Skriv ut etiketter» samler etikettene i én PDF. "}
            «Marker som sendt» gjelder ordre som er betalt og ikke sendt.
          </p>
        </section>
      )}

      {/* Alltid på siden, så skjermlesere melder endringen. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="mb-4 empty:hidden">
        {status && (
          <div className={status.ok ? ui.success : ui.error}>
            <p className="font-semibold">{status.message}</p>
            {created && created.problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {created.problems.map((p) => (
                  <li key={p.orderId}>
                    {p.number === null ? "Ukjent ordre" : `Ordre #${p.number}`}: {p.status === "booked" ? "booket. " : ""}
                    {p.reason}
                  </li>
                ))}
              </ul>
            )}
            {fulfilled && fulfilled.problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {fulfilled.problems.map((p) => (
                  <li key={p.orderId}>
                    {p.number === null ? "Ukjent ordre" : `Ordre #${p.number}`}: {p.reason}
                  </li>
                ))}
              </ul>
            )}
            {printed && printed.skipped.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {printed.skipped.map((s, i) => (
                  <li key={i}>
                    {s.number === null ? "Ukjent ordre" : `Ordre #${s.number}`}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
            {printed?.url && (
              <p className="mt-2">
                <a href={printed.url} target="_blank" rel="noopener" className={ui.link}>
                  Åpne samlet PDF med {plural(printed.count, "etikett", "etiketter")} (åpnes i ny fane)
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      <ul className="divide-y rounded-lg border bg-white">
        {rows.map((o) => {
          const checked = chosen.has(o.id);
          return (
            <li key={o.id} className="flex items-stretch hover:bg-neutral-50">
              <div className="flex w-12 shrink-0 items-center justify-center">
                {((bulk && o.selectable) || o.canFulfil) && (
                  <>
                    <input
                      id={`${uid}-${o.id}`}
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={() => toggle(o.id)}
                      className="h-5 w-5 accent-[#173b6c]"
                    />
                    <label htmlFor={`${uid}-${o.id}`} className="sr-only">
                      Velg ordre #{o.number}, {o.customerName}
                    </label>
                  </>
                )}
              </div>
              <Link href={`${base}/${o.id}`} className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 py-4 pr-4">
                <span className="w-16 font-semibold">#{o.number}</span>
                <span className="mr-auto min-w-40">
                  <span className="block">{o.customerName}</span>
                  <span className="text-sm text-neutral-600">{o.meta}</span>
                </span>
                {o.label?.state === "booked" && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-900">Etikett laget, sporing {o.label.consignmentNumber}</span>
                )}
                {o.label?.state === "none" && <span className="rounded-full border border-neutral-400 bg-white px-3 py-1 text-sm text-neutral-800">Ikke booket</span>}
                <span className="font-medium tabular-nums">{o.total}</span>
                <span className={`rounded-full px-3 py-1 text-sm ${o.statusClass}`}>{o.statusText}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
