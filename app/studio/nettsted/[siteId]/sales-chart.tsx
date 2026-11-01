import { formatNok } from "@/lib/shop/money";
import type { DailySales } from "@/lib/shop/reports";

const compact = new Intl.NumberFormat("nb-NO", { notation: "compact", maximumFractionDigits: 1 });

/** Runder toppen av aksen opp til et pent tall: 1, 2, 2,5 eller 5 ganger en tierpotens (i kroner). */
function niceMaxOre(maxOre: number): number {
  const kr = Math.max(maxOre / 100, 100);
  const pow = 10 ** Math.floor(Math.log10(kr));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= kr)! * pow;
  return step * 100;
}

function dayLabel(date: string, withWeekday = false): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("nb-NO", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withWeekday ? { weekday: "short" } : {}),
  });
}

/**
 * Søyle per dag de siste 30 dagene. Én serie, så tittelen sier hva som vises og det trengs ingen forklaring.
 * Hver dag er et fokuserbart område med verktøytips, og tallene finnes også som tabell.
 */
export function SalesChart({ daily }: { daily: DailySales[] }) {
  const max = niceMaxOre(Math.max(...daily.map((d) => d.ore)));
  const ticks = [max, max / 2, 0];
  const last = daily.length - 1;

  return (
    <figure>
      <div className="relative h-44 pl-12">
        {ticks.map((t, i) => (
          <div key={t} aria-hidden="true" className="absolute left-12 right-0 border-t border-neutral-200" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
            <span className="absolute -left-12 w-10 -translate-y-1/2 text-right text-xs tabular-nums text-neutral-500">{compact.format(t / 100)}</span>
          </div>
        ))}
        <ol className="relative flex h-full items-end gap-[2px]">
          {daily.map((d, i) => {
            const label = i === last ? `I dag, ${dayLabel(d.date)}` : dayLabel(d.date, true);
            const tipPosition = i < 4 ? "left-0" : i > last - 4 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <li
                key={d.date}
                tabIndex={0}
                aria-label={`${label}: ${formatNok(d.ore)}, ${d.orders} ordre`}
                className="group relative flex h-full flex-1 items-end justify-center rounded-t outline-none hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-[#173b6c]"
              >
                <span
                  aria-hidden="true"
                  className="block w-full max-w-6 rounded-t bg-neutral-700 group-hover:bg-[#0f2c55] group-focus-visible:bg-neutral-950"
                  style={{ height: `${(d.ore / max) * 100}%`, minHeight: d.ore > 0 ? 2 : 0 }}
                />
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max rounded-md bg-[#173b6c] px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-visible:block ${tipPosition}`}
                >
                  <span className="block font-semibold">{label}</span>
                  {formatNok(d.ore)} · {d.orders} ordre
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between pl-12 text-xs text-neutral-500">
        <span>{dayLabel(daily[0].date)}</span>
        <span>{dayLabel(daily[Math.floor(last / 2)].date)}</span>
        <span>I dag</span>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-neutral-600 underline">Vis som tabell</summary>
        <table className="mt-2 w-full max-w-sm tabular-nums">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 font-medium">Dag</th>
              <th className="py-1 text-right font-medium">Salg</th>
              <th className="py-1 text-right font-medium">Ordre</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.date} className="border-b last:border-0">
                <td className="py-1">{dayLabel(d.date, true)}</td>
                <td className="py-1 text-right">{formatNok(d.ore)}</td>
                <td className="py-1 text-right">{d.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
