import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, bookingExceptions, bookingHours, bookingServices, bookingStaff, bookingStaffServices, bookings, sites } from "@/db/schema";
import { parseOsloDate } from "@/lib/oslo-time";
import { SLOT_GRID_MINUTES } from "./availability";
import { bookingSettingsSchema, type BookingSettings } from "./settings";
import { assertCanEditBooking, BookingError, isUuid, type Role } from "./store";

/** Det bedriften endrer i studioet. Hver funksjon sjekker rollen selv, så ingen handling kan glemme det. */

type Actor = { siteId: string; role: Role; userId: string | null };

const onGrid = (v: number) => v % SLOT_GRID_MINUTES === 0;
const log = (db: Db, a: Actor, action: string, detail: Record<string, unknown> = {}) =>
  db.insert(auditLog).values({ siteId: a.siteId, userId: a.userId, action, detail });

function first(err: z.ZodError): never {
  throw new BookingError(err.issues[0].message);
}

export async function saveBookingSettings(db: Db, a: Actor, input: Partial<BookingSettings>) {
  assertCanEditBooking(a.role);
  const parsed = bookingSettingsSchema.safeParse(input);
  if (!parsed.success) throw new BookingError("Sjekk tallene. Varsel og frist kan være 0 til 168 timer, dager fram i tid 1 til 365.");
  await db.update(sites).set({ booking: parsed.data }).where(eq(sites.id, a.siteId));
  await log(db, a, "booking.settings", parsed.data);
}

const serviceSchema = z.object({
  name: z.string().trim().min(1, "Skriv navnet på tjenesten").max(80, "Navnet kan ha maks 80 tegn"),
  description: z.string().trim().max(300, "Beskrivelsen kan ha maks 300 tegn").default(""),
  durationMinutes: z
    .number({ error: "Skriv varigheten i minutter" })
    .int()
    .min(5, "Varigheten må være minst 5 minutter")
    .max(600, "Varigheten kan være maks 10 timer")
    .refine(onGrid, "Varigheten må gå opp i hele fem minutter"),
  bufferMinutes: z.number().int().min(0).max(120, "Bufferen kan være maks 120 minutter").refine(onGrid, "Bufferen må gå opp i hele fem minutter").default(0),
  priceOre: z.number().int().min(0).max(100_000_00, "Prisen er for høy").nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export type ServiceInput = z.input<typeof serviceSchema>;

export async function saveService(db: Db, a: Actor, id: string | null, input: ServiceInput): Promise<string> {
  assertCanEditBooking(a.role);
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) first(parsed.error);
  if (id) {
    if (!isUuid(id)) throw new BookingError("Fant ikke tjenesten.");
    const updated = await db
      .update(bookingServices)
      .set(parsed.data)
      .where(and(eq(bookingServices.id, id), eq(bookingServices.siteId, a.siteId)))
      .returning({ id: bookingServices.id });
    if (!updated.length) throw new BookingError("Fant ikke tjenesten.");
    await log(db, a, "booking.service.updated", { serviceId: id });
    return id;
  }
  const [row] = await db.insert(bookingServices).values({ ...parsed.data, siteId: a.siteId }).returning({ id: bookingServices.id });
  await log(db, a, "booking.service.created", { serviceId: row.id });
  return row.id;
}

/** Bestilte timer beholder navnet på tjenesten, så sletting endrer ikke historikken. */
export async function deleteService(db: Db, a: Actor, id: string) {
  assertCanEditBooking(a.role);
  if (!isUuid(id)) return;
  await db.delete(bookingServices).where(and(eq(bookingServices.id, id), eq(bookingServices.siteId, a.siteId)));
  await log(db, a, "booking.service.deleted", { serviceId: id });
}

const hourSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((h) => h.endMinute > h.startMinute, "Sluttiden må være etter starttiden")
  .refine((h) => onGrid(h.startMinute) && onGrid(h.endMinute), "Arbeidstidene må gå opp i hele fem minutter");

const staffSchema = z.object({
  name: z.string().trim().min(1, "Skriv navnet").max(80, "Navnet kan ha maks 80 tegn"),
  title: z.string().trim().max(80, "Tittelen kan ha maks 80 tegn").default(""),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  serviceIds: z.array(z.string()).max(200).default([]),
  hours: z.array(hourSchema).max(50).default([]),
});
export type StaffInput = z.input<typeof staffSchema>;

/** Lagrer den ansatte med tjenestene og ukerytmen. Tjenester fra et annet nettsted ignoreres. */
export async function saveStaff(db: Db, a: Actor, id: string | null, input: StaffInput): Promise<string> {
  assertCanEditBooking(a.role);
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) first(parsed.error);
  const { serviceIds, hours, ...fields } = parsed.data;
  let staffId: string;
  if (id) {
    if (!isUuid(id)) throw new BookingError("Fant ikke den ansatte.");
    const updated = await db
      .update(bookingStaff)
      .set(fields)
      .where(and(eq(bookingStaff.id, id), eq(bookingStaff.siteId, a.siteId)))
      .returning({ id: bookingStaff.id });
    if (!updated.length) throw new BookingError("Fant ikke den ansatte.");
    staffId = id;
  } else {
    [{ id: staffId }] = await db.insert(bookingStaff).values({ ...fields, siteId: a.siteId }).returning({ id: bookingStaff.id });
  }
  const ownServices = serviceIds.filter(isUuid).length
    ? await db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.siteId, a.siteId), inArray(bookingServices.id, serviceIds.filter(isUuid))))
    : [];
  await db.delete(bookingStaffServices).where(eq(bookingStaffServices.staffId, staffId));
  if (ownServices.length) await db.insert(bookingStaffServices).values(ownServices.map((s) => ({ staffId, serviceId: s.id })));
  await db.delete(bookingHours).where(eq(bookingHours.staffId, staffId));
  if (hours.length) await db.insert(bookingHours).values(hours.map((h) => ({ ...h, staffId, siteId: a.siteId })));
  await log(db, a, id ? "booking.staff.updated" : "booking.staff.created", { staffId });
  return staffId;
}

