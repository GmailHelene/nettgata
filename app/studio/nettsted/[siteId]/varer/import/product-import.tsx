"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ImportPlan } from "@/lib/shop/import";
import { applyImportAction, previewImportAction } from "../../../../shop-actions";

/**
 * Excel lagrer «CSV (semikolondelt)» i Windows-1252, ikke UTF-8. Vi prøver UTF-8 først,
 * og faller tilbake til Windows-1252, så æøå blir riktige uansett hvordan filen er lagret.
 */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const SHOW = 30;

/** «1 ny vare», «3 nye varer». */
const varer = (n: number, en: string, flere: string) => `${n} ${n === 1 ? `${en} vare` : `${flere} varer`}`;

export function ProductImport({ siteId }: { siteId: string }) {
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const choose = async (file: File | undefined) => {
    setPlan(null);
    setMessage(null);
    setDone(false);
    if (!file) return;
    setFileName(file.name);
    const content = await readText(file);
    setText(content);
    startTransition(async () => {
      const result = await previewImportAction(siteId, content);
      setPlan(result.plan ?? null);
      setMessage({ ok: result.ok, text: result.message });
    });
  };

  const apply = () =>
    startTransition(async () => {
      const result = await applyImportAction(siteId, text);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setDone(true);
    });

  const nothingToDo = plan && plan.errors.length === 0 && plan.creates.length === 0 && plan.updates.length === 0;

  return (
    <div className="space-y-6">
      <label className="block rounded-lg border-2 border-dashed border-neutral-400 bg-white p-6 text-center hover:border-[#173b6c]">
        <span className="block font-semibold">{fileName || "Velg en CSV-fil"}</span>
        <span className="mt-1 block text-sm text-neutral-600">Fra Excel, Numbers eller Google Regneark. Maks 2000 rader.</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0])} className="mt-3 text-sm" />
      </label>

      {pending && <p aria-live="polite">Leser filen...</p>}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-md p-3 text-sm ${message.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
          {message.text}
        </p>
      )}

      {plan && !done && (
        <div className="space-y-4">
          {plan.errors.length > 0 && (
            <section className="rounded-lg border border-red-300 bg-white p-5">
              <h3 className="mb-2 font-semibold">Feil som må rettes ({plan.errors.length})</h3>
              <ul className="space-y-1 text-sm">
                {plan.errors.slice(0, SHOW).map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">Linje {e.line}:</span> {e.message}
                  </li>
                ))}
              </ul>
              {plan.errors.length > SHOW && <p className="mt-2 text-sm text-neutral-600">og {plan.errors.length - SHOW} til.</p>}
            </section>
          )}
          {plan.creates.length > 0 && (
            <section className="rounded-lg border bg-white p-5">
              <h3 className="mb-2 font-semibold">Nye varer ({plan.creates.length})</h3>
              <ul className="space-y-1 text-sm">
                {plan.creates.slice(0, SHOW).map((c) => (
                  <li key={c.name}>
                    {c.name} <span className="text-neutral-600">· {c.variants} {c.variants === 1 ? "variant" : "varianter"} · {c.status}</span>
                  </li>
                ))}
              </ul>
              {plan.creates.length > SHOW && <p className="mt-2 text-sm text-neutral-600">og {plan.creates.length - SHOW} til.</p>}
            </section>
          )}
          {plan.updates.length > 0 && (
            <section className="rounded-lg border bg-white p-5">
              <h3 className="mb-2 font-semibold">Endringer på varer som finnes ({plan.updates.length})</h3>
              <ul className="space-y-2 text-sm">
                {plan.updates.slice(0, SHOW).map((u) => (
                  <li key={u.name}>
                    <span className="font-medium">{u.name}:</span> {u.changes.join(", ")}
                  </li>
                ))}
              </ul>
              {plan.updates.length > SHOW && <p className="mt-2 text-sm text-neutral-600">og {plan.updates.length - SHOW} til.</p>}
            </section>
          )}
          {plan.newCategories.length > 0 && <p className="text-sm">Nye kategorier som lages: {plan.newCategories.join(", ")}.</p>}
          {nothingToDo && <p className="text-sm">Filen er lik det som ligger i butikken. Ingenting å importere.</p>}

          {plan.errors.length === 0 && !nothingToDo && (
            <button type="button" disabled={pending} onClick={apply} className="rounded-md bg-[#173b6c] px-5 py-2 font-semibold text-white disabled:opacity-60">
              Importer{" "}
              {[plan.creates.length > 0 && varer(plan.creates.length, "ny", "nye"), plan.updates.length > 0 && varer(plan.updates.length, "endret", "endrede")]
                .filter(Boolean)
                .join(" og ")}
            </button>
          )}
        </div>
      )}

      {done && (
        <Link href={`/studio/nettsted/${siteId}/varer`} className="inline-block rounded-md bg-[#173b6c] px-5 py-2 font-semibold text-white">
          Se varene
        </Link>
      )}
    </div>
  );
}
