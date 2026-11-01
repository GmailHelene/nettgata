import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { bookingSlots, bookings, emailLog, sites, users } from "@/db/schema";
import { SectionPreview, type RenderContext } from "@/components/sections";
import { validatePageContent } from "@/lib/content/registry";
import type { Section } from "@/lib/content/types";
import { addException, saveBookingSettings, saveService, saveStaff } from "@/lib/egen-booking/admin";
import { freeStarts, workingIntervals, type ExceptionRule, type WeeklyHour } from "@/lib/egen-booking/availability";
import { holidayName } from "@/lib/egen-booking/holidays";
import { notifyBookingCancelled, notifyBookingCreated } from "@/lib/egen-booking/notify";
import { readBookingSettings } from "@/lib/egen-booking/settings";
import {
  availableDates,
  availableTimes,
  BookingError,
  cancelByBusiness,
  cancelByToken,
  createBooking,
  hashToken,
  insertBooking,
  loadPublicSetup,
  SlotTakenError,
  usesOwnBooking,
  type CreateBookingInput,
} from "@/lib/egen-booking/store";
import { logProvider } from "@/lib/email/send";
import { sideSomTekst } from "@/lib/legal/felles";
import { lagPersonvernerklaering } from "@/lib/legal/personvern";
import { osloDateTime } from "@/lib/oslo-time";
import { runRetention } from "@/lib/retention";
import { readSiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import { createSiteFromPack } from "@/lib/sites";
import { buildTheme } from "@/lib/themes";

const ALL_WEEK: WeeklyHour[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 16 * 60 }));
const H = (h: number, m = 0) => h * 60 + m;
const never = new Date("2000-01-01T00:00:00Z");

describe("ledige tider uten database", () => {
  it("gir starttider i steg innenfor arbeidstiden, og timen må slutte før stengetid", () => {
    const starts = freeStarts({
      date: "2027-01-05",
      durationMinutes: 60,
      bufferMinutes: 0,
      stepMinutes: 30,
      intervals: [{ start: H(9), end: H(11) }],
      busy: [],
      earliest: never,
    });
    expect(starts).toEqual([H(9), H(9, 30), H(10)]);
  });

  it("tar med buffer og overlapp med andre timer", () => {
    // Opptatt 10:00 til 10:40 (30 minutter pluss 10 minutters buffer).
    const busy = [{ startsAt: osloDateTime("2027-01-05", H(10))!, blockedUntil: osloDateTime("2027-01-05", H(10, 40))! }];
    const starts = freeStarts({ date: "2027-01-05", durationMinutes: 30, bufferMinutes: 10, stepMinutes: 10, intervals: [{ start: H(9), end: H(12) }], busy, earliest: never });
    // 09:30 ville holdt av til 10:10 og kolliderer. 09:20 holder av til 10:00 og går akkurat.
    expect(starts).toContain(H(9, 20));
    expect(starts).not.toContain(H(9, 30));
    expect(starts).not.toContain(H(10, 30));
    expect(starts).toContain(H(10, 40));
  });

  it("regner riktig med sommertid og vintertid", () => {
    // Vinter: norsk tid er UTC+1. Sommer: UTC+2. Sommertiden begynner 28. mars 2027 og slutter 31. oktober 2027.
    expect(osloDateTime("2027-03-27", H(9))!.toISOString()).toBe("2027-03-27T08:00:00.000Z");
    expect(osloDateTime("2027-03-28", H(9))!.toISOString()).toBe("2027-03-28T07:00:00.000Z");
    expect(osloDateTime("2027-10-30", H(9))!.toISOString()).toBe("2027-10-30T07:00:00.000Z");
    expect(osloDateTime("2027-10-31", H(9))!.toISOString()).toBe("2027-10-31T08:00:00.000Z");
    // 02:30 finnes ikke natten sommertiden begynner, og blir ikke tilbudt.
    expect(osloDateTime("2027-03-28", H(2, 30))).toBeNull();
    const night = freeStarts({ date: "2027-03-28", durationMinutes: 30, bufferMinutes: 0, stepMinutes: 30, intervals: [{ start: H(1), end: H(4) }], busy: [], earliest: never });
    expect(night).toEqual([H(1), H(1, 30), H(3), H(3, 30)]);
  });

  it("stenger norske helligdager, med mindre bedriften åpner dem", () => {
    expect(holidayName("2027-05-17")).toBe("Grunnlovsdagen og andre pinsedag");
    expect(holidayName("2027-03-26")).toBe("Langfredag");
    expect(holidayName("2027-05-06")).toBe("Kristi himmelfartsdag");
    expect(holidayName("2027-01-05")).toBeNull();
    expect(workingIntervals("2027-05-17", ALL_WEEK, [], [])).toEqual([]);
    const open: ExceptionRule = { kind: "apen", startDate: "2027-05-17", endDate: "2027-05-17", startMinute: null, endMinute: null };
    expect(workingIntervals("2027-05-17", ALL_WEEK, [open], [])).toEqual([{ start: H(9), end: H(16) }]);
    const short: ExceptionRule = { kind: "egne_tider", startDate: "2027-05-17", endDate: "2027-05-17", startMinute: H(12), endMinute: H(14) };
    expect(workingIntervals("2027-05-17", ALL_WEEK, [short], [])).toEqual([{ start: H(12), end: H(14) }]);
  });

  it("ferie for én ansatt eller hele bedriften stenger, egne tider erstatter ukerytmen", () => {
    const ferie: ExceptionRule = { kind: "stengt", startDate: "2027-07-01", endDate: "2027-07-21", startMinute: null, endMinute: null };
    expect(workingIntervals("2027-07-10", ALL_WEEK, [], [ferie])).toEqual([]);
    expect(workingIntervals("2027-07-10", ALL_WEEK, [ferie], [])).toEqual([]);
    expect(workingIntervals("2027-07-22", ALL_WEEK, [], [ferie])).toEqual([{ start: H(9), end: H(16) }]);
    const late: ExceptionRule = { kind: "egne_tider", startDate: "2027-01-05", endDate: "2027-01-05", startMinute: H(14), endMinute: H(20) };
    expect(workingIntervals("2027-01-05", ALL_WEEK, [], [late])).toEqual([{ start: H(14), end: H(20) }]);
  });
});

