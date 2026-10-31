"use client";

import { useState, useTransition } from "react";
import type { Field } from "@/lib/content/fields";
import { sectionRegistry } from "@/lib/content/registry";
import { sectionTypes, type PageContent, type Section, type SectionType } from "@/lib/content/types";
import { previewLinkAction, publishAction, restoreAction, saveDraftAction, type ActionState } from "@/app/studio/actions";

type Props = {
  pageId: string;
  path: string;
  initialTitle: string;
  initialContent: PageContent;
  publishedNumber: number | null;
  versions: { id: string; number: number; createdAt: string }[];
};

type Value = Record<string, unknown>;

function emptyValue(fields: Field[]): Value {
  return Object.fromEntries(fields.map((f) => [f.key, f.type === "list" ? [] : ""]));
}

const inputClass = "w-full rounded-md border border-neutral-400 bg-white px-3 py-2";

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "list") {
    const items = Array.isArray(value) ? (value as Value[]) : [];
    const update = (next: Value[]) => onChange(next);
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
        <button type="button" className="mt-3 text-sm underline" onClick={() => update([...items, emptyValue(field.fields)])}>
          + Legg til {field.itemLabel.toLowerCase()}
        </button>
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

function FieldGroup({ fields, value, onChange }: { fields: Field[]; value: Value; onChange: (v: Value) => void }) {
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} value={value[field.key]} onChange={(v) => onChange({ ...value, [field.key]: v })} />
      ))}
    </div>
  );
}

export function PageEditor({ pageId, path, initialTitle, initialContent, publishedNumber, versions }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<PageContent>(initialContent);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<ActionState>(null);
  const [newType, setNewType] = useState<SectionType>("tekst");
  const [pending, startTransition] = useTransition();

  const edit = (next: PageContent) => {
    setContent(next);
    setDirty(true);
  };
  const setSection = (index: number, section: Section) =>
    edit({ ...content, sections: content.sections.map((s, i) => (i === index ? section : s)) });
  const move = (index: number, delta: number) => {
    const sections = [...content.sections];
    const [s] = sections.splice(index, 1);
    sections.splice(index + delta, 0, s);
    edit({ ...content, sections });
  };

  const save = async () => {
    const result = await saveDraftAction(pageId, title, content);
    if (result?.ok) setDirty(false);
    return result;
  };

  const run = (fn: () => Promise<ActionState>) => startTransition(async () => setStatus(await fn()));

  return (
    <div className="mt-4">
      <div className="sticky top-0 z-10 -mx-5 mb-8 flex flex-wrap items-center gap-3 border-b bg-neutral-50/95 px-5 py-3 backdrop-blur">
        <span className="mr-auto text-sm text-neutral-700">
          {path} · {publishedNumber ? `Live: versjon ${publishedNumber}` : "Ikke publisert"}
          {dirty ? " · Ulagrede endringer" : ""}
        </span>
        <button disabled={pending} className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold" onClick={() => run(save)}>
          Lagre kladd
        </button>
        <button
          disabled={pending}
          className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold"
          onClick={() =>
            run(async () => {
              const saved = await save();
              if (!saved?.ok) return saved;
              const res = await previewLinkAction(pageId);
              if (res.ok && res.url) window.open(res.url, "_blank", "noopener");
              return res.ok ? { ok: true, message: "Forhåndsvisning åpnet i ny fane. Lenken kan deles i 7 dager." } : { ok: false, message: res.message ?? "Feil" };
            })
          }
        >
          Forhåndsvis
        </button>
        <button
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() =>
            run(async () => {
              const saved = await save();
              return saved?.ok ? publishAction(pageId) : saved;
            })
          }
        >
          Publiser
        </button>
      </div>

      {status && (
        <p role="status" className={`mb-6 whitespace-pre-line rounded-md p-3 text-sm ${status.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
          {status.message}
        </p>
      )}

      <label className="mb-8 block">
        <span className="mb-1 block text-sm font-medium">Sidetittel</span>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
      </label>

      <ol className="space-y-6">
        {content.sections.map((section, i) => {
          const def = sectionRegistry[section.type];
          return (
            <li key={section.id} className="rounded-lg border bg-white p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="mr-auto font-semibold">{def.label}</h2>
                {def.variants.length > 1 && (
                  <select
                    aria-label="Variant"
                    className="rounded-md border border-neutral-400 px-2 py-1 text-sm"
                    value={section.variant}
                    onChange={(e) => setSection(i, { ...section, variant: e.target.value })}
                  >
                    {def.variants.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="text-sm underline disabled:opacity-40" disabled={i === 0} onClick={() => move(i, -1)}>
                  Flytt opp
                </button>
                <button type="button" className="text-sm underline disabled:opacity-40" disabled={i === content.sections.length - 1} onClick={() => move(i, 1)}>
                  Flytt ned
                </button>
                <button
                  type="button"
                  className="text-sm text-red-800 underline"
                  onClick={() => edit({ ...content, sections: content.sections.filter((_, j) => j !== i) })}
                >
                  Slett
                </button>
              </div>
              <FieldGroup fields={def.fields} value={section.props} onChange={(props) => setSection(i, { ...section, props })} />
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center gap-3">
        <select aria-label="Seksjonstype" className="rounded-md border border-neutral-400 px-2 py-2" value={newType} onChange={(e) => setNewType(e.target.value as SectionType)}>
          {sectionTypes.map((t) => (
            <option key={t} value={t}>
              {sectionRegistry[t].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold"
          onClick={() =>
            edit({
              ...content,
              sections: [
                ...content.sections,
                { id: crypto.randomUUID().slice(0, 8), type: newType, variant: sectionRegistry[newType].variants[0].key, props: emptyValue(sectionRegistry[newType].fields) },
              ],
            })
          }
        >
          Legg til seksjon
        </button>
      </div>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">Versjoner</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-neutral-600">Siden er ikke publisert ennå.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  Versjon {v.number} · {new Date(v.createdAt).toLocaleString("nb-NO")}
                  {v.number === publishedNumber ? " · live nå" : ""}
                </span>
                {v.number !== publishedNumber && (
                  <button
                    type="button"
                    disabled={pending}
                    className="underline"
                    onClick={() => {
                      if (!confirm(`Publisere versjon ${v.number} på nytt? Kladden blir erstattet med denne versjonen.`)) return;
                      startTransition(async () => {
                        const result = await restoreAction(pageId, v.id);
                        setStatus(result);
                        // Kladden er byttet ut på serveren; last inn på nytt så skjemaet viser den.
                        if (result?.ok) window.location.reload();
                      });
                    }}
                  >
                    Gå tilbake hit
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
