import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db";
import { memberships, sites } from "@/db/schema";

/**
 * Aktivitet i studioet, som holder ubetalte nettsteder unna oppryddingen (lib/selvbetjening/opprydding.ts).
 * Skrives høyst én gang i timen per nettsted, så hver forespørsel i studioet ikke blir en skriving i databasen.
 * Plattformadmin teller ikke: at Helene ser på et nettsted, betyr ikke at kunden fortsatt bruker det.
 */
const TOUCH_INTERVAL_MS = 60 * 60_000;

/** Merker nettstedet som i bruk og fjerner et slettevarsel. Kalles fra tilgangssjekken for vanlige brukere. */
export async function touchSite(db: Db, site: { id: string; lastActivityAt: Date; inactivityWarnedAt: Date | null }, now = new Date()) {
  if (!site.inactivityWarnedAt && now.getTime() - site.lastActivityAt.getTime() < TOUCH_INTERVAL_MS) return;
  await db.update(sites).set({ lastActivityAt: now, inactivityWarnedAt: null }).where(eq(sites.id, site.id));
}

/** Når en bruker logger inn, teller det som aktivitet på alle nettstedene brukeren har tilgang til. */
export async function touchUserSites(db: Db, userId: string, now = new Date()) {
  const orgs = db.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, userId));
  await db
    .update(sites)
    .set({ lastActivityAt: now, inactivityWarnedAt: null })
    .where(
      and(
        inArray(sites.orgId, orgs),
        or(lt(sites.lastActivityAt, new Date(now.getTime() - TOUCH_INTERVAL_MS)), isNotNull(sites.inactivityWarnedAt)),
      ),
    );
}
