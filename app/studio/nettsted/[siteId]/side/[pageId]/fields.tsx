"use client";

import { useContext, useEffect, useState } from "react";
import { FileInput } from "@/components/studio/file-input";
import { ImageInput, SiteIdContext } from "@/components/studio/image-input";
import { listCollectionsAction } from "../../../../shop-actions";
import type { Field, FileValue, ImageValue, TextFormat } from "@/lib/content/fields";

export type Value = Record<string, unknown>;

/** Riktig tastatur på mobil for felt med fast form. */
const inputTypes: Record<TextFormat, string> = { email: "email", phone: "tel", youtube: "url" };

export function emptyValue(fields: Field[]): Value {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.type === "list" ? [] : f.type === "image" || f.type === "file" ? null : f.type === "select" ? f.options[0].value : ""]),
  );
}

export const inputClass = "w-full rounded-md border border-neutral-400 bg-white px-3 py-2";

/** Velger en av butikkens samlinger. Listen hentes fra serveren, siden den er forskjellig for hver butikk. */
function CollectionSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const siteId = useContext(SiteIdContext);
  const [options, setOptions] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    if (siteId) listCollectionsAction(siteId).then(setOptions, () => setOptions([]));
  }, [siteId]);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Alle varer</option>
        {value && !options.some((o) => o.slug === value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
      {options.length === 0 && <span className="mt-1 block text-xs text-neutral-600">Samlinger lager du nederst på siden Varer.</span>}
    </label>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "collection") {
    return <CollectionSelect label={field.label} value={typeof value === "string" ? value : ""} onChange={onChange} />;
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{field.label}</span>
        <select className={inputClass} value={typeof value === "string" ? value : field.options[0].value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "image") {
    return <ImageInput label={field.label} optional={field.optional} withFocus value={value as ImageValue | null} onChange={onChange} />;
  }
  if (field.type === "file") {
    return <FileInput label={field.label} optional={field.optional} value={value as FileValue | null} onChange={onChange} />;
  }
  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as Value[]) : [];
    const update = (next: Value[]) => onChange(next);
    const full = items.length >= (field.max ?? 30);
    // Bytter plass på to elementer. Rekkefølgen i listen er rekkefølgen på nettstedet og i skjemaet.
    const swap = (i: number, j: number) => {
      if (j < 0 || j >= items.length) return;
      const next = [...items];
      [next[i], next[j]] = [next[j], next[i]];
      update(next);
    };
    return (
      <fieldset className="rounded-md border border-neutral-300 p-3">
        <legend className="px-1 text-sm font-medium">{field.label}</legend>
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="rounded-md bg-neutral-100 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="mr-auto font-medium">
                  {field.itemLabel} {i + 1}
                </span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="underline disabled:no-underline disabled:opacity-40"
                    disabled={i === 0}
                    aria-label={`Flytt ${field.itemLabel.toLowerCase()} ${i + 1} opp`}
                    onClick={() => swap(i, i - 1)}
                  >
                    Opp
                  </button>
                  <button
                    type="button"
                    className="underline disabled:no-underline disabled:opacity-40"
                    disabled={i === items.length - 1}
                    aria-label={`Flytt ${field.itemLabel.toLowerCase()} ${i + 1} ned`}
                    onClick={() => swap(i, i + 1)}
                  >
                    Ned
                  </button>
                  <button type="button" className="underline" onClick={() => update(items.filter((_, j) => j !== i))}>
                    Fjern
                  </button>
                </span>
              </div>
              <FieldGroup fields={field.fields} value={item} onChange={(v) => update(items.map((it, j) => (j === i ? v : it)))} />
            </li>
          ))}
        </ol>
        {!full && (
          <button type="button" className="mt-3 text-sm underline" onClick={() => update([...items, emptyValue(field.fields)])}>
            + Legg til {field.itemLabel.toLowerCase()}
          </button>
        )}
      </fieldset>
    );
  }
  const str = typeof value === "string" ? value : "";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {field.label}
        {"optional" in field && field.optional ? <span className="font-normal text-neutral-600"> (valgfritt)</span> : null}
      </span>
      {field.type === "textarea" ? (
        <textarea className={inputClass} rows={4} value={str} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          className={inputClass}
          type={field.type === "text" && field.format ? inputTypes[field.format] : "text"}
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

export function FieldGroup({ fields, value, onChange }: { fields: Field[]; value: Value; onChange: (v: Value) => void }) {
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} value={value[field.key]} onChange={(v) => onChange({ ...value, [field.key]: v })} />
      ))}
    </div>
  );
}
