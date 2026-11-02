import { and, asc, count, desc, eq, ilike, isNull, isNotNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import type { PageContent } from "@/lib/content/types";
import { toCsv } from "@/lib/csv";
import { formatOsloDateTime } from "@/lib/oslo-time";
import { readConfirmToken, readUnsubscribeToken } from "./tokens";

/*
 * Påmeldte til nyhetsbrevet. Dobbel opt-in: «venter» til lenken i bekreftelsen er brukt, så «bekreftet».
 * «avmeldt» er sperrelisten. Adressen beholdes, så den aldri får nyhetsbrev igjen uten en ny, bekreftet påmelding.
 */

/** Sidene lenkene i e-postene går til. De vises på kundens eget nettsted (app/[[...path]]/page.tsx). */
export const NEWSLETTER_CONFIRM_PATH = "/nyhetsbrev/bekreft";
export const NEWSLETTER_UNSUBSCRIBE_PATH = "/nyhetsbrev/avmeld";
/** Ett-klikks avmelding fra e-postprogrammet (List-Unsubscribe-Post, RFC 8058). Ligger alltid rett under domenet. */
export const NEWSLETTER_UNSUBSCRIBE_API = "/api/nyhetsbrev/avmeld";

export const SUBSCRIBERS_PER_PAGE = 50;
export const subscriberStatuses = { bekreftet: "Bekreftet", venter: "Venter på bekreftelse", avmeldt: "Meldt av" } as const;
export type SubscriberStatus = keyof typeof subscriberStatuses;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => email.length <= 254 && emailPattern.test(email);

export type SubscribeResult = {
  subscriberId: string;
  /** Sant når det skal sendes en bekreftelse. Allerede bekreftede får ingen ny e-post. */
  sendConfirmation: boolean;
  consentedAt: Date;
};

/**
 * Ny påmelding, eller ny påmelding fra en som venter eller har meldt seg av. Svaret til den besøkende er det samme
 * uansett, så skjemaet ikke avslører hvem som allerede står på listen.
 */
export async function subscribe(
  db: Db,
  input: { siteId: string; email: string; name: string; sourcePath: string; consentText: string },
  now = new Date(),
): Promise<SubscribeResult> {
  const email = normalizeEmail(input.email);
  const values = { name: input.name.trim(), sourcePath: input.sourcePath, consentText: input.consentText, consentedAt: now };
  const [created] = await db
    .insert(newsletterSubscribers)
    .values({ siteId: input.siteId, email, status: "venter", ...values })
    .onConflictDoNothing()
    .returning({ id: newsletterSubscribers.id });
  if (created) return { subscriberId: created.id, sendConfirmation: true, consentedAt: now };

  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, input.siteId), eq(newsletterSubscribers.email, email)))
    .limit(1);
  if (existing.status === "bekreftet") return { subscriberId: existing.id, sendConfirmation: false, consentedAt: existing.consentedAt };
  // Venter eller meldt av: ny bekreftelse kreves. Avmeldingen står til påmeldingen er bekreftet.
  await db
    .update(newsletterSubscribers)
    .set({ ...values, name: values.name || existing.name, status: "venter", confirmedAt: null })
    .where(eq(newsletterSubscribers.id, existing.id));
  return { subscriberId: existing.id, sendConfirmation: true, consentedAt: now };
}

export type ConfirmResult = { ok: true; already: boolean } | { ok: false; reason: "ukjent" | "utlopt" | "avmeldt" | "erstattet" };

/** Bekrefter påmeldingen lenken gjelder. Bare den siste påmeldingen kan bekreftes, så en gammel lenke ikke virker. */
export async function confirmSubscription(db: Db, siteId: string, token: string, now = new Date()): Promise<ConfirmResult> {
  const read = await readConfirmToken(token, now);
  if (read === "utlopt") return { ok: false, reason: "utlopt" };
  if (!read) return { ok: false, reason: "ukjent" };
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.id, read.subscriberId), eq(newsletterSubscribers.siteId, siteId)))
    .limit(1);
  if (!row) return { ok: false, reason: "ukjent" };
  if (row.status === "bekreftet") return { ok: true, already: true };
  if (row.consentedAt.getTime() !== read.consentedAt) return { ok: false, reason: "erstattet" };
  if (row.status === "avmeldt") return { ok: false, reason: "avmeldt" };
  await db
    .update(newsletterSubscribers)
    .set({ status: "bekreftet", confirmedAt: now, unsubscribedAt: null })
    .where(and(eq(newsletterSubscribers.id, row.id), eq(newsletterSubscribers.status, "venter")));
  return { ok: true, already: false };
}

/**
 * Melder av med nøkkelen fra lenken eller e-posthodet. `siteId` er null fra ett-klikks-avmeldingen, der nøkkelen
 * alene er nok. Gir abonnentens nettsted, eller null hvis nøkkelen er ukjent.
 */
export async function unsubscribe(db: Db, token: string, siteId: string | null, now = new Date()): Promise<{ siteId: string; email: string } | null> {
  const subscriberId = await readUnsubscribeToken(token);
  if (!subscriberId) return null;
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(siteId ? and(eq(newsletterSubscribers.id, subscriberId), eq(newsletterSubscribers.siteId, siteId)) : eq(newsletterSubscribers.id, subscriberId))
    .limit(1);
  if (!row) return null;
  if (row.status !== "avmeldt") {
    await db.update(newsletterSubscribers).set({ status: "avmeldt", unsubscribedAt: now }).where(eq(newsletterSubscribers.id, row.id));
  }
  return { siteId: row.siteId, email: row.email };
}

