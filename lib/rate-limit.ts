import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimitEvents } from "@/db/schema";

export type RateLimitRule = { limit: number; windowSeconds: number };

export const rules = {
  loginPerEmail: { limit: 5, windowSeconds: 15 * 60 },
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  inquiryPerIp: { limit: 5, windowSeconds: 10 * 60 },
  withdrawalPerEmail: { limit: 3, windowSeconds: 24 * 60 * 60 },
  inquiryPerSite: { limit: 50, windowSeconds: 60 * 60 },
  /** Bilder i tilbudsforespørsler. Fem per skjema, så seks skjemaer med fulle bildefelt per ti minutter fra samme adresse. */
  inquiryImagePerIp: { limit: 30, windowSeconds: 10 * 60 },
  inquiryImagePerSite: { limit: 300, windowSeconds: 60 * 60 },
  /** Nøkler til bildeopplasting. Lages når den besøkende velger det første bildet. */
  inquiryImageTokenPerIp: { limit: 20, windowSeconds: 10 * 60 },
  /** Timebestilling. En familie kan bestille flere timer på rad, men ikke fylle opp kalenderen. */
  bookingPerIp: { limit: 6, windowSeconds: 10 * 60 },
  bookingPerSite: { limit: 100, windowSeconds: 60 * 60 },
  /** Oppslag av ledige tider. Rause, men stopper skraping av kalenderen. */
  bookingLookupPerIp: { limit: 120, windowSeconds: 10 * 60 },
  /** Bestillinger i kassen, se lib/shop/order-limits.ts. Per IP stopper én maskin, per adresse stopper at kassen
   *  brukes til å fylle innboksen til andre med ordrebekreftelser, og per butikk stopper roboter som bytter IP og
   *  holder av hele lageret. Grensen per butikk er så høy at et vanlig salg aldri merker den. */
  orderPerIp: { limit: 10, windowSeconds: 10 * 60 },
  orderPerEmail: { limit: 5, windowSeconds: 60 * 60 },
  orderPerSite: { limit: 300, windowSeconds: 60 * 60 },
  /** Bare koder som ikke finnes teller, så en kunde som skriver feil et par ganger ikke stenges ute. */
  discountFailuresPerIp: { limit: 10, windowSeconds: 10 * 60 },
  /** Koder fra appen har en million muligheter. Fem forsøk per kvarter gjør gjetting nytteløst. */
  totpPerUser: { limit: 5, windowSeconds: 15 * 60 },
  /** Besøksstatistikken. Langt over det et menneske klikker seg gjennom, men stopper skript som vil blåse opp tallene. */
  visitPerIp: { limit: 120, windowSeconds: 10 * 60 },
  /** Påmelding til nyhetsbrev. Per adresse også, så ingen kan fylle innboksen til en annen med bekreftelser. */
  newsletterPerIp: { limit: 5, windowSeconds: 10 * 60 },
  newsletterPerSite: { limit: 100, windowSeconds: 60 * 60 },
  newsletterPerEmail: { limit: 3, windowSeconds: 24 * 60 * 60 },
  /** Bekreftelse og avmelding fra lenkene i e-postene. */
  newsletterLinkPerIp: { limit: 30, windowSeconds: 10 * 60 },
  /** Henting av sitemap fra en annen nettside. Hver skanning kan bli opptil elleve forespørsler ut, så dette holdes lavt. */
  sitemapFetchPerSite: { limit: 10, windowSeconds: 60 * 60 },
  /** Registrering. Per adresse (som hash), så ingen kan fylle innboksen til en annen med bekreftelser. */
  signupPerIp: { limit: 5, windowSeconds: 60 * 60 },
  signupPerEmail: { limit: 3, windowSeconds: 24 * 60 * 60 },
  /** «Send bekreftelsen på nytt». */
  verifyResendPerIp: { limit: 10, windowSeconds: 60 * 60 },
  verifyResendPerEmail: { limit: 3, windowSeconds: 60 * 60 },
  /** «Glemt passord»: bestilling av lenke, og forsøk på å lagre nytt passord. */
  resetPerIp: { limit: 10, windowSeconds: 60 * 60 },
  resetPerEmail: { limit: 3, windowSeconds: 60 * 60 },
  resetSubmitPerIp: { limit: 20, windowSeconds: 15 * 60 },
  /** Bekreftelseslenker som trykkes. Lenken er signert, så dette stopper bare skript som prøver i hopetall. */
  verifyLinkPerIp: { limit: 30, windowSeconds: 10 * 60 },
  /** Oppslag i Brønnøysundregistrene fra veiviseren, for kunder. Plattformadmin har ingen grense. */
  brregPerUser: { limit: 40, windowSeconds: 60 * 60 },
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
  const ip = clientIp(headers);
  const data = new Uint8Array([...secret, ...new TextEncoder().encode(ip)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** IP-adressen til den som sendte forespørselen. Brukes bare til å lage koder, aldri lagret som den er. */
export function clientIp(headers: Headers): string {
  // Cloudflare setter cf-connecting-ip selv og overskriver det klienten sender. X-Forwarded-For og X-Real-IP
  // kan hvem som helst sette, og da kunne en ny verdi per forsøk nullstilt grensene. De brukes derfor bare lokalt.
  const forwarded =
    process.env.NODE_ENV === "production" ? null : (headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip"));
  return headers.get("cf-connecting-ip") ?? forwarded ?? "ukjent";
}