let db: Db;
let siteId: string;
let otherSiteId: string;
let serviceId: string;
let anne: string;
let bjorn: string;
const owner = () => ({ siteId, role: "owner" as const, userId: null });
// Mandag 4. januar 2027 klokka 13 norsk tid.
const NOW = new Date("2027-01-04T12:00:00Z");
const DAY = "2027-01-05";

const book = (over: Partial<CreateBookingInput> = {}, now = NOW) =>
  createBooking(
    db,
    { siteId, serviceId, staffId: anne, date: DAY, time: "09:00", contact: { name: "Kari Nordmann", email: "kari@test.no", phone: "", message: "" }, ...over },
    now,
  );

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  siteId = (await createSiteFromPack(db, { name: "Salong Åsheim", packKey: "handverker", info: demoInfo, ownerId: user.id })).id;
  otherSiteId = (await createSiteFromPack(db, { name: "Annen salong", packKey: "handverker", info: demoInfo, ownerId: user.id })).id;
  serviceId = await saveService(db, owner(), null, { name: "Klipp", durationMinutes: 30, bufferMinutes: 10, priceOre: 65000 });
  const hours = ALL_WEEK;
  anne = await saveStaff(db, owner(), null, { name: "Anne", title: "Frisør", serviceIds: [serviceId], hours, sortOrder: 1 });
  bjorn = await saveStaff(db, owner(), null, { name: "Bjørn", serviceIds: [serviceId], hours, sortOrder: 2 });
});

