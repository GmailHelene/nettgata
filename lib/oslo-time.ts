/**
 * Norsk tid uten bibliotek. Butikkens «i dag» starter ved midnatt i Norge, ikke i UTC,
 * ellers havner salg mellom midnatt og klokka to på feil dag om sommeren.
 */
const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function osloParts(at: number) {
  const p: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(new Date(at))) p[part.type] = part.value;
  return p;
}

/** Hvor langt norsk tid ligger foran UTC i et gitt øyeblikk: én time om vinteren, to om sommeren. */
function osloOffsetMs(at: number): number {
  const p = osloParts(at);
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return local - (at - (at % 1000));
}

/** Midnatt norsk tid for en kalenderdato. Regner to ganger, så dagene med sommertidsskifte blir riktige. */
export function osloMidnight(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  const guess = utcMidnight - osloOffsetMs(utcMidnight);
  return new Date(utcMidnight - osloOffsetMs(guess));
}

/**
 * Et klokkeslett på en dato i norsk tid, som tidspunkt. minute er minutter etter midnatt (570 er 09:30).
 * Null når klokkeslettet ikke finnes den dagen, som 02:30 natten sommertiden begynner.
 */
export function osloDateTime(date: string, minute: number): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  const local = Date.UTC(y, m - 1, d, 0, minute);
  const guess = local - osloOffsetMs(local);
  const at = local - osloOffsetMs(guess);
  const p = osloParts(at);
  const back = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return back === local ? new Date(at) : null;
}

/** Kalenderdatoen i Norge, som «2026-10-31». */
export function osloDate(at: Date): string {
  const p = osloParts(at.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}

/** «2026-12-01» som midnatt norsk tid. Null for ugyldige datoer som 31. februar. */
export function parseOsloDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return osloMidnight(y, mo, d);
}

/** Legger dager til en kalenderdato: addDays("2026-10-31", 1) er «2026-11-01». */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** «1. desember» eller «1. desember 2027» når året ikke er i år. */
export function formatOsloDay(at: Date, now = new Date()): string {
  const sameYear = osloDate(at).slice(0, 4) === osloDate(now).slice(0, 4);
  return at.toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

export function formatOsloDateTime(at: Date): string {
  return at.toLocaleString("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" });
}
