import Link from "next/link";
import type { CSSProperties } from "react";
import { heading, signType } from "@/components/brand";
import type { Theme } from "@/lib/theme";
import { ui } from "./ui";

export type SiteHouseData = {
  id: string;
  name: string;
  /** For eksempel «Nettside · Rørlegger». */
  description: string;
  host: string;
  published: boolean;
  theme: Pick<Theme, "primary" | "onPrimary" | "background" | "surface">;
};

/**
 * Et nettsted i oversikten, tegnet som et hus i gata med nettstedets egne temafarger: skiltet i primærfargen
 * (paret er sjekket mot WCAG AA i temaene) og veggen i bakgrunnsfargen. Huset er bare pynt. Lenken er hele kortet,
 * og den leser opp navn, type, status og adresse.
 */
export function SiteHouse({ site, index }: { site: SiteHouseData; index: number }) {
  const t = site.theme;
  return (
    <Link href={`/studio/nettsted/${site.id}`} className="gata-facade group flex h-full flex-col rounded-xl" style={{ "--i": index } as CSSProperties}>
      <div aria-hidden="true" className="flex flex-col items-center px-7">
        {index % 2 === 0 ? (
          <span className="block h-9 w-[calc(100%+12px)] bg-[#2b3238] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
        ) : (
          <span className="mt-7 block h-2 w-[calc(100%+8px)] rounded-[2px] bg-[#2b3238]" />
        )}
        {/* Veggen er bakgrunnsfargen med et skjær av primærfargen, så husene får hver sin farge også når temaet er hvitt. */}
        <div
          className="gata-panel flex h-36 w-full flex-col items-center gap-3 px-4 pt-4 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          style={{ backgroundColor: `color-mix(in srgb, ${t.primary} 22%, ${t.background})` }}
        >
          <span
            className={`${signType} max-w-full truncate rounded-[4px] px-3 pb-[3px] pt-[5px] text-[0.8rem] leading-none shadow-[0_1px_0_rgb(0_0_0/0.25)]`}
            style={{ background: t.primary, color: t.onPrimary }}
          >
            {site.name}
          </span>
          <span className="flex gap-2">
            {[0, 1, 2].map((w) => (
              <span key={w} className="block h-7 w-6 rounded-[2px] shadow-[inset_0_0_0_1.5px_rgb(0_0_0/0.2)]" style={{ background: t.background }} />
            ))}
          </span>
          <span className="mt-auto block h-10 w-8 rounded-t-[3px]" style={{ background: t.primary }} />
        </div>
      </div>
      <div className="flex flex-1 flex-col rounded-xl border border-[#d5dbe0] bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] group-hover:border-[#173b6c] group-hover:shadow-[0_10px_24px_-14px_rgb(23_59_108/0.45)]">
        <span className={`${heading} block text-xl leading-tight`}>{site.name}</span>
        <span className={`mt-1 block text-sm ${ui.muted}`}>{site.description}</span>
        <span className="mt-4 flex items-center gap-2 text-sm font-medium">
          <span aria-hidden="true" className={`block h-2.5 w-2.5 rounded-full ${site.published ? "bg-[#2f5a47]" : "border-2 border-[#7d8a96]"}`} />
          {site.published ? "Publisert" : "Ikke publisert ennå"}
        </span>
        <span className={`mt-1 block truncate text-sm ${ui.muted}`}>{site.host}</span>
      </div>
    </Link>
  );
}

/** Den ledige tomta i enden av gata: nytt nettsted. Bare plattformadmin kan lage nettsteder. */
export function VacantPlot({ index }: { index: number }) {
  return (
    <Link
      href="/studio/nytt"
      className="gata-facade group flex h-full min-h-[18rem] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#173b6c]/45 px-6 py-8 text-center transition-colors hover:border-[#173b6c] hover:bg-white"
      style={{ "--i": index } as CSSProperties}
    >
      <span className={`${signType} rounded-[4px] border-2 border-[#173b6c] px-3 pb-[3px] pt-[5px] text-[0.8rem] leading-none text-[#173b6c]`}>Ledig tomt</span>
      <span className={`${heading} text-xl`}>Nytt nettsted</span>
      <span className={`max-w-[16rem] text-sm ${ui.muted}`}>Start med org.nr., så henter jeg navn og adresse fra Brønnøysundregistrene.</span>
    </Link>
  );
}
