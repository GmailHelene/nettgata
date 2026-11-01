"use client";

import { useEffect, useRef } from "react";
import type { Theme } from "@/lib/theme";
import { SectionPreview, type RenderContext } from "@/components/sections";
import { exampleSection } from "@/lib/content/examples";
import { sectionRegistry } from "@/lib/content/registry";
import { sectionTypes, type SectionType } from "@/lib/content/types";

/** Seksjonene tegnes i full bredde og krympes, så bildet viser hvordan de faktisk blir seende ut. */
const SOURCE_WIDTH = 1280;
const THUMB_WIDTH = 272;

/**
 * Velg en seksjon ut fra hvordan den ser ut, i nettstedets egne farger og fonter.
 * Hver variant har sitt eget bilde, så du slipper å gjette hva «Store kort» betyr.
 */
export function SectionLibrary({
  ctx,
  theme,
  position,
  onPick,
  onClose,
}: {
  ctx: RenderContext;
  theme: Theme;
  /** Hvor seksjonen havner, for eksempel «Under Toppseksjon». */
  position: string;
  onPick: (type: SectionType, variant: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Varer gjør ingenting på et nettsted uten butikk.
  const types = sectionTypes.filter((type) => type !== "produkter" || ctx.shop);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="bibliotek-tittel"
      className="m-auto max-h-[90vh] w-[min(1120px,calc(100%-1.5rem))] overflow-hidden rounded-xl p-0 backdrop:bg-black/50"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-start gap-4 border-b px-5 py-4">
          <div className="mr-auto">
            <h2 id="bibliotek-tittel" className="text-lg font-semibold">
              Legg til seksjon
            </h2>
            <p className="text-sm text-neutral-700">{position}</p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-md border border-[#173b6c] px-3 py-1.5 text-sm font-semibold">
            Lukk
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          {types.map((type) => {
            const def = sectionRegistry[type];
            return (
              <section key={type} aria-labelledby={`bibliotek-${type}`} className="mb-8 last:mb-0">
                <h3 id={`bibliotek-${type}`} className="font-semibold">
                  {def.label}
                </h3>
                <p className="mb-3 text-sm text-neutral-700">{def.description}</p>
                <ul className="flex flex-wrap gap-4">
                  {/* Egen booking vises bare når nettstedet har minst én aktiv tjeneste. */}
                  {def.variants.filter((v) => type !== "bestill" || v.key !== "egen" || ctx.booking).map((variant) => (
                    <li
                      key={variant.key}
                      className="relative rounded-lg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700"
                      style={{ width: THUMB_WIDTH }}
                    >
                      {/* Bare et bilde: inert gjør at lenker og skjema i eksempelet ikke kan brukes eller nås med tastatur. */}
                      <div inert aria-hidden="true" className="h-40 overflow-hidden rounded-lg border border-neutral-300 bg-white transition-shadow hover:shadow-md">
                        <div style={{ width: SOURCE_WIDTH, zoom: THUMB_WIDTH / SOURCE_WIDTH }}>
                          <SectionPreview section={exampleSection(type, variant.key)} theme={theme} ctx={ctx} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPick(type, variant.key)}
                        className="mt-2 block text-left text-sm font-medium outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {def.variants.length > 1 ? `${def.label}, ${variant.label.toLowerCase()}` : def.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
