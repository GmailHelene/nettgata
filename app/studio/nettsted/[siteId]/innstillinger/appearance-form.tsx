"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { ImageInput, SiteIdContext } from "@/components/studio/image-input";
import { inputClass } from "@/components/studio/info-fields";
import type { SiteLayout } from "@/lib/site-layout";
import { fontPairs, type Theme } from "@/lib/theme";
import type { ActionState } from "../../../actions";
import { saveAppearanceAction } from "../../../site-actions";

type Link = { label: string; href: string };

function LinkList({ links, onChange, max, addLabel }: { links: Link[]; onChange: (l: Link[]) => void; max: number; addLabel: string }) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs">Tekst</span>
            <input value={l.label} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs">Lenke</span>
            <input value={l.href} placeholder="/kontakt" onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} className={inputClass} />
          </label>
          <button type="button" className="mb-2 text-sm underline" onClick={() => onChange(links.filter((_, j) => j !== i))}>
            Fjern
          </button>
        </div>
      ))}
      {links.length < max && (
        <button type="button" className="text-sm underline" onClick={() => onChange([...links, { label: "", href: "" }])}>
          + {addLabel}
        </button>
      )}
    </div>
  );
}

export function AppearanceForm({ siteId, initial, fonts, radius }: { siteId: string; initial: SiteLayout; fonts: Theme["fonts"]; radius: Theme["radius"] }) {
  const [layout, setLayout] = useState<SiteLayout>(initial);
  const [font, setFont] = useState(fonts);
  const [corners, setCorners] = useState(radius);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof SiteLayout>(key: K, value: SiteLayout[K]) => setLayout({ ...layout, [key]: value });

  return (
    <SiteIdContext.Provider value={siteId}>
      <section className="mt-8 space-y-6 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Utseende</h2>

        <ImageInput label="Logo" optional value={layout.logo} onChange={(v) => set("logo", v)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Fonter</span>
            <select value={font} onChange={(e) => setFont(e.target.value as Theme["fonts"])} className={inputClass}>
              {(Object.keys(fontPairs) as Theme["fonts"][]).map((k) => (
                <option key={k} value={k}>
                  {fontPairs[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Hjørner på knapper og bilder</span>
            <select value={corners} onChange={(e) => setCorners(e.target.value as Theme["radius"])} className={inputClass}>
              <option value="skarp">Skarpe</option>
              <option value="myk">Myke</option>
              <option value="rund">Runde</option>
            </select>
          </label>
        </div>
        <p className="text-sm" style={{ fontFamily: fontPairs[font].heading }}>
          <span className="text-2xl font-bold">Slik ser overskriftene ut</span>
        </p>

        <fieldset className="space-y-3 rounded-md border border-neutral-300 p-3">
          <legend className="px-1 text-sm font-medium">Toppstripe</legend>
          <label className="block">
            <span className="mb-1 block text-xs">Tekst (f.eks. «Fri frakt over 999 kr»)</span>
            <input value={layout.announcement.text} onChange={(e) => set("announcement", { ...layout.announcement, text: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs">Lenke (valgfritt)</span>
            <input value={layout.announcement.href} onChange={(e) => set("announcement", { ...layout.announcement, href: e.target.value })} className={inputClass} />
          </label>
          <p className="text-sm font-medium">Lenker til høyre i toppstripen</p>
          <LinkList links={layout.topLinks} max={4} addLabel="Legg til lenke" onChange={(l) => set("topLinks", l)} />
        </fieldset>

        <fieldset className="space-y-3 rounded-md border border-neutral-300 p-3">
          <legend className="px-1 text-sm font-medium">Bunntekst</legend>
          <label className="block">
            <span className="mb-1 block text-xs">Kort tekst om bedriften</span>
            <textarea rows={2} value={layout.footerText} onChange={(e) => set("footerText", e.target.value)} className={inputClass} />
          </label>
          {layout.footerColumns.map((col, i) => (
            <div key={i} className="space-y-2 rounded-md bg-neutral-50 p-3">
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className="mb-1 block text-xs">Overskrift på kolonne {i + 1}</span>
                  <input
                    value={col.title}
                    onChange={(e) => set("footerColumns", layout.footerColumns.map((c, j) => (j === i ? { ...c, title: e.target.value } : c)))}
                    className={inputClass}
                  />
                </label>
                <button type="button" className="mb-2 text-sm underline" onClick={() => set("footerColumns", layout.footerColumns.filter((_, j) => j !== i))}>
                  Fjern kolonne
                </button>
              </div>
              <LinkList
                links={col.links}
                max={8}
                addLabel="Legg til lenke"
                onChange={(links) => set("footerColumns", layout.footerColumns.map((c, j) => (j === i ? { ...c, links } : c)))}
              />
            </div>
          ))}
          {layout.footerColumns.length < 3 && (
            <button type="button" className="text-sm underline" onClick={() => set("footerColumns", [...layout.footerColumns, { title: "", links: [] }])}>
              + Legg til kolonne
            </button>
          )}
        </fieldset>

        <fieldset className="grid gap-3 rounded-md border border-neutral-300 p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Sosiale medier</legend>
          {(["facebook", "instagram", "tiktok", "linkedin"] as const).map((k) => (
            <label key={k} className="block">
              <span className="mb-1 block text-xs capitalize">{k}</span>
              <input
                value={layout.social[k]}
                placeholder="https://"
                onChange={(e) => set("social", { ...layout.social, [k]: e.target.value })}
                className={inputClass}
              />
            </label>
          ))}
        </fieldset>

        <FormStatus state={state} />
        <button
          disabled={pending}
          onClick={() => startTransition(async () => setState(await saveAppearanceAction(siteId, { layout, fonts: font, radius: corners })))}
          className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Lagrer..." : "Lagre utseende"}
        </button>
      </section>
    </SiteIdContext.Provider>
  );
}
