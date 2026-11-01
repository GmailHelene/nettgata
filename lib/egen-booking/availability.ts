import { addDays, osloDate, osloDateTime } from "@/lib/oslo-time";
import { holidayName } from "./holidays";

/**
 * Ledige tider, regnet ut på serveren i norsk tid. Portet fra Bestilly (lib/availability.ts) og utvidet med
 * ansatte, buffer, unntak per ansatt og perioder. Ren kode uten database, så den kan testes direkte.
 *
 * Reglene for én ansatt én dag:
 * 1. Stengt for hele nettstedet, eller stengt for den ansatte: ingen tider.
 * 2. Egne tider for den ansatte erstatter ukerytmen. Ellers gjelder ukerytmen.
 * 3. En helligdag er stengt, med mindre nettstedet eller den ansatte har «åpent» eller «egne tider» den dagen.
 * 4. Egne tider for hele nettstedet begrenser dagen til de tidene.
 */

export type WeeklyHour = { weekday: number; startMinute: number; endMinute: number };
export type ExceptionRule = {
  kind: "stengt" | "egne_tider" | "apen";
  startDate: string;
  endDate: string;
  startMinute: number | null;
  endMinute: number | null;
};
export type Busy = { startsAt: Date; blockedUntil: Date };
type Interval = { start: number; end: number };

/** Ruter i booking_slots. Varighet, buffer og klokkeslett må gå opp i dette. */
export const SLOT_GRID_MINUTES = 5;

/** ISO-ukedag: 1 er mandag, 7 er søndag. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return ((day + 6) % 7) + 1;
}

const covers = (e: ExceptionRule, date: string) => e.startDate <= date && date <= e.endDate;
const timed = (e: ExceptionRule): Interval | null =>
  e.startMinute !== null && e.endMinute !== null && e.endMinute > e.startMinute ? { start: e.startMinute, end: e.endMinute } : null;

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return out;
}

/** Når den ansatte jobber en gitt dato, i minutter etter midnatt. */
export function workingIntervals(date: string, weekly: WeeklyHour[], siteExceptions: ExceptionRule[], staffExceptions: ExceptionRule[]): Interval[] {
  const site = siteExceptions.filter((e) => covers(e, date));
  const own = staffExceptions.filter((e) => covers(e, date));
  if (site.some((e) => e.kind === "stengt") || own.some((e) => e.kind === "stengt")) return [];

  const ownTimes = own.filter((e) => e.kind === "egne_tider").map(timed).filter((i): i is Interval => i !== null);
  const weekday = isoWeekday(date);
  let base: Interval[] = ownTimes.length
    ? ownTimes
    : weekly.filter((w) => w.weekday === weekday && w.endMinute > w.startMinute).map((w) => ({ start: w.startMinute, end: w.endMinute }));

  const opened = [...site, ...own].some((e) => e.kind === "apen" || e.kind === "egne_tider");
  if (holidayName(date) && !opened) return [];

  const siteTimes = site.filter((e) => e.kind === "egne_tider").map(timed).filter((i): i is Interval => i !== null);
  if (siteTimes.length) base = intersect(base, siteTimes);
  return base.sort((a, b) => a.start - b.start);
}

export type SlotInput = {
  date: string;
  durationMinutes: number;
  bufferMinutes: number;
  stepMinutes: number;
  intervals: Interval[];
  busy: Busy[];
  /** Tidligste tidspunkt som kan bestilles: nå pluss minimum varsel. */
  earliest: Date;
};

/** Ledige starttider for én ansatt én dag, som minutter etter midnatt. */
export function freeStarts(input: SlotInput): number[] {
  const { date, durationMinutes, bufferMinutes, stepMinutes, intervals, busy, earliest } = input;
  const out: number[] = [];
  for (const interval of intervals) {
    for (let minute = interval.start; minute + durationMinutes <= interval.end; minute += stepMinutes) {
      // Klokkeslett som ikke finnes (natten sommertiden begynner) hoppes over.
      const start = osloDateTime(date, minute);
      if (!start || start < earliest) continue;
      const blockedUntil = new Date(start.getTime() + (durationMinutes + bufferMinutes) * 60_000);
      if (busy.some((b) => start < b.blockedUntil && blockedUntil > b.startsAt)) continue;
      out.push(minute);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Datoene kunden kan velge mellom, fra i dag til og med maks dager fram i tid. */
export function bookableDates(now: Date, maxDaysAhead: number): string[] {
  const today = osloDate(now);
  return Array.from({ length: maxDaysAhead + 1 }, (_, i) => addDays(today, i));
}

export function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** «09:30» til 570. Null for alt annet enn gyldige klokkeslett. */
export function parseMinute(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}