/** Bestilte timer beholder navnet. Rutene den ansatte hadde, slettes sammen med den ansatte. */
export async function deleteStaff(db: Db, a: Actor, id: string) {
  assertCanEditBooking(a.role);
  if (!isUuid(id)) return;
  await db.delete(bookingStaff).where(and(eq(bookingStaff.id, id), eq(bookingStaff.siteId, a.siteId)));
  await log(db, a, "booking.staff.deleted", { staffId: id });
}

const exceptionSchema = z
  .object({
    staffId: z.string().nullable(),
    kind: z.enum(["stengt", "egne_tider", "apen"]),
    startDate: z.string().refine((v) => parseOsloDate(v) !== null, "Velg en gyldig fra-dato"),
    endDate: z.string().refine((v) => parseOsloDate(v) !== null, "Velg en gyldig til-dato"),
    startMinute: z.number().int().min(0).max(1440).nullable().default(null),
    endMinute: z.number().int().min(0).max(1440).nullable().default(null),
    note: z.string().trim().max(120, "Notatet kan ha maks 120 tegn").default(""),
  })
  .refine((e) => e.endDate >= e.startDate, "Til-datoen må være samme dag eller senere enn fra-datoen")
  .refine(
    (e) => e.kind !== "egne_tider" || (e.startMinute !== null && e.endMinute !== null && e.endMinute > e.startMinute),
    "Skriv fra og til klokkeslett for egne tider",
  )
  .refine((e) => (e.startMinute === null || onGrid(e.startMinute)) && (e.endMinute === null || onGrid(e.endMinute)), "Klokkeslettene må gå opp i hele fem minutter");
export type ExceptionInput = z.input<typeof exceptionSchema>;

export async function addException(db: Db, a: Actor, input: ExceptionInput): Promise<string> {
  assertCanEditBooking(a.role);
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) first(parsed.error);
  const e = parsed.data;
  if (e.staffId !== null) {
    if (!isUuid(e.staffId)) throw new BookingError("Fant ikke den ansatte.");
    const [own] = await db
      .select({ id: bookingStaff.id })
      .from(bookingStaff)
      .where(and(eq(bookingStaff.id, e.staffId), eq(bookingStaff.siteId, a.siteId)))
      .limit(1);
    if (!own) throw new BookingError("Fant ikke den ansatte.");
  }
  const timed = e.kind === "egne_tider";
  const [row] = await db
    .insert(bookingExceptions)
    .values({ ...e, siteId: a.siteId, startMinute: timed ? e.startMinute : null, endMinute: timed ? e.endMinute : null })
    .returning({ id: bookingExceptions.id });
  await log(db, a, "booking.exception.created", { exceptionId: row.id });
  return row.id;
}

export async function deleteException(db: Db, a: Actor, id: string) {
  assertCanEditBooking(a.role);
  if (!isUuid(id)) return;
  await db.delete(bookingExceptions).where(and(eq(bookingExceptions.id, id), eq(bookingExceptions.siteId, a.siteId)));
  await log(db, a, "booking.exception.deleted", { exceptionId: id });
}

/** Alt studioet viser, for ett nettsted. */
export async function loadStudioBooking(db: Db, siteId: string, today: string) {
  const [services, staff, links, hours, exceptions] = await Promise.all([
    db.select().from(bookingServices).where(eq(bookingServices.siteId, siteId)).orderBy(asc(bookingServices.sortOrder), asc(bookingServices.name)),
    db.select().from(bookingStaff).where(eq(bookingStaff.siteId, siteId)).orderBy(asc(bookingStaff.sortOrder), asc(bookingStaff.name)),
    db
      .select({ staffId: bookingStaffServices.staffId, serviceId: bookingStaffServices.serviceId })
      .from(bookingStaffServices)
      .innerJoin(bookingStaff, eq(bookingStaff.id, bookingStaffServices.staffId))
      .where(eq(bookingStaff.siteId, siteId)),
    db.select().from(bookingHours).where(eq(bookingHours.siteId, siteId)),
    db
      .select()
      .from(bookingExceptions)
      .where(and(eq(bookingExceptions.siteId, siteId), gte(bookingExceptions.endDate, today)))
      .orderBy(asc(bookingExceptions.startDate)),
  ]);
  return { services, staff, links, hours, exceptions };
}

/** Bookingene i et tidsrom, til oversikten per dag og uke. */
export async function listBookings(db: Db, siteId: string, from: Date, to: Date) {
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.siteId, siteId), gte(bookings.startsAt, from), lt(bookings.startsAt, to)))
    .orderBy(asc(bookings.startsAt));
}
