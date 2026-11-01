/**
 * Norske offentlige helligdager («røde dager»). Portet fra Bestilly (lib/holidays.ts).
 * Timebestillingen er stengt disse dagene, med mindre bedriften har lagt inn et unntak som åpner dagen.
 */

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Første påskedag (anonym gregoriansk algoritme). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const cache = new Map<number, Map<string, string>>();

/** Alle helligdagene et år, som dato («2027-05-17») og navn. */
export function norwegianHolidays(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const days = new Map<string, string>();
  // To helligdager kan falle på samme dato, som 17. mai og andre pinsedag i 2027. Da står begge navnene.
  const list: [string, string][] = [
    [`${year}-01-01`, "Første nyttårsdag"],
    [ymd(plusDays(easter, -3)), "Skjærtorsdag"],
    [ymd(plusDays(easter, -2)), "Langfredag"],
    [ymd(easter), "Første påskedag"],
    [ymd(plusDays(easter, 1)), "Andre påskedag"],
    [`${year}-05-01`, "Arbeidernes dag"],
    [`${year}-05-17`, "Grunnlovsdagen"],
    [ymd(plusDays(easter, 39)), "Kristi himmelfartsdag"],
    [ymd(plusDays(easter, 49)), "Første pinsedag"],
    [ymd(plusDays(easter, 50)), "Andre pinsedag"],
    [`${year}-12-25`, "Første juledag"],
    [`${year}-12-26`, "Andre juledag"],
  ];
  for (const [date, name] of list) days.set(date, days.has(date) ? `${days.get(date)} og ${name.toLowerCase()}` : name);
  cache.set(year, days);
  return days;
}

/** Navnet på helligdagen, eller null. */
export function holidayName(date: string): string | null {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year)) return null;
  return norwegianHolidays(year).get(date) ?? null;
}
