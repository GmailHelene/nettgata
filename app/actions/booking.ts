"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db";
import { getEmailProvider } from "@/lib/email/send";
import { notifyBookingCancelled, notifyBookingCreated } from "@/lib/egen-booking/notify";
import { availableDates, availableTimes, BookingError, cancelByToken, createBooking, isUuid, type FreeTime } from "@/lib/egen-booking/store";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";

/*
 * Timebestillingen på kundens nettsted. Offentlig, så alt valideres og begrenses her og i lib/egen-booking.
 * Ledige tider regnes alltid ut på serveren. Det kunden sender, brukes bare til å velge blant dem.
 */

const staffOrAny = (staffId: string | null) => (staffId === null || staffId === "" ? null : staffId);

async function lookupAllowed() {
  const db = await getDb();
  return { db, ok: await hit(db, `booking-oppslag:${await clientKey(await headers(), getSecret())}`, rules.bookingLookupPerIp) };
}

export type DatesResult = { ok: true; dates: string[] } | { ok: false; message: string };

export async function bookingDatesAction(siteId: string, serviceId: string, staffId: string | null): Promise<DatesResult> {
  if (!isUuid(siteId) || !isUuid(serviceId)) return { ok: false, message: "Tjenesten finnes ikke." };
  const { db, ok } = await lookupAllowed();
  if (!ok) return { ok: false, message: "Mange oppslag på kort tid. Vent litt og prøv igjen." };
  return { ok: true, dates: await availableDates(db, siteId, serviceId, staffOrAny(staffId)) };
}

export type TimesResult = { ok: true; times: FreeTime[] } | { ok: false; message: string };

export async function bookingTimesAction(siteId: string, serviceId: string, staffId: string | null, date: string): Promise<TimesResult> {
  if (!isUuid(siteId) || !isUuid(serviceId)) return { ok: false, message: "Tjenesten finnes ikke." };
  const { db, ok } = await lookupAllowed();
  if (!ok) return { ok: false, message: "Mange oppslag på kort tid. Vent litt og prøv igjen." };
  return { ok: true, times: await availableTimes(db, siteId, serviceId, staffOrAny(staffId), date) };
}

export type BookState = { ok: boolean; message: string; field?: string; taken?: boolean } | null;

/** Selve bestillingen. Honningkrukke og grenser som kontaktskjemaet. */
export async function bookAction(siteId: string, _prev: BookState, formData: FormData): Promise<BookState> {
  if (String(formData.get("nettsted") ?? "") !== "") return { ok: true, message: "Timen er bestilt." };
  if (!isUuid(siteId)) return { ok: false, message: "Bestillingen er ikke tilgjengelig." };
  const get = (k: string) => String(formData.get(k) ?? "");

  const db = await getDb();
  const ipKey = await clientKey(await headers(), getSecret());
  const allowed = (await hit(db, `booking-ip:${ipKey}`, rules.bookingPerIp)) && (await hit(db, `booking-site:${siteId}`, rules.bookingPerSite));
  if (!allowed) return { ok: false, message: "Du har bestilt mange timer på kort tid. Prøv igjen om litt, eller ta kontakt med oss." };

  try {
    const { bookingId, token } = await createBooking(db, {
      siteId,
      serviceId: get("serviceId"),
      staffId: staffOrAny(get("staffId")),
      date: get("date"),
      time: get("time"),
      contact: { name: get("name").slice(0, 100), email: get("email").slice(0, 120), phone: get("phone").slice(0, 30), message: get("message").slice(0, 1000) },
    });
    after(() => notifyBookingCreated(db, getEmailProvider(), bookingId, token).catch((err) => console.error("Bookingbekreftelse feilet", err)));
    return { ok: true, message: "Timen er bestilt. Du får en bekreftelse på e-post med lenke for å avbestille." };
  } catch (err) {
    if (err instanceof BookingError) {
      const msg = err.message;
      const field = /navn/i.test(msg) ? "name" : /e-post/i.test(msg) ? "email" : /telefon/i.test(msg) ? "phone" : /melding/i.test(msg) ? "message" : undefined;
      return { ok: false, message: msg, field, taken: !field };
    }
    console.error("Timebestilling feilet", err);
    return { ok: false, message: "Noe gikk galt. Prøv igjen om litt." };
  }
}

export type CancelState = { ok: boolean; message: string } | null;

/** Avbestilling fra lenken i e-posten. Skjer bare når kunden trykker på knappen, aldri ved å åpne lenken. */
export async function cancelBookingAction(siteId: string, _prev: CancelState, formData: FormData): Promise<CancelState> {
  const db = await getDb();
  const ipKey = await clientKey(await headers(), getSecret());
  if (!(await hit(db, `booking-avbestill:${ipKey}`, rules.inquiryPerIp))) return { ok: false, message: "For mange forsøk. Prøv igjen om litt." };
  const result = await cancelByToken(db, siteId, String(formData.get("t") ?? ""));
  if (result.ok) {
    after(() => notifyBookingCancelled(db, getEmailProvider(), result.booking.id).catch((err) => console.error("Avbestillingsvarsel feilet", err)));
    return { ok: true, message: "Timen er avbestilt. Du får en bekreftelse på e-post." };
  }
  const messages = {
    ukjent: "Fant ikke timen. Sjekk at du brukte hele lenken fra e-posten.",
    allerede: "Timen er allerede avbestilt.",
    frist: "Fristen for å avbestille på nett har gått ut. Ta kontakt med oss direkte.",
    passert: "Timen er allerede passert.",
  } as const;
  return { ok: false, message: messages[result.reason] };
}
