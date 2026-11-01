import { and, asc, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  auditLog,
  bookingExceptions,
  bookingHours,
  bookingServices,
  bookingStaff,
  bookingStaffServices,
  bookings,
  sites,
} from "@/db/schema";
import type { PageContent } from "@/lib/content/types";
import { addDays, osloDate, osloDateTime, parseOsloDate } from "@/lib/oslo-time";
import { bookableDates, freeStarts, minuteLabel, parseMinute, SLOT_GRID_MINUTES, workingIntervals, type Busy, type ExceptionRule } from "./availability";
import { readBookingSettings, type BookingSettings } from "./settings";

/** Feil som kan vises for kunden eller bedriften slik den er. */
export class BookingError extends Error {}

/** Tiden ble tatt av en annen mellom visning og lagring. */
export class SlotTakenError extends BookingError {
  constructor() {
    super("Beklager, tiden ble nettopp tatt. Velg en annen tid.");
  }
}

export type Role = "owner" | "editor" | "developer";

/** Bare eier og redaktør kan endre tjenester, ansatte, tider og bookinger. Utvikler kan se. */
export function canEditBooking(role: Role): boolean {
  return role === "owner" || role === "editor";
}

export function assertCanEditBooking(role: Role) {
  if (!canEditBooking(role)) throw new BookingError("Bare eier og redaktør kan endre timebestillingen.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// ---------- Det kunden ser ----------

export type PublicService = { id: string; name: string; description: string; durationMinutes: number; priceOre: number | null };
export type PublicStaff = { id: string; name: string; title: string; serviceIds: string[] };
export type PublicBookingSetup = { services: PublicService[]; staff: PublicStaff[] };

/**
 * Tjenestene og de ansatte som vises i bestillingen. Null når nettstedet ikke har noen aktiv tjeneste,
 * og da vises ikke varianten «Egen booking». Tjenester ingen aktive ansatte tar, vises ikke.
 */
export async function loadPublicSetup(db: Db, siteId: string): Promise<PublicBookingSetup | null> {
  const services = await db
    .select()
    .from(bookingServices)
    .where(and(eq(bookingServices.siteId, siteId), eq(bookingServices.active, true)))
    .orderBy(asc(bookingServices.sortOrder), asc(bookingServices.name));
  if (!services.length) return null;
  const staff = await db
    .select()
    .from(bookingStaff)
    .where(and(eq(bookingStaff.siteId, siteId), eq(bookingStaff.active, true)))
    .orderBy(asc(bookingStaff.sortOrder), asc(bookingStaff.name));
  const links = staff.length
    ? await db.select().from(bookingStaffServices).where(inArray(bookingStaffServices.staffId, staff.map((s) => s.id)))
    : [];
  const activeIds = new Set(services.map((s) => s.id));
  const publicStaff = staff
    .map((s) => ({ id: s.id, name: s.name, title: s.title, serviceIds: links.filter((l) => l.staffId === s.id && activeIds.has(l.serviceId)).map((l) => l.serviceId) }))
    .filter((s) => s.serviceIds.length > 0);
  const taken = new Set(publicStaff.flatMap((s) => s.serviceIds));
  return {
    services: services
      .filter((s) => taken.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, description: s.description, durationMinutes: s.durationMinutes, priceOre: s.priceOre })),
    staff: publicStaff,
  };
}

type Plan = {
  settings: BookingSettings;
  service: typeof bookingServices.$inferSelect;
  staff: (typeof bookingStaff.$inferSelect)[];
  hours: (typeof bookingHours.$inferSelect)[];
  exceptions: (typeof bookingExceptions.$inferSelect)[];
  busy: Map<string, Busy[]>;
};