describe("ledige tider fra databasen", () => {
  it("viser tider i arbeidstiden, med minimum varsel og maks dager fram i tid", async () => {
    const times = await availableTimes(db, siteId, serviceId, anne, DAY, NOW);
    expect(times[0].label).toBe("09:00");
    expect(times.at(-1)!.label).toBe("15:30");
    // I dag klokka 13 med to timers varsel: første tid er 15:00.
    expect((await availableTimes(db, siteId, serviceId, anne, "2027-01-04", NOW))[0].label).toBe("15:00");
    const dates = await availableDates(db, siteId, serviceId, null, NOW);
    expect(dates[0]).toBe("2027-01-04");
    expect(dates.at(-1)).toBe("2027-03-05"); // 60 dager fram
    expect(await availableTimes(db, siteId, serviceId, null, "2027-03-06", NOW)).toEqual([]);
    expect(dates).not.toContain("2027-01-01");
  });

  it("tar bort tider som overlapper en bestilt time hos samme ansatt, men ikke hos andre", async () => {
    await book();
    const anneTimes = (await availableTimes(db, siteId, serviceId, anne, DAY, NOW)).map((t) => t.label);
    expect(anneTimes).not.toContain("09:00");
    expect(anneTimes).not.toContain("09:30"); // bufferen holder av til 09:40
    expect(anneTimes).toContain("09:45");
    expect((await availableTimes(db, siteId, serviceId, bjorn, DAY, NOW)).map((t) => t.label)).toContain("09:00");
    expect((await availableTimes(db, siteId, serviceId, null, DAY, NOW)).map((t) => t.label)).toContain("09:00");
  });

  it("«første ledige» gir timen til den første som er ledig, og stopper når alle er opptatt", async () => {
    const first = await book({ staffId: null });
    const second = await book({ staffId: null, contact: { name: "Ola", email: "ola@test.no" } });
    const staffOf = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0].staffName;
    expect(await staffOf(first.bookingId)).toBe("Anne");
    expect(await staffOf(second.bookingId)).toBe("Bjørn");
    await expect(book({ staffId: null })).rejects.toBeInstanceOf(SlotTakenError);
    expect((await availableTimes(db, siteId, serviceId, null, DAY, NOW)).map((t) => t.label)).not.toContain("09:00");
  });

  it("stenger for ferie lagt inn i studioet, og helligdager med mindre de åpnes", async () => {
    await addException(db, owner(), { staffId: anne, kind: "stengt", startDate: DAY, endDate: DAY });
    expect(await availableTimes(db, siteId, serviceId, anne, DAY, NOW)).toEqual([]);
    expect((await availableTimes(db, siteId, serviceId, bjorn, DAY, NOW)).length).toBeGreaterThan(0);
    const later = new Date("2027-05-10T08:00:00Z");
    expect(await availableTimes(db, siteId, serviceId, null, "2027-05-17", later)).toEqual([]);
    await addException(db, owner(), { staffId: null, kind: "egne_tider", startDate: "2027-05-17", endDate: "2027-05-17", startMinute: H(12), endMinute: H(13) });
    expect((await availableTimes(db, siteId, serviceId, null, "2027-05-17", later)).map((t) => t.label)).toEqual(["12:00", "12:15", "12:30"]);
  });

  it("viser ikke tjenester eller ansatte fra et annet nettsted", async () => {
    expect(await availableTimes(db, otherSiteId, serviceId, null, DAY, NOW)).toEqual([]);
    await expect(createBooking(db, { siteId: otherSiteId, serviceId, staffId: null, date: DAY, time: "09:00", contact: { name: "X", email: "x@test.no" } }, NOW)).rejects.toBeInstanceOf(BookingError);
    const setup = await loadPublicSetup(db, siteId);
    expect(setup?.services.map((s) => s.name)).toEqual(["Klipp"]);
    expect(setup?.staff.map((s) => s.name)).toEqual(["Anne", "Bjørn"]);
    expect(await loadPublicSetup(db, otherSiteId)).toBeNull();
  });

  it("avviser tider som ikke er ledige og kontaktinfo som mangler", async () => {
    await expect(book({ time: "08:00" })).rejects.toBeInstanceOf(SlotTakenError);
    await expect(book({ time: "09:05" })).rejects.toBeInstanceOf(SlotTakenError);
    await expect(book({ contact: { name: "", email: "kari@test.no" } })).rejects.toThrow(/navnet/);
    await expect(book({ contact: { name: "Kari", email: "ikke-epost" } })).rejects.toThrow(/e-postadressen/);
    expect(await db.select().from(bookings)).toHaveLength(0);
  });
});

