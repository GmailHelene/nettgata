"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fieldsForVariant, type Field } from "@/lib/content/fields";
import { sectionRegistry } from "@/lib/content/registry";
import { sectionBackgrounds, type Section } from "@/lib/content/types";
import { FieldGroup } from "./fields";

const backgroundLabels: Record<(typeof sectionBackgrounds)[number], string> = {
  standard: "Vanlig",
  flate: "Flate",
  fargerik: "Fargerik",
};

/**
 * Den første teksten i seksjonen, så den er lett å kjenne igjen når den er lukket. Følger rekkefølgen
 * i feltdefinisjonene, fordi databasen sorterer nøklene i lagret innhold.
 */
function firstText(fields: Field[], value: Record<string, unknown>): string {
  for (const field of fields) {
    const current = value[field.key];
    if ((field.type === "text" || field.type === "textarea") && typeof current === "string" && current.trim()) return current.trim();
    if (field.type === "list" && Array.isArray(current)) {
      for (const item of current) {
        const text = item && typeof item === "object" ? firstText(field.fields, item as Record<string, unknown>) : "";
        if (text) return text;
      }
    }
  }
  return "";
}

type Drag = { id: string; from: number; to: number; dy: number };

export type SectionListProps = {
  sections: Section[];
  selectedId: string | null;
  problems: Map<string, string[]>;
  withExampleText: Set<string>;
  onToggle: (id: string) => void;
  /** `typing` er sant for skriving i feltene. Da slås tastetrykk sammen til ett angresteg. */
  onChange: (index: number, next: Section, typing: boolean) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onAdd: (index: number) => void;
  /** Nettstedet har minst én aktiv tjeneste under Booking, så varianten «Egen booking» kan velges. */
  ownBooking?: boolean;
};

