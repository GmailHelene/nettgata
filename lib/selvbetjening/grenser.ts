import { and, eq, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { media, memberships, sites } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/state";

/**
 * Grensene for det som er gratis: å bygge og forhåndsvise. De gjelder bare nettsteder kunden har laget selv
 * (sites.selfServe) og som ikke har abonnement. Nettsteder plattformadmin har satt opp, har ingen grense.
 */

/** Så mange ubetalte nettsteder én bruker kan eie samtidig. */
export const MAX_UNPAID_SITES = 2;
/** Lagringsplass for bilder og PDF-filer på et ubetalt nettsted. Originalene teller, ikke de mindre utgavene. */
export const UNPAID_STORAGE_BYTES = 200 * 1024 * 1024;

export class LimitError extends Error {}

/** Ubetalte nettsteder brukeren selv har laget og eier. */
export async function unpaidSelfServeSites(db: Db, userId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: sites.id, name: sites.name, billing: sites.billing })
    .from(memberships)
    .innerJoin(sites, eq(sites.orgId, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner"), eq(sites.selfServe, true)));
  return rows.filter((r) => !hasActiveSubscription(r.billing)).map(({ id, name }) => ({ id, name }));
}

export const SITE_LIMIT_MESSAGE = `Du har ${MAX_UNPAID_SITES} nettsteder uten abonnement, som er det du kan bygge gratis samtidig. Velg abonnement på et av dem, eller slett et du ikke trenger, så kan du lage et nytt.`;

/** Stopper et nytt nettsted når brukeren allerede har så mange ubetalte som grensen tillater. */
export async function assertCanCreateSite(db: Db, user: { id: string; isPlatformAdmin: boolean; emailVerified: boolean }) {
  if (user.isPlatformAdmin) return;
  if (!user.emailVerified) throw new LimitError("Bekreft e-postadressen din først. Lenken står i e-posten fra Nettgata.");
  if ((await unpaidSelfServeSites(db, user.id)).length >= MAX_UNPAID_SITES) throw new LimitError(SITE_LIMIT_MESSAGE);
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * Stopper en opplasting som gjør at et ubetalt nettsted bruker mer enn grensen. Kalles fra saveImage og saveFile
 * i lib/media.ts før noe lagres. Kaster LimitError med en melding kunden kan lese.
 */
export async function assertStorageRoom(db: Db, siteId: string, incomingBytes: number) {
  const [site] = await db.select({ selfServe: sites.selfServe, billing: sites.billing }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || !site.selfServe || hasActiveSubscription(site.billing)) return;
  const [{ used }] = await db.select({ used: sum(media.size) }).from(media).where(eq(media.siteId, siteId));
  if (Number(used ?? 0) + incomingBytes > UNPAID_STORAGE_BYTES) {
    throw new LimitError(
      `Nettstedet har brukt ${mb(Number(used ?? 0))} av ${mb(UNPAID_STORAGE_BYTES)} MB, som er grensen før du velger abonnement. Slett bilder eller filer du ikke bruker, eller velg abonnement under «Abonnement».`,
    );
  }
}