/** Abonnenten nøkkelen gjelder, til avmeldingssiden. Endrer ingenting. */
export async function subscriberForUnsubscribe(db: Db, siteId: string, token: string) {
  const subscriberId = await readUnsubscribeToken(token);
  if (!subscriberId) return null;
  const [row] = await db
    .select({ email: newsletterSubscribers.email, status: newsletterSubscribers.status })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.id, subscriberId), eq(newsletterSubscribers.siteId, siteId)))
    .limit(1);
  return row ?? null;
}

export async function subscriberCounts(db: Db, siteId: string): Promise<Record<SubscriberStatus, number>> {
  const rows = await db
    .select({ status: newsletterSubscribers.status, n: count() })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.siteId, siteId))
    .groupBy(newsletterSubscribers.status);
  const counts = { bekreftet: 0, venter: 0, avmeldt: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

export type SubscriberQuery = { search: string; status: SubscriberStatus | "alle"; page: number };

export function parseSubscriberQuery(params: Record<string, string | string[] | undefined>): SubscriberQuery {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  const status = one("status");
  const page = Number.parseInt(one("side"), 10);
  return {
    search: one("q").trim().slice(0, 100),
    status: status in subscriberStatuses ? (status as SubscriberStatus) : "alle",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
  };
}

/** Én side med abonnenter, nyeste først. Gir én ekstra rad, så siden vet om det finnes en neste side. */
export async function listSubscribers(db: Db, siteId: string, query: SubscriberQuery) {
  const pattern = `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select()
    .from(newsletterSubscribers)
    .where(
      and(
        eq(newsletterSubscribers.siteId, siteId),
        query.status === "alle" ? undefined : eq(newsletterSubscribers.status, query.status),
        query.search ? or(ilike(newsletterSubscribers.email, pattern), ilike(newsletterSubscribers.name, pattern)) : undefined,
      ),
    )
    .orderBy(desc(newsletterSubscribers.consentedAt), asc(newsletterSubscribers.email))
    .limit(SUBSCRIBERS_PER_PAGE + 1)
    .offset((query.page - 1) * SUBSCRIBERS_PER_PAGE);
}

/** Sletter én abonnent helt, for eksempel når personen ber om det. Da forsvinner også avmeldingen fra sperrelisten. */
export async function deleteSubscriber(db: Db, siteId: string, subscriberId: string) {
  const deleted = await db
    .delete(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.id, subscriberId), eq(newsletterSubscribers.siteId, siteId)))
    .returning({ id: newsletterSubscribers.id });
  return deleted.length > 0;
}

const csvTime = (d: Date | null) => (d ? formatOsloDateTime(d) : "");

/** Alle abonnenter som CSV, også de som har meldt seg av, så sperrelisten følger med hvis listen flyttes. */
export async function subscribersCsv(db: Db, siteId: string): Promise<string> {
  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.siteId, siteId))
    .orderBy(asc(newsletterSubscribers.email));
  return toCsv(
    ["E-post", "Navn", "Status", "Påmeldt", "Bekreftet", "Meldt av", "Påmeldt fra side", "Samtykketekst"],
    rows.map((r) => [r.email, r.name, subscriberStatuses[r.status], csvTime(r.consentedAt), csvTime(r.confirmedAt), csvTime(r.unsubscribedAt), r.sourcePath, r.consentText]),
  );
}

/** Personvernerklæringen tar med nyhetsbrevet når en publisert side har påmelding, eller noen står på listen. */
export async function usesNewsletter(db: Db, siteId: string, published: readonly PageContent[]): Promise<boolean> {
  if (published.some((c) => c.sections.some((s) => s.type === "nyhetsbrev" && !s.hidden))) return true;
  const [row] = await db.select({ id: newsletterSubscribers.id }).from(newsletterSubscribers).where(eq(newsletterSubscribers.siteId, siteId)).limit(1);
  return Boolean(row);
}

/** Dager en påmelding kan vente på bekreftelse før den slettes (lib/retention.ts). Samme som bekreftelseslenken. */
export const UNCONFIRMED_KEEP_DAYS = 30;

/**
 * Sletter påmeldinger som aldri ble bekreftet. Har adressen meldt seg av tidligere, går den tilbake til «avmeldt»
 * i stedet, så sperren ikke forsvinner fordi noen prøvde å melde den på igjen.
 */
export async function expireUnconfirmed(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - UNCONFIRMED_KEEP_DAYS * 86_400_000);
  const pending = and(eq(newsletterSubscribers.status, "venter"), lt(newsletterSubscribers.consentedAt, cutoff));
  await db
    .update(newsletterSubscribers)
    .set({ status: "avmeldt" })
    .where(and(pending, isNotNull(newsletterSubscribers.unsubscribedAt)));
  const deleted = await db
    .delete(newsletterSubscribers)
    .where(and(pending, isNull(newsletterSubscribers.unsubscribedAt)))
    .returning({ id: newsletterSubscribers.id });
  return deleted.length;
}