export function SectionList({
  sections,
  selectedId,
  problems,
  withExampleText,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onAdd,
  ownBooking = false,
}: SectionListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const move = (from: number, to: number) => {
    if (to === from || to < 0 || to >= sections.length) return;
    onMove(from, to);
    setAnnouncement(`${sectionRegistry[sections[from].type].label} er nå nummer ${to + 1} av ${sections.length}.`);
  };

  /**
   * Dra i håndtaket for å flytte. Lytterne ligger på vinduet, så dra virker med mus, penn og finger
   * selv om pekeren forlater håndtaket. Kortet følger pekeren, og en strek viser hvor det havner.
   */
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || sections.length < 2) return;
    event.preventDefault();
    const id = sections[index].id;
    const startY = event.pageY;
    let to = index;
    setDrag({ id, from: index, to, dy: 0 });

    const onPointerMove = (e: PointerEvent) => {
      if (e.clientY < 90) window.scrollBy(0, -14);
      else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
      const others = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? []).filter(
        (el) => el.dataset.cardId !== id,
      );
      to = others.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2 < e.clientY;
      }).length;
      setDrag({ id, from: index, to, dy: e.pageY - startY });
    };
    const finish = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setDrag(null);
      if (e.type === "pointerup") move(index, to);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  // Streken som viser hvor kortet havner: foran det `to`-te av de andre kortene, eller etter det siste.
  const others = drag ? sections.filter((s) => s.id !== drag.id) : [];
  const markBefore = drag && drag.to !== drag.from ? (others[drag.to]?.id ?? null) : null;
  const markAfterLast = drag !== null && drag.to !== drag.from && drag.to === others.length;

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ol ref={listRef} className="space-y-3">
        {sections.map((section, i) => {
          const def = sectionRegistry[section.type];
          const open = section.id === selectedId;
          const dragging = drag?.id === section.id;
          const issues = problems.get(section.id) ?? [];
          const example = withExampleText.has(section.id);
          const variantLabel = def.variants.find((v) => v.key === section.variant)?.label;
          const text = firstText(def.fields, section.props);
          const isLast = i === sections.length - 1;
          return (
            <li
              key={section.id}
              id={`seksjon-${section.id}`}
              data-card-id={section.id}
              className={`relative rounded-lg border bg-white ${open ? "border-[#173b6c] shadow-sm" : "border-neutral-300"} ${
                dragging ? "z-10 shadow-xl ring-2 ring-blue-600" : ""
              }`}
              style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
            >
              {markBefore === section.id && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-2 h-1 rounded bg-blue-600" />}
              {markAfterLast && isLast && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-2 h-1 rounded bg-blue-600" />
              )}
              <div className="flex items-center gap-1 p-2">
                <button
                  type="button"
                  aria-label={`Flytt ${def.label}. Dra, eller bruk piltastene opp og ned.`}
                  title="Dra for å flytte"
                  className="cursor-grab touch-none rounded p-2 text-neutral-600 hover:bg-neutral-100 active:cursor-grabbing"
                  onPointerDown={(e) => startDrag(e, i)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(i, e.key === "ArrowUp" ? i - 1 : i + 1);
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    {[3, 8, 13].flatMap((y) => [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
                  </svg>
                </button>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? `felter-${section.id}` : undefined}
                  onClick={() => onToggle(section.id)}
                  className="min-w-0 flex-1 rounded px-2 py-1.5 text-left hover:bg-neutral-50"
                >
                  <span className="block font-semibold">
                    {def.label}
                    {def.variants.length > 1 && variantLabel && <span className="font-normal text-neutral-600"> · {variantLabel}</span>}
                  </span>
                  {text && !open && <span className="block truncate text-sm text-neutral-600">{text}</span>}
                  {(issues.length > 0 || example) && (
                    <span className="mt-1 flex flex-wrap gap-2 text-xs font-medium">
                      {issues.length > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-900">
                          {issues.length === 1 ? "1 ting mangler" : `${issues.length} ting mangler`}
                        </span>
                      )}
                      {example && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">Eksempeltekst</span>}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Flytt ${def.label} opp`}
                  title="Flytt opp"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className="rounded p-2 text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 10l4-4 4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`Flytt ${def.label} ned`}
                  title="Flytt ned"
                  disabled={isLast}
                  onClick={() => move(i, i + 1)}
                  className="rounded p-2 text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
              </div>

              {open && (
                <div id={`felter-${section.id}`} className="border-t border-neutral-200 p-4">
                  {def.hint && <p className="mb-4 text-sm text-neutral-700">{def.hint}</p>}
                  {issues.length > 0 && (
                    <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-900">
                      <p className="font-semibold">Må fikses før publisering</p>
                      <ul className="mt-1 list-disc pl-5">
                        {issues.map((issue, n) => (
                          <li key={n}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {example && (
                    <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                      Seksjonen har fortsatt eksempeltekst. Bytt den ut med din egen før du publiserer.
                    </p>
                  )}
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    {def.variants.length > 1 && (
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium">Utseende</span>
                        <select
                          className="w-full rounded-md border border-neutral-400 bg-white px-3 py-2"
                          value={section.variant}
                          onChange={(e) => onChange(i, { ...section, variant: e.target.value }, false)}
                        >
                          {def.variants.filter((v) => v.key !== "egen" || ownBooking || section.variant === "egen").map((v) => (
                            <option key={v.key} value={v.key}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium">Bakgrunn</span>
                      <select
                        className="w-full rounded-md border border-neutral-400 bg-white px-3 py-2"
                        value={section.background ?? "standard"}
                        onChange={(e) => onChange(i, { ...section, background: e.target.value as Section["background"] }, false)}
                      >
                        {sectionBackgrounds.map((b) => (
                          <option key={b} value={b}>
                            {backgroundLabels[b]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <FieldGroup fields={fieldsForVariant(def.fields, section.variant)} value={section.props} onChange={(props) => onChange(i, { ...section, props }, true)} />
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-neutral-200 pt-4 text-sm">
                    <button type="button" onClick={() => onAdd(i + 1)} className="rounded-md border border-[#173b6c] px-3 py-1.5 font-semibold">
                      + Legg til seksjon under
                    </button>
                    <button type="button" onClick={() => onDuplicate(i)} className="underline">
                      Lag kopi
                    </button>
                    <button type="button" onClick={() => onRemove(i)} className="text-red-800 underline">
                      Slett seksjonen
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