/** Alt som trengs for å regne ut ledige tider for én tjeneste, hentet i fem spørringer. */
async function loadPlan(db: Db, siteId: string, serviceId: string, staffId: string | null, from: Date, to: Date): Promise<Plan | null> {
  if (!isUuid(siteId) || !isUuid(serviceId) || (staffId !== null && !isUuid(staffId))) return null;
  const [site] = await db.select({ booking: sites.booking }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return null;
  const [service] = await db
    .select()
    .from(bookingServices)
    .where(and(eq(bookingServices.id, serviceId), eq(bookingServices.siteId, siteId), eq(bookingServices.active, true)))
    .limit(1);
  if (!service) return null;
  const staff = await db
    .select({ s: bookingStaff })
    .from(bookingStaff)
    .innerJoin(bookingStaffServices, and(eq(bookingStaffServices.staffId, bookingStaff.id), eq(bookingStaffServices.serviceId, service.id)))
    .where(and(eq(bookingStaff.siteId, siteId), eq(bookingStaff.active, true), staffId ? eq(bookingStaff.id, staffId) : undefined))
    .orderBy(asc(bookingStaff.sortOrder), asc(bookingStaff.name));
  const staffIds = staff.map((r) => r.s.id);
  if (!staffIds.length) return { settings: readBookingSettings(site.booking), service, staff: [], hours: [], exceptions: [], busy: new Map() };
  const [hours, exceptions, taken] = await Promise.all([
    db.select().from(bookingHours).where(inArray(bookingHours.staffId, staffIds)),
    db
      .select()
      .from(bookingExceptions)
      .where(
        and(
          eq(bookingExceptions.siteId, siteId),
          gte(bookingExceptions.endDate, osloDate(from)),
          or(isNull(bookingExceptions.staffId), inArray(bookingExceptions.staffId, staffIds)),
        ),
      ),
    db
      .select({ staffId: bookings.staffId, startsAt: bookings.startsAt, blockedUntil: bookings.blockedUntil })
      .from(bookings)
      .where(and(inArray(bookings.staffId, staffIds), eq(bookings.status, "bekreftet"), lt(bookings.startsAt, to), gt(bookings.blockedUntil, from))),
  ]);
  const busy = new Map<string, Busy[]>();
  for (const b of taken) if (b.staffId) busy.set(b.staffId, [...(busy.get(b.staffId) ?? []), b]);
  return { settings: readBookingSettings(site.booking), service, staff: staff.map((r) => r.s), hours, exceptions, busy };
}

const rule = (e: typeof bookingExceptions.$inferSelect): ExceptionRule => ({
  kind: e.kind,
  startDate: e.startDate,
  endDate: e.endDate,
  startMinute: e.startMinute,
  endMinute: e.endMinute,
});

/** Ledige starttider per dato og ansatt. Ansatte i rekkefølgen fra studioet, så «første ledige» blir forutsigbar. */
function computeFree(plan: Plan, dates: string[], now: Date): Map<string, { staffId: string; minutes: number[] }[]> {
  const earliest = new Date(now.getTime() + plan.settings.noticeHours * 3_600_000);
  const siteRules = plan.exceptions.filter((e) => e.staffId === null).map(rule);
  const out = new Map<string, { staffId: string; minutes: number[] }[]>();
  for (const date of dates) {
    const perStaff = plan.staff.map((s) => ({
      staffId: s.id,
      minutes: freeStarts({
        date,
        durationMinutes: plan.service.durationMinutes,
        bufferMinutes: plan.service.bufferMinutes,
        stepMinutes: plan.settings.stepMinutes,
        intervals: workingIntervals(
          date,
          plan.hours.filter((h) => h.staffId === s.id),
          siteRules,
          plan.exceptions.filter((e) => e.staffId === s.id).map(rule),
        ),
        busy: plan.busy.get(s.id) ?? [],
        earliest,
      }),
    }));
    out.set(date, perStaff);
  }
  return out;
}

function window(now: Date, settings: BookingSettings) {
  const dates = bookableDates(now, settings.maxDaysAhead);
  const from = parseOsloDate(dates[0])!;
  const to = parseOsloDate(addDays(dates[dates.length - 1], 1))!;
  return { dates, from, to };
}

/** Datoene med minst én ledig tid. staffId null betyr «første ledige». */
export async function availableDates(db: Db, siteId: string, serviceId: string, staffId: string | null, now = new Date()): Promise<string[]> {
  const probe = await loadPlan(db, siteId, serviceId, staffId, now, now);
  if (!probe || !probe.staff.length) return [];
  const { dates, from, to } = window(now, probe.settings);
  const plan = await loadPlan(db, siteId, serviceId, staffId, from, to);
  if (!plan) return [];
  const free = computeFree(plan, dates, now);
  return dates.filter((d) => free.get(d)!.some((s) => s.minutes.length > 0));
}

export type FreeTime = { minute: number; label: string };

/** Ledige tider en dato. Med «første ledige» vises en tid når minst én ansatt er ledig. */
export async function availableTimes(db: Db, siteId: string, serviceId: string, staffId: string | null, date: string, now = new Date()): Promise<FreeTime[]> {
  const day = parseOsloDate(date);
  if (!day) return [];
  const probe = await loadPlan(db, siteId, serviceId, staffId, now, now);
  if (!probe || !probe.staff.length) return [];
  if (!window(now, probe.settings).dates.includes(date)) return [];
  const plan = await loadPlan(db, siteId, serviceId, staffId, day, parseOsloDate(addDays(date, 1))!);
  if (!plan) return [];
  const minutes = new Set(computeFree(plan, [date], now).get(date)!.flatMap((s) => s.minutes));
  return [...minutes].sort((a, b) => a - b).map((minute) => ({ minute, label: minuteLabel(minute) }));
}

// ---------- Bestilling ----------

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Skriv navnet ditt").max(100, "Navnet er for langt"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, "E-postadressen er for lang")
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Sjekk e-postadressen, så bekreftelsen kommer fram"),
  phone: z.string().trim().max(30, "Telefonnummeret er for langt").default(""),
  message: z.string().trim().max(1000, "Meldingen er for lang").default(""),
});
export type ContactInput = z.input<typeof contactSchema>;

