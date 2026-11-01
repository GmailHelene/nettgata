const dayFormat = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** «09:30» i norsk tid. */
export function formatClock(at: Date): string {
  return timeFormat.format(at);
}

/** «tirsdag 3. november kl. 09:30» i norsk tid. */
export function formatBookingTime(at: Date): string {
  return `${dayFormat.format(at)} kl. ${formatClock(at)}`;
}

/** «tirsdag 3. november» for en kalenderdato som «2026-11-03». */
export function formatDateLabel(date: string): string {
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}
