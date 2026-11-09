"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageRenderer, type RenderContext } from "@/components/sections";
import type { PageContent } from "@/lib/content/types";
import { isDark, type Theme } from "@/lib/theme";
import { buildTheme, getThemeDef, themes, themeTags, type Palette, type ThemeDef, type ThemeTag } from "@/lib/themes";
import { PreviewFrame, type Device } from "./preview-frame";

export type ThemeChoice = { theme: string; palette: string };
export type PreviewPage = { path: string; title: string; content: PageContent };

/** Bredden miniatyrene tegnes i før de krympes. Samme som datamaskin i forhåndsvisningen. */
const SOURCE_WIDTH = 1280;
const noop = () => {};

/**
 * Forsiden krympet ned med CSS zoom. Det er de ekte seksjonene med temaet på, så det kunden ser i
 * galleriet er det hun får. Miniatyren er bare et bilde: den kan ikke fokuseres og leses ikke opp.
 */
export function ThemeThumb({ theme, content, ctx }: { theme: Theme; content: PageContent; ctx: RenderContext }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const short = useMemo(() => ({ ...content, sections: content.sections.slice(0, 3) }), [content]);
  return (
    <div ref={box} inert aria-hidden="true" className="relative aspect-[16/11] w-full overflow-hidden bg-[#e7ebee] [&_header]:!static">
      {width > 0 && (
        <div style={{ width: SOURCE_WIDTH, zoom: width / SOURCE_WIDTH }}>
          <PageRenderer content={short} theme={theme} ctx={ctx} embedded />
        </div>
      )}
    </div>
  );
}

/** Fargeprøve: bakgrunn og hovedfarge delt på skrå, med pyntefargen som prikk. */
function Swatch({ palette, size = "h-7 w-7" }: { palette: Palette; size?: string }) {
  const c = palette.colors;
  return (
    <span
      aria-hidden="true"
      className={`relative block ${size} rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]`}
      style={{ background: `linear-gradient(135deg, ${c.background} 0 50%, ${c.primary} 50% 100%)` }}
    >
      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: c.accent }} />
    </span>
  );
}

function PalettePicker({ def, value, onChange }: { def: ThemeDef; value: string; onChange: (key: string) => void }) {
  return (
    <div role="group" aria-label={`Fargevarianter i ${def.label}`} className="flex flex-wrap gap-2">
      {def.palettes.map((p) => (
        <button
          key={p.key}
          type="button"
          title={p.label}
          aria-label={p.label}
          aria-pressed={p.key === value}
          onClick={() => onChange(p.key)}
          className="rounded-full p-0.5 outline-offset-2 aria-pressed:ring-2 aria-pressed:ring-[#173b6c] focus-visible:outline-2 focus-visible:outline-[#173b6c]"
        >
          <Swatch palette={p} />
        </button>
      ))}
    </div>
  );
}

type Filter = "alle" | "anbefalt" | "mork" | ThemeTag;

/**
 * Temagalleriet, som temaene i WordPress. I «Nytt nettsted» velger kunden direkte fra kortet. Under Design
 * (`confirm`) åpner kortet alltid forhåndsvisningen først, siden et bytte der gjelder det publiserte nettstedet.
 */