describe("dobbeltbooking", () => {
  it("er umulig når to bestiller samme tid samtidig", async () => {
    const results = await Promise.allSettled([book(), book({ contact: { name: "Ola", email: "ola@test.no" } })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(SlotTakenError);
    expect(await db.select().from(bookings).where(eq(bookings.staffId, anne))).toHaveLength(1);
  });

  it("stoppes av den unike indeksen også når kontrollen av ledige tider hoppes over", async () => {
    const row = (id: string, start: string, end: string) => ({
      id,
      siteId,
      serviceId,
      staffId: anne,
      serviceName: "Klipp",
      staffName: "Anne",
      priceOre: null,
      startsAt: new Date(start),
      endsAt: new Date(end),
      blockedUntil: new Date(end),
      customerName: "Test",
      customerEmail: "t@test.no",
      customerPhone: "",
      message: "",
      cancelTokenHash: `hash-${id}`,
    });
    // To overlappende timer med ulik start, sendt samtidig rett mot databasen.
    const results = await Promise.allSettled([
      insertBooking(db, row(crypto.randomUUID(), "2027-01-05T08:00:00Z", "2027-01-05T08:30:00Z")),
      insertBooking(db, row(crypto.randomUUID(), "2027-01-05T08:20:00Z", "2027-01-05T08:50:00Z")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(SlotTakenError);
    // Den som tapte, etterlot verken booking eller ruter.
    expect(await db.select().from(bookings)).toHaveLength(1);
    expect(await db.select().from(bookingSlots)).toHaveLength(6);
    // En time som starter når den forrige slutter, går fint.
    await insertBooking(db, row(crypto.randomUUID(), "2027-01-05T08:30:00Z", "2027-01-05T09:00:00Z"));
  });
});

describe("avbestilling", () => {
  // Torsdag 7. januar klokka 09, mer enn 24 timer etter NOW.
  const LATER = "2027-01-07";
  it("virker med lenken innen fristen, frigjør tiden og kan ikke gjøres to ganger", async () => {
    const { bookingId, token } = await book({ date: LATER });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(row.cancelTokenHash).toBe(await hashToken(token));
    expect(row.cancelTokenHash).not.toContain(token);

    expect((await cancelByToken(db, otherSiteId, token, NOW)).ok).toBe(false);
    const result = await cancelByToken(db, siteId, token, NOW);
    expect(result.ok).toBe(true);
    expect(await db.select().from(bookingSlots).where(eq(bookingSlots.bookingId, bookingId))).toHaveLength(0);
    expect((await availableTimes(db, siteId, serviceId, anne, LATER, NOW)).map((t) => t.label)).toContain("09:00");
    expect(await cancelByToken(db, siteId, token, NOW)).toMatchObject({ ok: false, reason: "allerede" });
    // Tiden kan bestilles på nytt.
    await book({ date: LATER });
  });

  it("stopper etter fristen bedriften har satt (standard 24 timer)", async () => {
    const { token } = await book({ date: LATER });
    // Timen er 7. januar 09:00 norsk tid. 6. januar 09:30 er mindre enn 24 timer før.
    const late = new Date("2027-01-06T08:30:00Z");
    expect(await cancelByToken(db, siteId, token, late)).toMatchObject({ ok: false, reason: "frist" });
    await saveBookingSettings(db, owner(), { cancelHours: 12 });
    expect(readBookingSettings((await db.select().from(sites).where(eq(sites.id, siteId)))[0].booking).cancelHours).toBe(12);
    expect((await cancelByToken(db, siteId, token, late)).ok).toBe(true);
  });

  it("sender bekreftelse, varsel og avbestilling, og logger dem på bookingen", async () => {
    const { bookingId, token } = await book({ date: LATER });
    await notifyBookingCreated(db, logProvider, bookingId, token);
    await cancelByToken(db, siteId, token, NOW);
    await notifyBookingCancelled(db, logProvider, bookingId);
    const kinds = (await db.select().from(emailLog).where(eq(emailLog.bookingId, bookingId))).map((e) => `${e.kind}:${e.recipient}`).sort();
    expect(kinds).toEqual(["booking-avbestilt-varsel:post@demo-ror.no", "booking-avbestilt:kari@test.no", "bookingbekreftelse:kari@test.no", "ny-booking:post@demo-ror.no"]);
  });
});

describe("tilgang", () => {
  it("bare eier og redaktør kan endre og avbestille, utvikler kan ikke", async () => {
    const { bookingId } = await book();
    const developer = { siteId, role: "developer" as const, userId: null };
    await expect(saveService(db, developer, null, { name: "Farge", durationMinutes: 60 })).rejects.toThrow(/eier og redaktør/);
    await expect(saveStaff(db, developer, anne, { name: "Anne" })).rejects.toThrow(/eier og redaktør/);
    await expect(saveBookingSettings(db, developer, { cancelHours: 1 })).rejects.toThrow(/eier og redaktør/);
    await expect(cancelByBusiness(db, siteId, bookingId, "developer", null, NOW)).rejects.toThrow(/eier og redaktør/);
    await saveService(db, { ...developer, role: "editor" }, null, { name: "Farge", durationMinutes: 60 });
    const cancelled = await cancelByBusiness(db, siteId, bookingId, "editor", null, NOW);
    expect(cancelled.cancelledBy).toBe("bedrift");
  });

  it("kan ikke endre eller avbestille på et annet nettsted", async () => {
    const { bookingId } = await book();
    await expect(cancelByBusiness(db, otherSiteId, bookingId, "owner", null, NOW)).rejects.toThrow(/Fant ikke/);
    await expect(saveService(db, { siteId: otherSiteId, role: "owner", userId: null }, serviceId, { name: "Kapret", durationMinutes: 30 })).rejects.toThrow(/Fant ikke/);
    // Tjenester fra et annet nettsted blir ikke koblet til den ansatte.
    const foreign = await saveService(db, { siteId: otherSiteId, role: "owner", userId: null }, null, { name: "Fremmed", durationMinutes: 30 });
    await saveStaff(db, owner(), anne, { name: "Anne", serviceIds: [serviceId, foreign], hours: ALL_WEEK });
    expect((await loadPublicSetup(db, siteId))!.staff.find((s) => s.id === anne)!.serviceIds).toEqual([serviceId]);
  });

  it("godtar bare varighet og tider som går opp i fem minutter", async () => {
    await expect(saveService(db, owner(), null, { name: "Rar", durationMinutes: 33 })).rejects.toThrow(/fem minutter/);
    await expect(saveStaff(db, owner(), null, { name: "C", hours: [{ weekday: 1, startMinute: H(9, 2), endMinute: H(16) }] })).rejects.toThrow(/fem minutter/);
  });
});

describe("personvern og sletting", () => {
  it("sletter bookinger tolv måneder etter timen, med rutene", async () => {
    const { bookingId } = await book();
    const after11 = new Date("2027-12-01T12:00:00Z");
    expect((await runRetention(db, after11)).bookings).toBe(0);
    const after13 = new Date("2028-02-01T12:00:00Z");
    expect((await runRetention(db, after13)).bookings).toBe(1);
    expect(await db.select().from(bookings).where(eq(bookings.id, bookingId))).toHaveLength(0);
    expect(await db.select().from(bookingSlots)).toHaveLength(0);
  });

  it("personvernerklæringen får et eget avsnitt når egen booking er i bruk", async () => {
    const virksomhet = { navn: "Salong Åsheim", info: readSiteInfo(demoInfo) };
    const tekst = (egenBooking: boolean) =>
      sideSomTekst(lagPersonvernerklaering({ virksomhet, type: "nettside", egenBooking }))
        .flatMap((s) => [s.overskrift, ...s.avsnitt])
        .join(" ");
    const uten = tekst(false);
    const med = tekst(true);
    expect(uten).not.toContain("Når du bestiller time");
    expect(med).toContain("Når du bestiller time");
    expect(med).toContain("tolv måneder etter timen");
    expect(med).toContain("artikkel 6 nr. 1 bokstav b");
    expect(med).not.toMatch(/[–—]/);

    expect(await usesOwnBooking(db, siteId, [])).toBe(false);
    const egen: Section = { id: "b", type: "bestill", variant: "egen", props: { overskrift: "Bestill time" } };
    expect(await usesOwnBooking(db, siteId, [{ seo: {}, sections: [egen] }])).toBe(true);
    await book();
    expect(await usesOwnBooking(db, siteId, [])).toBe(true);
  });
});

describe("seksjonen", () => {
  const ctx = (booking: RenderContext["booking"], preview = false): RenderContext => ({
    site: { id: siteId, name: "Salong Åsheim", info: readSiteInfo({}), schemaType: "HairSalon" },
    nav: [],
    path: "/",
    preview,
    basePath: "",
    shop: false,
    products: [],
    layout: readSiteLayout({}),
    booking,
  });
  const section = (variant: string, props: Record<string, unknown>): Section => ({ id: "bestill", type: "bestill", variant, props: { overskrift: "Bestill time", ...props } });
  const render = (s: Section, c: RenderContext) => renderToStaticMarkup(createElement(SectionPreview, { section: s, theme: buildTheme("atelier")!, ctx: c }));

  it("«Egen booking» kan publiseres uten lenke, de andre variantene krever den fortsatt", () => {
    expect(validatePageContent({ sections: [section("egen", {})] }).ok).toBe(true);
    expect(validatePageContent({ sections: [section("knapp", {})] }).ok).toBe(false);
    expect(validatePageContent({ sections: [section("egen", { lenke: "javascript:alert(1)" })] }).ok).toBe(false);
  });

  it("viser første steg med tjenestene, og en beskjed når ingen tjeneste er aktiv", async () => {
    const setup = await loadPublicSetup(db, siteId);
    const html = render(section("egen", {}), ctx(setup));
    expect(html).toContain("Hva vil du bestille?");
    expect(html).toContain("Klipp");
    expect(html).toContain("650 kr");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Steg 1 av 6");
    expect(render(section("egen", {}), ctx(null))).toContain("ikke åpen akkurat nå");
    expect(render(section("egen", {}), ctx(null, true))).toContain("under Booking i studioet");
  });

  it("sletting av en tjeneste beholder navnet på bestilte timer", async () => {
    const { bookingId } = await book();
    const { deleteService } = await import("@/lib/egen-booking/admin");
    await deleteService(db, owner(), serviceId);
    const [row] = await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.siteId, siteId)));
    expect(row.serviceId).toBeNull();
    expect(row.serviceName).toBe("Klipp");
  });
});