export type CreateBookingInput = { siteId: string; serviceId: string; staffId: string | null; date: string; time: string; contact: ContactInput };

/** Avbestillingsnøkkelen sendes bare i e-posten. Databasen har bare hashen. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e.code === "23505") return true;
  }
  return false;
}

export type BookingRow = {
  id: string;
  siteId: string;
  serviceId: string;
  staffId: string;
  serviceName: string;
  staffName: string;
  priceOre: number | null;
  startsAt: Date;
  endsAt: Date;
  blockedUntil: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  message: string;
  cancelTokenHash: string;
};

/**
 * Lagrer bookingen og holder av rutene hos den ansatte i én SQL-setning. Er en av rutene tatt, stopper den unike
 * indeksen hele setningen, og ingenting lagres. Virker likt med Neon over HTTP (uten transaksjoner) og PGlite.
 */
export async function insertBooking(db: Db, row: BookingRow): Promise<void> {
  if (row.blockedUntil <= row.startsAt) throw new BookingError("Timen må vare minst fem minutter.");
  try {
    await db.execute(sql`
      with b as (
        insert into bookings (id, site_id, service_id, staff_id, service_name, staff_name, price_ore, starts_at, ends_at, blocked_until,
          customer_name, customer_email, customer_phone, message, cancel_token_hash)
        values (${row.id}::uuid, ${row.siteId}::uuid, ${row.serviceId}::uuid, ${row.staffId}::uuid, ${row.serviceName}, ${row.staffName},
          ${row.priceOre}::integer, ${row.startsAt.toISOString()}::timestamptz, ${row.endsAt.toISOString()}::timestamptz,
          ${row.blockedUntil.toISOString()}::timestamptz, ${row.customerName}, ${row.customerEmail}, ${row.customerPhone}, ${row.message},
          ${row.cancelTokenHash})
        returning id
      )
      insert into booking_slots (booking_id, staff_id, starts_at)
      select b.id, ${row.staffId}::uuid, g
      from b, generate_series(${row.startsAt.toISOString()}::timestamptz,
        ${row.blockedUntil.toISOString()}::timestamptz - make_interval(mins => ${SLOT_GRID_MINUTES}),
        make_interval(mins => ${SLOT_GRID_MINUTES})) as g
    `);
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlotTakenError();
    throw err;
  }
}

/**
 * Bestiller en time for kunden. Tiden sjekkes på nytt mot databasen. Med «første ledige» prøves de ansatte
 * i rekkefølge til én er ledig. Returnerer nøkkelen til avbestillingslenken, som bare finnes i e-posten.
 */
export async function createBooking(db: Db, input: CreateBookingInput, now = new Date()): Promise<{ bookingId: string; token: string }> {
  const contact = contactSchema.safeParse(input.contact);
  if (!contact.success) throw new BookingError(contact.error.issues[0].message);
  const minute = parseMinute(input.time);
  const day = parseOsloDate(input.date);
  if (minute === null || !day) throw new BookingError("Velg dato og tid på nytt.");

  const plan = await loadPlan(db, input.siteId, input.serviceId, input.staffId, day, parseOsloDate(addDays(input.date, 1))!);
  if (!plan || !plan.staff.length) throw new BookingError("Tjenesten kan ikke bestilles akkurat nå.");
  if (!window(now, plan.settings).dates.includes(input.date)) throw new BookingError("Datoen kan ikke bestilles. Velg en annen dato.");
  const free = computeFree(plan, [input.date], now).get(input.date)!;
  const candidates = plan.staff.filter((s) => free.find((f) => f.staffId === s.id)?.minutes.includes(minute));
  if (!candidates.length) throw new SlotTakenError();

  const startsAt = osloDateTime(input.date, minute)!;
  const endsAt = new Date(startsAt.getTime() + plan.service.durationMinutes * 60_000);
  const blockedUntil = new Date(endsAt.getTime() + plan.service.bufferMinutes * 60_000);
  const token = newToken();
  const cancelTokenHash = await hashToken(token);

  for (const staff of candidates) {
    const id = crypto.randomUUID();
    try {
      await insertBooking(db, {
        id,
        siteId: input.siteId,
        serviceId: plan.service.id,
        staffId: staff.id,
        serviceName: plan.service.name,
        staffName: staff.name,
        priceOre: plan.service.priceOre,
        startsAt,
        endsAt,
        blockedUntil,
        customerName: contact.data.name,
        customerEmail: contact.data.email,
        customerPhone: contact.data.phone,
        message: contact.data.message,
        cancelTokenHash,
      });
      await db.insert(auditLog).values({ siteId: input.siteId, action: "booking.created", detail: { bookingId: id } });
      return { bookingId: id, token };
    } catch (err) {
      if (!(err instanceof SlotTakenError)) throw err;
    }
  }
  throw new SlotTakenError();
}