export function ThemeGallery({
  recommended,
  value,
  current,
  pages,
  ctx,
  onChoose,
  confirm = false,
  chooseLabel = "Velg dette temaet",
}: {
  recommended: string[];
  /** Valget som er merket i galleriet. */
  value: ThemeChoice | null;
  /** Temaet nettstedet bruker nå, hvis det er et annet enn valget. */
  current?: ThemeChoice | null;
  pages: PreviewPage[];
  ctx: RenderContext;
  onChoose: (choice: ThemeChoice) => void;
  confirm?: boolean;
  chooseLabel?: string;
}) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [open, setOpen] = useState<ThemeChoice | null>(null);
  const front = pages.find((p) => p.path === "/") ?? pages[0];

  const ordered = useMemo(() => {
    const rank = (def: ThemeDef) => {
      const i = recommended.indexOf(def.key);
      return i === -1 ? 100 + themes.indexOf(def) : i;
    };
    return [...themes].sort((a, b) => rank(a) - rank(b));
  }, [recommended]);

  const visible = ordered.filter((def) =>
    filter === "alle"
      ? true
      : filter === "anbefalt"
        ? recommended.includes(def.key)
        : filter === "mork"
          ? def.palettes.some((p) => isDark(p.colors))
          : def.tags.includes(filter),
  );

  const filters: [Filter, string][] = [
    ["alle", `Alle (${themes.length})`],
    ["anbefalt", "Anbefalt for deg"],
    ...(Object.entries(themeTags) as [ThemeTag, string][]),
    ["mork", "Mørke"],
  ];

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Vis temaer" className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className="rounded-full border border-[#c3ccd3] bg-white px-3.5 py-2 text-sm font-medium transition-colors hover:border-[#173b6c] aria-pressed:border-[#173b6c] aria-pressed:bg-[#173b6c] aria-pressed:text-white"
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((def) => (
          <ThemeCard
            // Kortet nullstilles når filteret endres, så «Mørke» viser den mørke varianten med en gang.
            key={`${def.key}-${filter === "mork" ? "mork" : "lys"}`}
            def={def}
            front={front.content}
            ctx={ctx}
            recommended={recommended.includes(def.key)}
            selected={value?.theme === def.key ? value.palette : null}
            inUse={current?.theme === def.key}
            currentPalette={current?.theme === def.key ? current.palette : null}
            darkFirst={filter === "mork"}
            confirm={confirm}
            onChoose={onChoose}
            onPreview={setOpen}
          />
        ))}
      </ul>
      {visible.length === 0 && <p className="text-sm text-[#47525c]">Ingen temaer passer filteret.</p>}

      {open && (
        <ThemePreviewDialog
          choice={open}
          pages={pages}
          ctx={ctx}
          chooseLabel={chooseLabel}
          onChoose={(choice) => {
            onChoose(choice);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ThemeCard({
  def,
  front,
  ctx,
  recommended,
  selected,
  inUse,
  currentPalette,
  darkFirst,
  confirm,
  onChoose,
  onPreview,
}: {
  def: ThemeDef;
  front: PageContent;
  ctx: RenderContext;
  recommended: boolean;
  /** Fargevarianten som er valgt, når dette temaet er valgt. */
  selected: string | null;
  inUse: boolean;
  /** Fargevarianten nettstedet bruker nå, så «I bruk»-kortet viser den og ikke standardvarianten. */
  currentPalette: string | null;
  darkFirst: boolean;
  confirm: boolean;
  onChoose: (choice: ThemeChoice) => void;
  onPreview: (choice: ThemeChoice) => void;
}) {
  const [shown, setShown] = useState(
    () => selected ?? currentPalette ?? (darkFirst ? def.palettes.find((p) => isDark(p.colors))?.key : undefined) ?? def.palettes[0].key,
  );
  // Velges en annen variant i forhåndsvisningen, skal kortet vise den også.
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected !== lastSelected) {
    setLastSelected(selected);
    if (selected) setShown(selected);
  }
  const theme = useMemo(() => buildTheme(def.key, shown)!, [def.key, shown]);
  const palette = def.palettes.find((p) => p.key === shown) ?? def.palettes[0];
  const choice = { theme: def.key, palette: shown };
  const pick = () => (confirm ? onPreview(choice) : onChoose(choice));

  return (
    <li
      className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow ${
        selected ? "border-[#173b6c] ring-2 ring-[#173b6c]" : "border-[#d5dbe0] hover:shadow-[0_10px_24px_-14px_rgb(23_59_108/0.45)]"
      }`}
    >
      {/* Knappen ligger over miniatyren, ikke rundt den: miniatyren har lenker og knapper fra nettsiden inni seg. */}
      <div className="relative">
        <ThemeThumb theme={theme} content={front} ctx={ctx} />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={pick}
          className="absolute inset-0"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-bricolage)] text-lg font-extrabold tracking-[-0.02em]">
              {def.label}
              {recommended && <span className="rounded-full bg-[#e9f1ed] px-2 py-0.5 font-[family-name:var(--font-archivo)] text-xs font-semibold tracking-normal text-[#1e3d30]">Anbefalt</span>}
              {inUse && <span className="rounded-full bg-[#173b6c] px-2 py-0.5 font-[family-name:var(--font-archivo)] text-xs font-semibold tracking-normal text-white">I bruk</span>}
            </h3>
            <p className="mt-1 text-sm text-[#47525c]">{def.bestFor}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <PalettePicker
            def={def}
            value={shown}
            onChange={(key) => {
              setShown(key);
              if (selected && !confirm) onChoose({ theme: def.key, palette: key });
            }}
          />
          <span className="text-xs text-[#47525c]">{palette.label}</span>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => onPreview(choice)} aria-label={`Forhåndsvis ${def.label}`} className="min-h-10 rounded-lg border-2 border-[#173b6c] px-3.5 py-1.5 text-sm font-semibold text-[#173b6c] transition-colors hover:bg-[#eef3f9]">
            Forhåndsvis
          </button>
          {!confirm && (
            <button
              type="button"
              onClick={() => onChoose(choice)}
              aria-pressed={Boolean(selected)}
              aria-label={`${selected ? "Valgt" : "Velg"} ${def.label}`}
              className="min-h-10 rounded-lg bg-[#173b6c] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0f2c55] aria-pressed:bg-[#2f5a47]"
            >
              {selected ? "Valgt" : "Velg"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Hele nettstedet med temaet på, i full størrelse. Iframen har sin egen bredde, så mobilvisningen er ekte.
 * `<dialog>` med showModal gir fokusfelle, Esc for å lukke og resten av siden utilgjengelig så lenge den er åpen.
 */
export function ThemePreviewDialog({
  choice,
  pages,
  ctx,
  chooseLabel,
  onChoose,
  onClose,
}: {
  choice: ThemeChoice;
  pages: PreviewPage[];
  ctx: RenderContext;
  chooseLabel: string;
  onChoose: (choice: ThemeChoice) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const def = getThemeDef(choice.theme) ?? themes[0];
  const [palette, setPalette] = useState(choice.palette);
  const [device, setDevice] = useState<Device>("datamaskin");
  const [path, setPath] = useState(pages.find((p) => p.path === "/")?.path ?? pages[0]?.path ?? "/");
  const theme = useMemo(() => buildTheme(def.key, palette)!, [def.key, palette]);
  const page = pages.find((p) => p.path === path) ?? pages[0];
  const frameCtx = useMemo(() => ({ ...ctx, path: page.path }), [ctx, page.path]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={`Forhåndsvisning av ${def.label}`}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-[#e7ebee] p-0 backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[#d5dbe0] bg-white px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">{def.label}</h2>
            <p className="text-sm text-[#47525c]">{def.description}</p>
          </div>
          <PalettePicker def={def} value={palette} onChange={setPalette} />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">Side</span>
            <select value={page.path} onChange={(e) => setPath(e.target.value)} className="min-h-10 rounded-lg border border-[#7d8a96] bg-white px-2.5 py-1.5">
              {pages.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Skjermstørrelse" className="flex overflow-hidden rounded-lg border border-[#7d8a96] text-sm">
            {(["datamaskin", "mobil"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                className="px-3 py-2 font-medium capitalize aria-pressed:bg-[#173b6c] aria-pressed:text-white"
              >
                {d}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChoose({ theme: def.key, palette })}
            className="min-h-10 rounded-lg bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f2c55]"
          >
            {chooseLabel}
          </button>
          <button type="button" onClick={() => ref.current?.close()} className="min-h-10 rounded-lg border-2 border-[#173b6c] bg-white px-4 py-1.5 text-sm font-semibold text-[#173b6c]">
            Lukk
          </button>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <PreviewFrame
            ctx={frameCtx}
            theme={theme}
            content={page.content}
            selectedId={null}
            device={device}
            scrollTo={null}
            onSelect={noop}
            onCommand={noop}
            editable={false}
            title={`Forhåndsvisning av ${def.label}`}
          />
        </div>
      </div>
    </dialog>
  );
}
