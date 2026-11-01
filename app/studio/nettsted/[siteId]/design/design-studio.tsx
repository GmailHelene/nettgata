"use client";

import { useMemo, useState, useTransition } from "react";
import type { RenderContext } from "@/components/sections";
import { FormStatus } from "@/components/studio/form-status";
import { PreviewFrame, type Device } from "@/components/studio/preview-frame";
import { ThemeGallery, type PreviewPage } from "@/components/studio/theme-gallery";
import type { ActionState } from "@/app/studio/actions";
import { fontPairs, resolveTheme, styleOptions, themeContrastProblems, type FontKey, type Theme } from "@/lib/theme";
import { buildTheme, presetOf } from "@/lib/themes";
import { saveThemeAction } from "@/app/studio/site-actions";

type View = "temaer" | "tilpass";
const noop = () => {};

const colorFields = [
  ["primary", "Hovedfarge", "Knapper, lenker og farget meny"],
  ["onPrimary", "Tekst på hovedfarge", "Teksten på knappene"],
  ["background", "Bakgrunn", "Hele siden"],
  ["surface", "Flater", "Kort, bokser og bunntekst"],
  ["text", "Tekst", "Overskrifter og brødtekst"],
  ["muted", "Dempet tekst", "Forklaringer og små tekster"],
  ["accent", "Pynt", "Ikoner, streker og rammer"],
] as const;

type StyleField = keyof typeof styleOptions;
const styleFields = Object.keys(styleOptions) as StyleField[];

/** Samme tema som det lagrede, felt for felt. Brukes for å vise om noe er endret og ikke lagret. */
const same = (a: Theme, b: Theme) => JSON.stringify(resolveTheme(a)) === JSON.stringify(resolveTheme(b));

