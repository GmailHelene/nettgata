import { and, eq, inArray, isNotNull, isNull, lt, notExists } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, memberships, organizations, sites, users } from "@/db/schema";
import { readBilling } from "@/lib/billing/state";
import { inactivityWarningEmail } from "@/lib/email/account";
import { deliver, type EmailProvider } from "@/lib/email/send";
import { EXPORT_PREFIX } from "@/lib/eksport";
import { INQUIRY_IMAGE_PREFIX } from "@/lib/henvendelser/bilder";
import { norskDato } from "@/lib/legal/felles";
import type { MediaStore } from "@/lib/storage";

/**
 * Opprydding etter selvbetjeningen, slik personvernerklæringen og vilkårene lover:
 * - Kontoer som ikke er bekreftet, slettes sju dager etter registreringen.
 * - Ubetalte nettsteder kunden har laget selv, får varsel etter 60 dager uten aktivitet i studioet, og slettes
 *   14 dager etter varselet hvis ingen logger inn eller velger abonnement i mellomtiden (lib/selvbetjening/aktivitet.ts
 *   nullstiller varselet).
 * Kjøres hver natt etter sikkerhetskopien. Hver kjøring tar et begrenset antall, resten tas neste natt.
 */

export const UNVERIFIED_KEEP_DAYS = 7;
export const INACTIVE_WARN_DAYS = 60;
export const DELETE_AFTER_WARNING_DAYS = 14;
const BATCH_USERS = 200;
const BATCH_WARN = 50;
const BATCH_DELETE = 20;

const DAY = 86_400_000;
/**
 * Jobben går én gang i natten, men ikke på sekundet. Med en time slingringsmonn blir et nettsted varslet natt 60
 * og slettet natt 74, i stedet for å gli en natt fordi jobben startet litt tidligere enn sist.
 */
const SLACK = 3_600_000;

/**
 * Ubekreftede kontoer eldre enn sju dager. Plattformadmin og brukere med tilgang til et nettsted slettes aldri her,
 * selv om e-posten mangler bekreftelse (for eksempel brukere laget med db/seed.ts).
 */
export async function deleteUnverifiedAccounts(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UNVERIFIED_KEEP_DAYS * DAY);
  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNull(users.emailVerifiedAt),
        eq(users.isPlatformAdmin, false),
        lt(users.createdAt, cutoff),
        notExists(db.select({ one: memberships.userId }).from(memberships).where(eq(memberships.userId, users.id))),
      ),
    )
    .limit(BATCH_USERS);
  if (!candidates.length) return 0;
  // Loggen om godtatte vilkår følger med (user_id settes til null), men ingenting i den peker til adressen.
  const deleted = await db
    .delete(users)
    .where(inArray(users.id, candidates.map((c) => c.id)))
    .returning({ id: users.id });
  return deleted.length;
}

/** Et nettsted kunden har laget selv, som aldri har hatt abonnement eller «Fakturert utenom Stripe». */
function neverPaid(raw: unknown): boolean {
  const billing = readBilling(raw);
  return !billing.manual && !billing.stripeSubscriptionId && billing.status === "none";
}

/**
 * Sletter et nettsted for godt: filene i lageret først (bilder, PDF-er, «Last ned alt» og fraktetiketter), så
 * raden, som tar med seg sider, varer, ordre og alt annet (on delete cascade). Feiler lageret midt i, står
 * nettstedet igjen og prøves på nytt neste natt. Organisasjonen slettes når den ikke har flere nettsteder.
 */
export async function deleteSite(db: Db, store: MediaStore, siteId: string) {
  const [site] = await db.select({ id: sites.id, orgId: sites.orgId, slug: sites.slug }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return;
  const prefixes = [`${site.id}/`, `${EXPORT_PREFIX}${site.id}`, `fraktetiketter/${site.id}/`, `${INQUIRY_IMAGE_PREFIX}${site.id}/`];
  for (const prefix of prefixes) {
    for (const key of await store.list(prefix)) await store.delete(key);
  }
  await db.delete(sites).where(eq(sites.id, site.id));
  const [left] = await db.select({ id: sites.id }).from(sites).where(eq(sites.orgId, site.orgId)).limit(1);
  if (!left) await db.delete(organizations).where(eq(organizations.id, site.orgId));
  await db.insert(auditLog).values({ action: "site.deleted_inactive", detail: { siteId: site.id, slug: site.slug } });
}

export type CleanupDeps = { db: Db; store: MediaStore; provider: EmailProvider; baseUrl: string; now?: Date };

/** Varsler og sletter ubetalte nettsteder uten aktivitet. Gir tilbake hvor mange som fikk varsel og ble slettet. */
export async function cleanupInactiveSites(deps: CleanupDeps) {
  const { db } = deps;
  const now = deps.now ?? new Date();

  // Først slettingen, så et nettsted aldri varsles og slettes samme natt.
  const due = await db
    .select({ id: sites.id, billing: sites.billing })
    .from(sites)
    .where(and(eq(sites.selfServe, true), isNotNull(sites.inactivityWarnedAt), lt(sites.inactivityWarnedAt, new Date(now.getTime() - DELETE_AFTER_WARNING_DAYS * DAY + SLACK))))
    .limit(BATCH_DELETE);
  let deleted = 0;
  for (const site of due.filter((s) => neverPaid(s.billing))) {
    await deleteSite(db, deps.store, site.id);
    deleted++;
  }

  const idle = await db
    .select({ id: sites.id, name: sites.name, orgId: sites.orgId, billing: sites.billing })
    .from(sites)
    .where(and(eq(sites.selfServe, true), isNull(sites.inactivityWarnedAt), lt(sites.lastActivityAt, new Date(now.getTime() - INACTIVE_WARN_DAYS * DAY + SLACK))))
    .limit(BATCH_WARN);
  let warned = 0;
  for (const site of idle.filter((s) => neverPaid(s.billing))) {
    const owners = await db
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, site.orgId), eq(memberships.role, "owner")));
    const mail = inactivityWarningEmail({
      siteName: site.name,
      deleteOn: norskDato(new Date(now.getTime() + DELETE_AFTER_WARNING_DAYS * DAY)),
      loginLink: `${deps.baseUrl}/studio/logg-inn`,
      subscribeLink: `${deps.baseUrl}/studio/nettsted/${site.id}/abonnement`,
    });
    for (const owner of owners) {
      await deliver(db, deps.provider, { siteId: site.id, kind: "slettevarsel" }, { to: { email: owner.email }, fromName: "Nettgata", ...mail });
    }
    await db.update(sites).set({ inactivityWarnedAt: now }).where(eq(sites.id, site.id));
    warned++;
  }
  return { warned, deleted };
}
