import type { CSSProperties } from "react";
import { signType } from "@/components/brand";

type House = { sign: string; wall: string; plate: string; ink: string; roof: "saltak" | "flatt"; width: number; height: number };

/** Gata fra nettgata.no i skumring: de samme trehusfargene, med lys i vinduene. */
const houses: House[] = [
  { sign: "Frisør", wall: "#c9dce6", plate: "#173b6c", ink: "#ffffff", roof: "saltak", width: 124, height: 150 },
  { sign: "Rørlegger", wall: "#e3b04b", plate: "#1b232b", ink: "#ffffff", roof: "flatt", width: 142, height: 190 },
  { sign: "Kafé", wall: "#a13a2c", plate: "#f7f3ea", ink: "#1b232b", roof: "saltak", width: 120, height: 160 },
  { sign: "Regnskap", wall: "#e6e1d7", plate: "#2f5a47", ink: "#ffffff", roof: "flatt", width: 134, height: 206 },
  { sign: "Klær", wall: "#2f5a47", plate: "#f7f3ea", ink: "#1b232b", roof: "saltak", width: 116, height: 140 },
];

/**
 * Bare pynt (aria-hidden). `compact` er stripen nederst på mobil, der husene er mindre og kuttes i kantene
 * i stedet for å gjøre siden bredere.
 */
export function Skyline({ compact = false }: { compact?: boolean }) {
  const scale = compact ? 0.5 : 1;
  return (
    <div aria-hidden="true" className="w-full overflow-hidden">
      <div className="flex items-end justify-center gap-2">
        {houses.map((h, i) => (
          <div key={h.sign} className="gata-facade flex shrink-0 flex-col items-center" style={{ width: h.width * scale, "--i": i } as CSSProperties}>
            {h.roof === "saltak" ? (
              <span className="block w-[calc(100%+10px)] bg-[#2b3238] [clip-path:polygon(50%_0,100%_100%,0_100%)]" style={{ height: 34 * scale }} />
            ) : (
              <span className="block h-2 w-[calc(100%+8px)] rounded-[2px] bg-[#2b3238]" />
            )}
            <div className="gata-panel flex w-full flex-col items-center" style={{ background: h.wall, height: h.height * scale, gap: 10 * scale, paddingTop: 12 * scale }}>
              <span
                className={`${signType} rounded-[3px] leading-none shadow-[0_1px_0_rgb(0_0_0/0.25)]`}
                style={{ background: h.plate, color: h.ink, fontSize: compact ? 7 : 12, padding: compact ? "2px 5px 1px" : "4px 9px 3px" }}
              >
                {h.sign}
              </span>
              <span className="grid grid-cols-2" style={{ gap: 6 * scale }}>
                {[0, 1, 2, 3].map((w) => (
                  <span
                    key={w}
                    className="block rounded-[2px] shadow-[inset_0_0_0_1.5px_rgb(0_0_0/0.18)]"
                    style={{ width: 26 * scale, height: 30 * scale, background: (i + w) % 3 === 0 ? "#f3f5f6" : "#fbe7a8" }}
                  />
                ))}
              </span>
              <span className="mt-auto block rounded-t-[3px]" style={{ width: 26 * scale, height: 40 * scale, background: h.plate }} />
            </div>
          </div>
        ))}
        <div
          className="gata-facade flex shrink-0 items-center justify-center rounded-t-sm border-2 border-b-0 border-dashed border-white/45"
          style={{ width: 112 * scale, height: 150 * scale, "--i": houses.length } as CSSProperties}
        >
          <span className={`${signType} rounded-[3px] border-2 border-white/80 leading-none text-white`} style={{ fontSize: compact ? 7 : 12, padding: compact ? "2px 5px 1px" : "4px 9px 3px" }}>
            Ledig
          </span>
        </div>
      </div>
      {/* Veien, med midtstripe i okergult. */}
      <div className={`flex items-center bg-[#1b232b] ${compact ? "h-5" : "h-24"}`}>
        <span className="block h-1 w-full bg-[repeating-linear-gradient(90deg,#e3b04b_0_28px,transparent_28px_56px)] opacity-80" />
      </div>
    </div>
  );
}