// ---------- Avbestilling ----------

export type BookingRecord = typeof bookings.$inferSelect;

/** Avbestiller og frigjør rutene i én setning. Null hvis bookingen ikke finnes eller allerede er avbestilt. */
async function cancel(db: Db, siteId: string, bookingId: string, by: "kunde" | "bedrift", now: Date): Promise<BookingRecord | null> {
  await db.execute(sql`
    with freed as (delete from booking_slots where booking_id = ${bookingId}::uuid)
    update bookings set status = 'avbestilt', cancelled_by = ${by}, cancelled_at = ${now.toISOString()}::timestamptz
    where id = ${bookingId}::uuid and site_id = ${siteId}::uuid and status = 'bekreftet'
  `);
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.siteId, siteId)))
    .limit(1);
  return row && row.status === "avbestilt" && row.cancelledAt?.getTime() === now.getTime() ? row : null;
}

export async function findByToken(db: Db, siteId: string, token: string): Promise<BookingRecord | null> {
  if (!isUuid(siteId) || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.siteId, siteId), eq(bookings.cancelTokenHash, await hashToken(token))))
    .limit(1);
  return row ?? null;
}

/** Siste tidspunkt kunden selv kan avbestille. */
export function cancelDeadline(startsAt: Date, settings: BookingSettings): Date {
  return new Date(startsAt.getTime() - settings.cancelHours * 3_600_000);
}

export type TokenCancelResult =
  | { ok: true; booking: BookingRecord }
  | { ok: false; reason: "ukjent" | "allerede" | "frist" | "passert"; booking: BookingRecord | null };

/** Avbestilling fra lenken i e-posten, innen fristen bedriften har satt. */
export async function cancelByToken(db: Db, siteId: string, token: string, now = new Date()): Promise<TokenCancelResult> {
  const booking = await findByToken(db, siteId, token);
  if (!booking) return { ok: false, reason: "ukjent", booking: null };
  if (booking.status === "avbestilt") return { ok: false, reason: "allerede", booking };
  if (booking.startsAt <= now) return { ok: false, reason: "passert", booking };
  const [site] = await db.select({ booking: sites.booking }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (now > cancelDeadline(booking.startsAt, readBookingSettings(site?.booking))) return { ok: false, reason: "frist", booking };
  const cancelled = await cancel(db, siteId, booking.id, "kunde", now);
  if (!cancelled) return { ok: false, reason: "allerede", booking };
  await db.insert(auditLog).values({ siteId, action: "booking.cancelled", detail: { bookingId: booking.id, by: "kunde" } });
  return { ok: true, booking: cancelled };
}

/** Bedriften avbestiller fra studioet. Ingen frist, men bare bekreftede timer som ikke er passert. */
export async function cancelByBusiness(db: Db, siteId: string, bookingId: string, role: Role, userId: string | null, now = new Date()): Promise<BookingRecord> {
  assertCanEditBooking(role);
  if (!isUuid(bookingId)) throw new BookingError("Fant ikke timen.");
  const [booking] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.siteId, siteId))).limit(1);
  if (!booking) throw new BookingError("Fant ikke timen.");
  if (booking.startsAt <= now) throw new BookingError("Timen er allerede passert.");
  const cancelled = await cancel(db, siteId, booking.id, "bedrift", now);
  if (!cancelled) throw new BookingError("Timen er allerede avbestilt.");
  await db.insert(auditLog).values({ siteId, userId, action: "booking.cancelled", detail: { bookingId: booking.id, by: "bedrift" } });
  return cancelled;
}

// ---------- Personvern ----------

/** Egen booking er i bruk når en publisert side har varianten, eller når det finnes lagrede bookinger. */
export async function usesOwnBooking(db: Db, siteId: string, published: readonly PageContent[]): Promise<boolean> {
  if (published.some((c) => c.sections.some((s) => s.type === "bestill" && s.variant === "egen"))) return true;
  const [row] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.siteId, siteId)).limit(1);
  return Boolean(row);
}
