import { addDays, osloDate, parseOsloDate } from "@/lib/oslo-time";
import type { SiteInfo } from "@/lib/site-info";

/**
 * Åpningstidene står som fri tekst i Innstillinger («Mandag til fredag», «07.00 - 16.00»), så kunden kan skrive
 * som hun vil. Her tolkes de til strukturerte data for Google. Det som ikke kan tolkes sikkert, hoppes over,
 * så Google aldri får feil tider. Teksten på nettstedet vises alltid slik kunden skrev den.
 */

const dayNames: [RegExp, string][] = [
  [/^man(dag|d)?\.?$/, "Monday"],
  [/^tir(sdag|s)?\.?$/, "Tuesday"],
  [/^ons(dag)?\.?$/, "Wednesday"],
  [/^tor(sdag|s)?\.?$/, "Thursday"],
  [/^fre(dag)?\.?$/, "Friday"],
  [/^l(ø|o)r(dag)?\.?$/, "Saturday"],
  [/^s(ø|o)n(dag)?\.?$/, "Sunday"],
];
const week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function dayOf(word: string): number | null {
  const w = word.trim().toLowerCase();
  const hit = dayNames.find(([re]) => re.test(w));
  return hit ? week.indexOf(hit[1]) : null;
}

/** «Mandag til fredag», «man-fre», «lørdag og søndag», «hverdager». Null når teksten ikke kan tolkes. */
export function parseDays(text: string): string[] | null {
  const t = text.trim().toLowerCase();
  if (/^(hverdager|ukedager|alle hverdager)$/.test(t)) return week.slice(0, 5);
  if (/^(helg|helger|helgen)$/.test(t)) return week.slice(5);
  if (/^(alle dager|hver dag|daglig)$/.test(t)) return [...week];
  const days = new Set<number>();
  for (const part of t.split(/\s*(?:,|&|\bog\b)\s*/)) {
    if (!part) continue;
    const range = part.split(/\s*(?:-|–|—|\btil\b)\s*/);
    if (range.length === 2) {
      const [from, to] = range.map(dayOf);
      if (from === null || to === null || to < from) return null;
      for (let d = from; d <= to; d++) days.add(d);
    } else if (range.length === 1) {
      const d = dayOf(part);
      if (d === null) return null;
      days.add(d);
    } else return null;
  }
  return days.size ? [...days].sort((a, b) => a - b).map((d) => week[d]) : null;
}

const clock = (h: string, m = "00") => {
  const hour = Number(h);
  const minute = Number(m);
  if (hour > 24 || minute > 59 || (hour === 24 && minute > 0)) return null;
  // 24.00 finnes ikke i schema.org. Midnatt som stengetid skrives som 23:59.
  return hour === 24 ? "23:59" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/**
 * «07.00 - 16.00», «8-16», «10:00 til 14:00, 16-20». Tom liste betyr stengt.
 * Null når teksten ikke kan tolkes, som «Kun akutt» eller «Etter avtale».
 */
export function parseTimes(text: string): { opens: string; closes: string }[] | null {
  const t = text.trim().toLowerCase();
  if (/^stengt\.?$/.test(t)) return [];
  const parts = t.split(/\s*(?:,|\bog\b)\s*/).filter(Boolean);
  const out: { opens: string; closes: string }[] = [];
  for (const part of parts) {
    const m = /^(?:kl\.?\s*)?(\d{1,2})(?:[.:](\d{2}))?\s*(?:-|–|—|til)\s*(\d{1,2})(?:[.:](\d{2}))?$/.exec(part);
    if (!m) return null;
    const opens = clock(m[1], m[2]);
    const closes = clock(m[3], m[4]);
    if (!opens || !closes) return null;
    out.push({ opens, closes });
  }
  return out.length ? out : null;
}

/** Avvikende dager fra i dag og fremover, sortert etter dato. */
export function upcomingSpecialHours(info: SiteInfo, now = new Date()): SiteInfo["specialHours"] {
  const today = osloDate(now);
  return info.specialHours.filter((s) => s.date >= today && parseOsloDate(s.date)).sort((a, b) => a.date.localeCompare(b.date));
}

/** Avvikende dager som vises på nettstedet: de neste 60 dagene, så en lang liste ikke tar over. */
export function visibleSpecialHours(info: SiteInfo, now = new Date()): SiteInfo["specialHours"] {
  const last = addDays(osloDate(now), 60);
  return upcomingSpecialHours(info, now).filter((s) => s.date <= last);
}

type Spec = Record<string, unknown>;

/** openingHoursSpecification og specialOpeningHoursSpecification til LocalBusiness. */
export function openingHoursSchema(info: SiteInfo, now = new Date()): { openingHoursSpecification?: Spec[]; specialOpeningHoursSpecification?: Spec[] } {
  const regular: Spec[] = [];
  for (const h of info.openingHours) {
    const days = parseDays(h.day);
    const times = parseTimes(h.time);
    if (!days || !times) continue;
    // Stengte dager tas ikke med. Dager uten tider regnes som stengt av Google.
    for (const { opens, closes } of times) regular.push({ "@type": "OpeningHoursSpecification", dayOfWeek: days, opens, closes });
  }
  const special: Spec[] = [];
  for (const s of upcomingSpecialHours(info, now)) {
    const times = parseTimes(s.time);
    if (!times) continue;
    const base = { "@type": "OpeningHoursSpecification", validFrom: s.date, validThrough: s.date };
    // Stengt hele dagen skrives som åpner og stenger 00:00, slik Google anbefaler.
    if (times.length === 0) special.push({ ...base, opens: "00:00", closes: "00:00" });
    for (const { opens, closes } of times) special.push({ ...base, opens, closes });
  }
  return {
    ...(regular.length && { openingHoursSpecification: regular }),
    ...(special.length && { specialOpeningHoursSpecification: special }),
  };
}

const dayFormat = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Oslo" });

/** «onsdag 24. desember». */
export function formatSpecialDate(date: string): string {
  const at = parseOsloDate(date);
  return at ? dayFormat.format(at) : date;
}
