"use client";

import { ImageInput } from "@/components/studio/image-input";
import type { Field, ImageValue } from "@/lib/content/fields";

export type Value = Record<string, unknown>;

export function emptyValue(fields: Field[]): Value {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.type === "list" ? [] : f.type === "image" ? null : f.type === "select" ? f.options[0].value : ""]),
  );
}

export const inputClass = "w-full rounded-md border border-neutral-400 bg-white px-3 py-2";

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
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
    return <ImageInput label={field.label} optional={field.optional} value={value as ImageValue | null} onChange={onChange} />;
  }
  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as Value[]) : [];
    const update = (next: Value[]) => onChange(next);
    const full = items.length >= (field.max ?? 30);
    return (
      <fieldset className="rounded-md border border-neutral-300 p-3">
        <legend className="px-1 text-sm font-medium">{field.label}</legend>
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li key={i} className="rounded-md bg-neutral-100 p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">
                  {field.itemLabel} {i + 1}
                </span>
                <button type="button" className="underline" onClick={() => update(items.filter((_, j) => j !== i))}>
                  Fjern
                </button>
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
        <input className={inputClass} value={str} onChange={(e) => onChange(e.target.value)} />
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
