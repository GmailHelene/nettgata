"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import type { ActionState } from "@/app/studio/actions";
import { addException, deleteException, deleteService, deleteStaff, saveBookingSettings, saveService, saveStaff } from "@/lib/egen-booking/admin";
import { parseMinute } from "@/lib/egen-booking/availability";
import { notifyBookingCancelled } from "@/lib/egen-booking/notify";
import { BookingError, cancelByBusiness } from "@/lib/egen-booking/store";
import { getEmailProvider } from "@/lib/email/send";
import { parseNok } from "@/lib/shop/money";
import { requireSiteAccess } from "@/lib/session";

/*
 * Booking i studioet. Rollen sjekkes i lib/egen-booking for hver endring: bare eier og redaktør kan endre.
 */

const path = (siteId: string) => `/studio/nettsted/${siteId}/booking`;

async function run(siteId: string, ok: string, fn: (a: { db: Awaited<ReturnType<typeof getDb>>; siteId: string; role: "owner" | "editor" | "developer"; userId: string }) => Promise<unknown>): Promise<ActionState> {
  const { site, role, user } = await requireSiteAccess(siteId);
  try {
    await fn({ db: await getDb(), siteId: site.id, role, userId: user.id });
    revalidatePath(path(site.id));
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return { ok: true, message: ok };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof BookingError) return { ok: false, message: err.message };
    console.error("Booking i studioet", err);
    return { ok: false, message: "Noe gikk galt. Prøv igjen om litt." };
  }
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const int = (fd: FormData, key: string) => {
  const v = text(fd, key);
  return v === "" ? NaN : Number(v);
};

export async function saveSettingsAction(siteId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(siteId, "Innstillingene er lagret.", ({ db, ...a }) =>
    saveBookingSettings(db, { ...a }, {
      noticeHours: int(fd, "noticeHours"),
      maxDaysAhead: int(fd, "maxDaysAhead"),
      cancelHours: int(fd, "cancelHours"),
      stepMinutes: int(fd, "stepMinutes"),
      notifyBusiness: fd.get("notifyBusiness") === "on",
    }),
  );
}

export async function saveServiceAction(siteId: string, serviceId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const priceText = text(fd, "price");
  const priceOre = priceText === "" ? null : parseNok(priceText);
  if (priceText !== "" && priceOre === null) return { ok: false, message: "Skriv prisen som et tall, for eksempel 650 eller 649,50." };
  return run(siteId, serviceId ? "Tjenesten er lagret." : "Tjenesten er lagt til.", ({ db, ...a }) =>
    saveService(db, a, serviceId, {
      name: text(fd, "name"),
      description: text(fd, "description"),
      durationMinutes: int(fd, "durationMinutes"),
      bufferMinutes: int(fd, "bufferMinutes") || 0,
      priceOre,
      active: fd.get("active") === "on",
      sortOrder: int(fd, "sortOrder") || 0,
    }),
  );
}

export async function deleteServiceAction(siteId: string, serviceId: string): Promise<ActionState> {
  return run(siteId, "Tjenesten er slettet.", ({ db, ...a }) => deleteService(db, a, serviceId));
}

export async function saveStaffAction(siteId: string, staffId: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const hours: { weekday: number; startMinute: number; endMinute: number }[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    if (fd.get(`dag-${weekday}`) !== "on") continue;
    const startMinute = parseMinute(text(fd, `fra-${weekday}`));
    const endMinute = parseMinute(text(fd, `til-${weekday}`));
    if (startMinute === null || endMinute === null) return { ok: false, message: "Skriv både fra og til klokkeslett for dagene den ansatte jobber." };
    hours.push({ weekday, startMinute, endMinute });
  }
  return run(siteId, staffId ? "Den ansatte er lagret." : "Den ansatte er lagt til.", ({ db, ...a }) =>
    saveStaff(db, a, staffId, {
      name: text(fd, "name"),
      title: text(fd, "title"),
      active: fd.get("active") === "on",
      sortOrder: int(fd, "sortOrder") || 0,
      serviceIds: fd.getAll("services").map(String),
      hours,
    }),
  );
}

export async function deleteStaffAction(siteId: string, staffId: string): Promise<ActionState> {
  return run(siteId, "Den ansatte er slettet.", ({ db, ...a }) => deleteStaff(db, a, staffId));
}

export async function addExceptionAction(siteId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const kind = text(fd, "kind");
  const from = text(fd, "startDate");
  const timed = kind === "egne_tider";
  return run(siteId, "Unntaket er lagt til.", ({ db, ...a }) =>
    addException(db, a, {
      staffId: text(fd, "staffId") || null,
      kind: kind as "stengt" | "egne_tider" | "apen",
      startDate: from,
      endDate: text(fd, "endDate") || from,
      startMinute: timed ? parseMinute(text(fd, "startTime")) : null,
      endMinute: timed ? parseMinute(text(fd, "endTime")) : null,
      note: text(fd, "note"),
    }),
  );
}

export async function deleteExceptionAction(siteId: string, exceptionId: string): Promise<ActionState> {
  return run(siteId, "Unntaket er slettet.", ({ db, ...a }) => deleteException(db, a, exceptionId));
}

/** Bedriften avbestiller. Kunden får beskjed på e-post. */
export async function cancelBookingStudioAction(siteId: string, bookingId: string): Promise<ActionState> {
  return run(siteId, "Timen er avbestilt, og kunden får beskjed på e-post.", async ({ db, siteId: id, role, userId }) => {
    const booking = await cancelByBusiness(db, id, bookingId, role, userId);
    after(() => notifyBookingCancelled(db, getEmailProvider(), booking.id).catch((err) => console.error("Avbestillingsvarsel feilet", err)));
  });
}
