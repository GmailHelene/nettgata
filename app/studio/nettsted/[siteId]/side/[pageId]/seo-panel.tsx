"use client";

import { ImageInput } from "@/components/studio/image-input";
import { effectiveTitle, GOOGLE_DESCRIPTION_CHARS, GOOGLE_TITLE_CHARS, seoHints } from "@/lib/content/seo";
import type { PageContent } from "@/lib/content/types";
import { inputClass } from "./fields";

type Seo = PageContent["seo"];

/** Kutter slik Google gjør, så forhåndsvisningen ikke lover mer enn det som vises. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const short = text.slice(0, max - 1);
  return `${short.slice(0, short.lastIndexOf(" ") > max / 2 ? short.lastIndexOf(" ") : short.length).trimEnd()} …`;
}

/**
 * Tittel og beskrivelse for Google, bildet som vises når siden deles, og «Fiks nå» med det som gjør
 * siden svakere i søk. Endringene er en del av kladden, så de lagres, angres og publiseres med resten.
 */
export function SeoPanel({
  open,
  onToggle,
  siteName,
  path,
  pageTitle,
  content,
  onChange,
}: {
  open: boolean;
  onToggle: () => void;
  siteName: string;
  path: string;
  pageTitle: string;
  content: PageContent;
  onChange: (seo: Seo) => void;
}) {
  const seo = content.seo ?? {};
  const hints = seoHints({ pageTitle, siteName, content });
  const title = effectiveTitle(seo.title, pageTitle, siteName);
  const description = seo.description ?? "";

  return (
    <section aria-labelledby="seo-tittel" className="mb-6 rounded-lg border border-neutral-300 bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? "seo-felter" : undefined}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left hover:bg-neutral-50"
      >
        <span className="min-w-0 flex-1">
          <span id="seo-tittel" className="block font-semibold">
            Google og deling
          </span>
          {!open && <span className="block truncate text-sm text-neutral-600">{title}</span>}
        </span>
        {hints.length > 0 && (
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
            {hints.length === 1 ? "1 ting å fikse" : `${hints.length} ting å fikse`}
          </span>
        )}
      </button>

      {open && (
        <div id="seo-felter" className="space-y-4 border-t border-neutral-200 p-4">
          {hints.length > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Fiks nå</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1 text-sm font-medium">Slik kan siden se ut i Google</p>
            {/* Bare et bilde av feltene under, så skjermlesere slipper å høre teksten to ganger. */}
            <div aria-hidden="true" className="rounded-md border border-neutral-200 p-3">
              <p className="truncate text-xs text-neutral-700">
                {siteName} · {path}
              </p>
              <p className="mt-0.5 text-lg leading-snug text-[#1a0dab]">{cut(title, GOOGLE_TITLE_CHARS)}</p>
              <p className="mt-1 text-sm text-neutral-700">
                {description ? cut(description, GOOGLE_DESCRIPTION_CHARS) : "Uten beskrivelse velger Google selv en tekstbit fra siden."}
              </p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Tittel i Google</span>
            <input
              className={inputClass}
              maxLength={70}
              value={seo.title ?? ""}
              placeholder={`${pageTitle} | ${siteName}`}
              onChange={(e) => onChange({ ...seo, title: e.target.value })}
            />
            <span className="mt-1 block text-xs text-neutral-600">
              {title.length} tegn. Google viser rundt {GOOGLE_TITLE_CHARS}. Står feltet tomt, brukes «{pageTitle} | {siteName}».
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Beskrivelse i Google</span>
            <textarea
              className={inputClass}
              rows={3}
              maxLength={170}
              value={description}
              placeholder="Én eller to setninger om hva siden handler om, med ord kundene søker på."
              onChange={(e) => onChange({ ...seo, description: e.target.value })}
            />
            <span className="mt-1 block text-xs text-neutral-600">
              {description.length} tegn. Google viser rundt {GOOGLE_DESCRIPTION_CHARS}.
            </span>
          </label>

          <div>
            <ImageInput
              label="Delingsbilde"
              optional
              value={seo.image ?? null}
              onChange={(image) => onChange({ ...seo, image: image ? { src: image.src, alt: image.alt } : null })}
            />
            <p className="mt-1 text-xs text-neutral-600">
              Vises når siden deles på Facebook, LinkedIn og i meldinger. Uten eget bilde brukes det første bildet på siden.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
