import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimitEvents } from "@/db/schema";

export type RateLimitRule = { limit: number; windowSeconds: number };

export const rules = {
  loginPerEmail: { limit: 5, windowSeconds: 15 * 60 },
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  inquiryPerIp: { limit: 5, windowSeconds: 10 * 60 },
  inquiryPerSite: { limit: 50, windowSeconds: 60 * 60 },
  /** Timebestilling. En familie kan bestille flere timer på rad, men ikke fylle opp kalenderen. */
  bookingPerIp: { limit: 6, windowSeconds: 10 * 60 },
  bookingPerSite: { limit: 100, windowSeconds: 60 * 60 },
  /** Oppslag av ledige tider. Rause, men stopper skraping av kalenderen. */
  bookingLookupPerIp: { limit: 120, windowSeconds: 10 * 60 },
  /** Bare koder som ikke finnes teller, så en kunde som skriver feil et par ganger ikke stenges ute. */
  discountFailuresPerIp: { limit: 10, windowSeconds: 10 * 60 },
  /** Koder fra appen har en million muligheter. Fem forsøk per kvarter gjør gjetting nytteløst. */
  totpPerUser: { limit: 5, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Registrerer et forsøk og svarer om det er innenfor grensen.
 * Forsøk over grensen registreres ikke, så en sperre varer ikke lenger enn vinduet.
 */
export async function hit(db: Db, key: string, rule: RateLimitRule, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - rule.windowSeconds * 1000);
  await db.delete(rateLimitEvents).where(and(eq(rateLimitEvents.key, key), lt(rateLimitEvents.createdAt, since)));
  const [{ n }] = await db
    .select({ n: count() })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, key), gte(rateLimitEvents.createdAt, since)));
  if (n >= rule.limit) return false;
  await db.insert(rateLimitEvents).values({ key, createdAt: now });
  return true;
}

/** Svarer om grensen er nådd, uten å registrere et nytt forsøk. */
export async function isLimited(db: Db, key: string, rule: RateLimitRule, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - rule.windowSeconds * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(rateLimitEvents)
    .where(and(eq(rateLimitEvents.key, key), gte(rateLimitEvents.createdAt, since)));
  return n >= rule.limit;
}

/** Nullstiller en nøkkel, f.eks. etter vellykket innlogging. */
export async function reset(db: Db, key: string) {
  await db.delete(rateLimitEvents).where(eq(rateLimitEvents.key, key));
}

/**
 * IP-adressen lagres aldri i klartekst. Vi bruker en kort hash med hemmeligheten som salt,
 * som er nok til å skille forsøk fra hverandre uten å lagre personopplysningen.
 */
export async function clientKey(headers: Headers, secret: Uint8Array): Promise<string> {
  // Cloudflare setter cf-connecting-ip selv og overskriver det klienten sender. X-Forwarded-For og X-Real-IP
  // kan hvem som helst sette, og da kunne en ny verdi per forsøk nullstilt grensene. De brukes derfor bare lokalt.
  const forwarded =
    process.env.NODE_ENV === "production" ? null : (headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip"));
  const ip = headers.get("cf-connecting-ip") ?? forwarded ?? "ukjent";
  const data = new Uint8Array([...secret, ...new TextEncoder().encode(ip)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}