export function DesignStudio({
  siteId,
  saved: initial,
  recommended,
  pages,
  ctx,
}: {
  siteId: string;
  saved: Theme;
  recommended: string[];
  pages: PreviewPage[];
  ctx: RenderContext;
}) {
  const [view, setView] = useState<View>("temaer");
  const [saved, setSaved] = useState(initial);
  const [theme, setTheme] = useState(initial);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const preset = presetOf(saved);

  const save = (next: Theme) =>
    startTransition(async () => {
      const result = await saveThemeAction(siteId, next);
      setState(result);
      if (result?.ok) {
        setSaved(next);
        setTheme(next);
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Design</h1>
          <p className="mt-1 max-w-2xl text-neutral-700">
            {preset ? (
              <>
                Nettstedet bruker <strong>{preset.def.label}</strong> med fargene <strong>{preset.palette.label}</strong>
                {!same(saved, buildTheme(preset.def.key, preset.palette.key)!) && ", tilpasset"}.{" "}
              </>
            ) : (
              "Nettstedet har et eget oppsett fra før temaene kom. "
            )}
            Et nytt tema endrer bare utseendet. Tekstene, bildene og sidene dine står urørt.
          </p>
        </div>
        <div role="tablist" aria-label="Design" className="flex overflow-hidden rounded-md border border-[#173b6c] text-sm font-semibold">
          {(
            [
              ["temaer", "Temaer"],
              ["tilpass", "Tilpass"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className="px-4 py-2 aria-selected:bg-[#173b6c] aria-selected:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <FormStatus state={state} />

      {view === "temaer" ? (
        <ThemeGallery
          recommended={recommended}
          value={null}
          current={saved.preset ? { theme: saved.preset.theme, palette: saved.preset.palette } : null}
          pages={pages}
          ctx={ctx}
          confirm
          chooseLabel={pending ? "Lagrer..." : "Bruk på nettstedet"}
          onChoose={(c) => {
            const next = buildTheme(c.theme, c.palette);
            if (next) save(next);
          }}
        />
      ) : (
        <Customizer
          theme={theme}
          saved={saved}
          pages={pages}
          ctx={ctx}
          pending={pending}
          onChange={setTheme}
          onSave={() => save(theme)}
          onReset={() => setTheme(saved)}
        />
      )}
    </div>
  );
}

function Customizer({
  theme,
  saved,
  pages,
  ctx,
  pending,
  onChange,
  onSave,
  onReset,
}: {
  theme: Theme;
  saved: Theme;
  pages: PreviewPage[];
  ctx: RenderContext;
  pending: boolean;
  onChange: (theme: Theme) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const [device, setDevice] = useState<Device>("datamaskin");
  const [path, setPath] = useState(pages.find((p) => p.path === "/")?.path ?? pages[0]?.path ?? "/");
  const page = pages.find((p) => p.path === path) ?? pages[0];
  const frameCtx = useMemo(() => ({ ...ctx, path: page?.path ?? "/" }), [ctx, page?.path]);
  const resolved = resolveTheme(theme);
  const problems = themeContrastProblems(theme);
  const changed = !same(theme, saved);
  const preset = presetOf(theme);
  const set = (patch: Partial<Theme>) => onChange({ ...theme, ...patch });

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-6">
        {preset && (
          <section className="space-y-3 rounded-lg border bg-white p-5">
            <h2 className="font-semibold">Fargevarianter i {preset.def.label}</h2>
            <div className="flex flex-wrap gap-2">
              {preset.def.palettes.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={theme.preset?.palette === p.key}
                  onClick={() => set({ ...p.colors, preset: { theme: preset.def.key, palette: p.key } })}
                  className="flex items-center gap-2 rounded-full border border-neutral-300 py-1 pl-1 pr-3 text-sm aria-pressed:border-[#173b6c] aria-pressed:ring-1 aria-pressed:ring-[#173b6c]"
                >
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]"
                    style={{ background: `linear-gradient(135deg, ${p.colors.background} 0 50%, ${p.colors.primary} 50% 100%)` }}
                  />
                  {p.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Farger</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {colorFields.map(([key, label, hint]) => (
              <label key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={resolved[key]}
                  onChange={(e) => set({ [key]: e.target.value } as Partial<Theme>)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                />
                <span className="text-sm">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-neutral-600">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {problems.length > 0 && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-semibold">Dette kan ikke lagres, fordi noen ikke vil klare å lese teksten:</p>
              <ul className="mt-1 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Stil</h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Fonter</span>
            <select
              value={resolved.fonts}
              onChange={(e) => set({ fonts: e.target.value as FontKey })}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            >
              {(Object.keys(fontPairs) as FontKey[]).map((k) => (
                <option key={k} value={k}>
                  {fontPairs[k].label}: {fontPairs[k].names}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-2xl" style={{ fontFamily: fontPairs[resolved.fonts].heading }}>
              Slik ser overskriftene ut
            </span>
          </label>
          {styleFields.map((field) => (
            <fieldset key={field}>
              <legend className="mb-1.5 text-sm font-medium">{styleOptions[field].label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(styleOptions[field].options).map(([key, label]) => (
                  <label
                    key={key}
                    className="cursor-pointer rounded-full border border-neutral-300 px-3 py-1 text-sm has-[:checked]:border-[#173b6c] has-[:checked]:bg-[#173b6c] has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700"
                  >
                    <input
                      type="radio"
                      name={`stil-${field}`}
                      value={key}
                      checked={resolved[field] === key}
                      onChange={() => set({ [field]: key } as Partial<Theme>)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-neutral-50/95 py-4 backdrop-blur">
          <button
            type="button"
            disabled={pending || !changed || problems.length > 0}
            onClick={onSave}
            className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Lagrer..." : "Lagre designet"}
          </button>
          <button type="button" disabled={!changed} onClick={onReset} className="rounded-md border border-[#173b6c] px-5 py-3 font-semibold disabled:opacity-50">
            Angre endringene
          </button>
          {changed && <span className="text-sm text-neutral-700">Ikke lagret ennå</span>}
        </div>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">Side</span>
            <select value={page?.path} onChange={(e) => setPath(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1.5">
              {pages.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Skjermstørrelse" className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
            {(["datamaskin", "mobil"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                className="px-3 py-1.5 font-medium capitalize aria-pressed:bg-[#173b6c] aria-pressed:text-white"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[calc(100dvh-7rem)] min-h-[520px] overflow-hidden rounded-lg border border-neutral-300 bg-neutral-200">
          {page && (
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
              title="Forhåndsvisning av designet"
            />
          )}
        </div>
      </div>
    </div>
  );
}
