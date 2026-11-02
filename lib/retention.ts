import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { aiSuggestions, bookings, emailLog, inquiries, newsletterDeliveries, newsletters, rateLimitEvents, visitDays, visitHashes, visitPages, visitSources } from "@/db/schema";
import { osloDate } from "@/lib/oslo-time";
import { expireUnconfirmed } from "@/lib/nyhetsbrev/subscribers";

/**
 * Sletting som personvernerklæringene lover (lib/legal). Kjøres hver natt etter sikkerhetskopien.
 * Tallene er utkast som Helene bekrefter.
 */

/** Forsøk som teller mot grensene (innlogging, skjemaer, rabattkoder). Ingen grense ser lenger tilbake enn et døgn. */
export const RATE_LIMIT_KEEP_HOURS = 48;
/** Henvendelser fra kontaktskjemaene. Erklæringen lover sletting senest tolv måneder etter siste kontakt. */
export const INQUIRY_KEEP_MONTHS = 12;

/**
 * Timer fra egen timebestilling. Erklæringen lover sletting tolv måneder etter timen. Bookingene har ingen betaling,
 * så bokføringsloven krever ikke at de tas vare på lenger. Kommer forskuddsbetaling, må den delen lagres for seg.
 */
export const BOOKING_KEEP_MONTHS = 12;

/**
 * Loggen over sendte e-poster (mottaker, emne og status, ikke selve innholdet). Den viser butikken at kunden fikk
 * bekreftelsen, og tolv måneder dekker angrerett og de fleste reklamasjoner. Ordren selv lagres etter bokføringsloven.
 */
export const EMAIL_LOG_KEEP_MONTHS = 12;

/**
 * Besøksstatistikken (lib/statistikk.ts). Koden som skiller besøkende fra hverandre, gjelder bare én dag og
 * slettes neste natt. Tallene per dag er ikke personopplysninger, men trengs ikke lenger enn to år.
 */
export const STATS_KEEP_MONTHS = 24;

/**
 * Hvem som fikk hvert nyhetsbrev (newsletter_deliveries). Trengs for å svare på spørsmål om utsendelsen og for å
 * se feil. Slettes tolv måneder etter at nyhetsbrevet ble sendt. Selve nyhetsbrevet beholdes, med antall mottakere.
 */
export const NEWSLETTER_DELIVERY_KEEP_MONTHS = 12;

/** Forslag fra AI-teamet som er avvist eller utdatert. Godkjente beholdes som historikk over hva som er endret. */
export const AI_SUGGESTION_KEEP_DAYS = 90;

export async function runRetention(db: Db, now = new Date()) {
  const limitCutoff = new Date(now.getTime() - RATE_LIMIT_KEEP_HOURS * 3_600_000);
  const inquiryCutoff = new Date(now);
  inquiryCutoff.setMonth(inquiryCutoff.getMonth() - INQUIRY_KEEP_MONTHS);

  const rateLimits = await db.delete(rateLimitEvents).where(lt(rateLimitEvents.createdAt, limitCutoff)).returning({ id: rateLimitEvents.id });
  const oldInquiries = await db.delete(inquiries).where(lt(inquiries.createdAt, inquiryCutoff)).returning({ id: inquiries.id });
  const aiCutoff = new Date(now.getTime() - AI_SUGGESTION_KEEP_DAYS * 86_400_000);
  const oldSuggestions = await db
    .delete(aiSuggestions)
    .where(and(inArray(aiSuggestions.status, ["avvist", "utdatert"]), lt(aiSuggestions.createdAt, aiCutoff)))
    .returning({ id: aiSuggestions.id });
  const bookingCutoff = new Date(now);
  bookingCutoff.setMonth(bookingCutoff.getMonth() - BOOKING_KEEP_MONTHS);
  // Rutene i booking_slots slettes med bookingen (on delete cascade).
  const oldBookings = await db.delete(bookings).where(lt(bookings.startsAt, bookingCutoff)).returning({ id: bookings.id });
  const emailCutoff = new Date(now);
  emailCutoff.setMonth(emailCutoff.getMonth() - EMAIL_LOG_KEEP_MONTHS);
  const oldEmails = await db.delete(emailLog).where(lt(emailLog.createdAt, emailCutoff)).returning({ id: emailLog.id });
  // Alt fra før i dag (norsk dato). Jobben går etter midnatt, så gårsdagens koder forsvinner samme natt.
  const oldHashes = await db.delete(visitHashes).where(lt(visitHashes.day, osloDate(now))).returning({ day: visitHashes.day });
  const statsCutoff = new Date(now);
  statsCutoff.setMonth(statsCutoff.getMonth() - STATS_KEEP_MONTHS);
  const statsDay = osloDate(statsCutoff);
  await db.delete(visitDays).where(lt(visitDays.day, statsDay));
  await db.delete(visitPages).where(lt(visitPages.day, statsDay));
  await db.delete(visitSources).where(lt(visitSources.day, statsDay));
  // Påmeldinger til nyhetsbrev som ikke er bekreftet innen 30 dager (UNCONFIRMED_KEEP_DAYS). Personvernerklæringen lover det.
  const unconfirmedNewsletter = await expireUnconfirmed(db, now);
  const deliveryCutoff = new Date(now);
  deliveryCutoff.setMonth(deliveryCutoff.getMonth() - NEWSLETTER_DELIVERY_KEEP_MONTHS);
  const oldLetters = db
    .select({ id: newsletters.id })
    .from(newsletters)
    .where(and(eq(newsletters.status, "sendt"), lt(newsletters.finishedAt, deliveryCutoff)));
  const oldDeliveries = await db
    .delete(newsletterDeliveries)
    .where(inArray(newsletterDeliveries.newsletterId, oldLetters))
    .returning({ id: newsletterDeliveries.newsletterId });
  return {
    rateLimits: rateLimits.length,
    inquiries: oldInquiries.length,
    aiSuggestions: oldSuggestions.length,
    bookings: oldBookings.length,
    emailLog: oldEmails.length,
    visitHashes: oldHashes.length,
    unconfirmedNewsletter,
    newsletterDeliveries: oldDeliveries.length,
  };
}
