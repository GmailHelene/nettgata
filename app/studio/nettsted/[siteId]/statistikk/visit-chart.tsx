import type { DailyVisits } from "@/lib/statistikk";

const whole = new Intl.NumberFormat("nb-NO");

/** Runder toppen av aksen opp til et pent tall: 1, 2, 2,5 eller 5 ganger en tierpotens. */
function niceMax(max: number): number {
  const value = Math.max(max, 5);
  const pow = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].find((s) => s * pow >= value)! * pow;
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
 * Besøkende per dag som søyler. Med 90 dager blir det for mange stopp for tastaturet, så grafen er ett bilde
 * med en kort beskrivelse, og alle tallene står i tabellen under.
 */
export function VisitChart({ daily, visitors }: { daily: DailyVisits[]; visitors: number }) {
  const max = niceMax(Math.max(...daily.map((d) => d.visitors)));
  const ticks = [max, max / 2, 0];
  const last = daily.length - 1;
  const busiest = daily.reduce((a, b) => (b.visitors > a.visitors ? b : a), daily[0]);
  const summary =
    visitors === 0
      ? `Ingen besøkende fra ${dayLabel(daily[0].date)} til i dag.`
      : `${whole.format(visitors)} besøkende fra ${dayLabel(daily[0].date)} til i dag. Flest ${dayLabel(busiest.date, true)} med ${whole.format(busiest.visitors)}.`;

  return (
    <figure>
      <div role="img" aria-label={`Søylediagram over besøkende per dag. ${summary}`} className="relative h-44 pl-10">
        {ticks.map((t, i) => (
          <div key={t} aria-hidden="true" className="absolute left-10 right-0 border-t border-neutral-200" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
            <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-xs tabular-nums text-neutral-600">{whole.format(t)}</span>
          </div>
        ))}
        <ol aria-hidden="true" className="relative flex h-full items-end gap-px">
          {daily.map((d, i) => (
            <li key={d.date} title={`${dayLabel(d.date, true)}: ${whole.format(d.visitors)} besøkende`} className="flex h-full flex-1 items-end justify-center">
              <span
                className={`block w-full max-w-6 rounded-t ${i === last ? "bg-[#173b6c]" : "bg-neutral-700"}`}
                style={{ height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors > 0 ? 2 : 0 }}
              />
            </li>
          ))}
        </ol>
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between pl-10 text-xs text-neutral-600">
        <span>{dayLabel(daily[0].date)}</span>
        <span>{dayLabel(daily[Math.floor(last / 2)].date)}</span>
        <span>I dag</span>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-[#47525c] underline">Vis som tabell</summary>
        <table className="mt-2 w-full max-w-sm tabular-nums">
          <caption className="sr-only">Besøkende og sidevisninger per dag, nyeste først</caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="py-1 font-medium">
                Dag
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Besøkende
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Sidevisninger
              </th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.date} className="border-b last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  {dayLabel(d.date, true)}
                </th>
                <td className="py-1 text-right">{whole.format(d.visitors)}</td>
                <td className="py-1 text-right">{whole.format(d.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
