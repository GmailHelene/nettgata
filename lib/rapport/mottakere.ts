import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { memberships, reportPreferences, sites, users } from "@/db/schema";

/**
 * Hvem som får rapportene på e-post: månedsrapporten og «X nye forslag» fra den ukentlige AI-rapporten.
 * Eieren får dem uten å gjøre noe, og kan slå dem av under Innstillinger. Redaktøren får dem bare hvis hen
 * slår dem på selv. Utvikleren får dem ikke. Valget gjelder én bruker på ett nettsted.
 */

export type ReportKind = "monthlyReport" | "aiEmail";
export type Role = "owner" | "editor" | "developer";
export type ReportPrefs = Record<ReportKind, boolean>;

export function canChooseReports(role: Role): boolean {
  return role === "owner" || role === "editor";
}

/** Det som gjelder når brukeren ikke har valgt selv. */
export function defaultPrefs(role: Role): ReportPrefs {
  const on = role === "owner";
  return { monthlyReport: on, aiEmail: on };
}

export async function readPrefs(db: Db, siteId: string, userId: string, role: Role): Promise<ReportPrefs> {
  const [row] = await db
    .select({ monthlyReport: reportPreferences.monthlyReport, aiEmail: reportPreferences.aiEmail })
    .from(reportPreferences)
    .where(and(eq(reportPreferences.siteId, siteId), eq(reportPreferences.userId, userId)))
    .limit(1);
  return row ?? defaultPrefs(role);
}

export class ReportPrefsError extends Error {}

export async function savePrefs(db: Db, siteId: string, userId: string, role: Role, prefs: ReportPrefs, now = new Date()) {
  if (!canChooseReports(role)) throw new ReportPrefsError("Rapportene på e-post er for eier og redaktør.");
  const values = { monthlyReport: Boolean(prefs.monthlyReport), aiEmail: Boolean(prefs.aiEmail) };
  await db
    .insert(reportPreferences)
    .values({ siteId, userId, ...values, updatedAt: now })
    .onConflictDoUpdate({ target: [reportPreferences.siteId, reportPreferences.userId], set: { ...values, updatedAt: now } });
}

export type Recipient = { userId: string; email: string; name: string | null; role: Role };

/** Brukerne på nettstedet som skal ha denne rapporten, etter rolle og eget valg. */
export async function reportRecipients(db: Db, siteId: string, kind: ReportKind): Promise<Recipient[]> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      monthlyReport: reportPreferences.monthlyReport,
      aiEmail: reportPreferences.aiEmail,
    })
    .from(sites)
    .innerJoin(memberships, eq(memberships.orgId, sites.orgId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(reportPreferences, and(eq(reportPreferences.siteId, sites.id), eq(reportPreferences.userId, users.id)))
    .where(eq(sites.id, siteId));
  return rows
    .filter((r) => canChooseReports(r.role) && (r[kind] ?? defaultPrefs(r.role)[kind]))
    .map((r) => ({ userId: r.userId, email: r.email, name: r.name, role: r.role }));
}
