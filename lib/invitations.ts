import bcrypt from "bcryptjs";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, invitations, memberships, sites, users } from "@/db/schema";
import { TEKSTVERSJON } from "@/lib/legal/felles";

/**
 * Invitasjon av brukere til et nettsted: eieren inviterer kunden eller en kollega med e-post og rolle,
 * og får en lenke som virker i sju dager. Bare et hash av lenken lagres, så en databaselekkasje gir ingen
 * brukbare lenker. Er e-post satt opp (Brevo), sendes lenken også på e-post.
 */

export const roles = { owner: "Eier", editor: "Redaktør", developer: "Utvikler" } as const;
export type Role = keyof typeof roles;
export const roleHelp: Record<Role, string> = {
  owner: "Kan alt, også invitere andre og endre abonnement og domene.",
  editor: "Kan endre og publisere sider, bilder og varer.",
  developer: "Som redaktør, for den som hjelper til med det tekniske.",
};

const DAYS = 7;

export class InvitationError extends Error {}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createInvitation(db: Db, input: { siteId: string; email: string; role: string; invitedBy: string }, now = new Date()) {
  const email = input.email.trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 120) throw new InvitationError("Sjekk e-postadressen");
  if (!(input.role in roles)) throw new InvitationError("Velg en rolle");
  const [site] = await db.select({ id: sites.id, orgId: sites.orgId }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) throw new InvitationError("Fant ikke nettstedet");

  const [member] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, site.orgId), eq(users.email, email)))
    .limit(1);
  if (member) throw new InvitationError("Denne personen har allerede tilgang");

  const token = newToken();
  const [invitation] = await db
    .insert(invitations)
    .values({
      orgId: site.orgId,
      siteId: site.id,
      email,
      role: input.role as Role,
      tokenHash: await sha256(token),
      invitedBy: input.invitedBy,
      expiresAt: new Date(now.getTime() + DAYS * 86_400_000),
    })
    .returning();
  await db.insert(auditLog).values({ siteId: site.id, userId: input.invitedBy, action: "invitation.created", detail: { email, role: input.role } });
  return { invitation, token };
}

/** Invitasjonen bak en lenke, hvis den finnes, ikke er brukt og ikke har gått ut. */
export async function findInvitation(db: Db, token: string, now = new Date()) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ invitation: invitations, siteName: sites.name })
    .from(invitations)
    .innerJoin(sites, eq(sites.id, invitations.siteId))
    .where(and(eq(invitations.tokenHash, await sha256(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

/**
 * Tar imot invitasjonen. Innlogget bruker: e-posten må være den som ble invitert. Ellers lages en ny bruker
 * med navn og passord. Lenken kan bare brukes én gang.
 */
export async function acceptInvitation(
  db: Db,
  token: string,
  who: { userId: string } | { name: string; password: string },
  now = new Date(),
  /** Eiere er kunden i avtalen med Nettgata, så de må godta vilkårene og databehandleravtalen. */
  acceptedTerms = false,
): Promise<{ userId: string; siteId: string }> {
  const found = await findInvitation(db, token, now);
  if (!found) throw new InvitationError("Lenken virker ikke lenger. Be om en ny invitasjon.");
  const { invitation } = found;
  if (invitation.role === "owner" && !acceptedTerms) throw new InvitationError("Du må godta vilkårene og databehandleravtalen for å bli eier");

  let userId: string;
  if ("userId" in who) {
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, who.userId)).limit(1);
    if (!user || user.email !== invitation.email) throw new InvitationError(`Invitasjonen gjelder ${invitation.email}. Logg inn med den adressen.`);
    userId = user.id;
  } else {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1);
    if (existing) throw new InvitationError(`Det finnes allerede en bruker med ${invitation.email}. Logg inn først, og åpne lenken igjen.`);
    const name = who.name.trim();
    if (!name || name.length > 100) throw new InvitationError("Skriv navnet ditt");
    if (who.password.length < 12) throw new InvitationError("Passordet må ha minst 12 tegn");
    if (who.password.length > 200) throw new InvitationError("Passordet er for langt");
    const [user] = await db
      .insert(users)
      // Lenken kom til denne adressen, så e-posten regnes som bekreftet.
      .values({ email: invitation.email, name, passwordHash: await bcrypt.hash(who.password, 12), emailVerifiedAt: now })
      .returning({ id: users.id });
    userId = user.id;
  }

  // Merkes brukt først, med sjekk, så samme lenke ikke kan brukes to ganger samtidig.
  const [claimed] = await db
    .update(invitations)
    .set({ acceptedAt: now })
    .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id });
  if (!claimed) throw new InvitationError("Lenken er allerede brukt");
  await db.insert(memberships).values({ orgId: invitation.orgId, userId, role: invitation.role }).onConflictDoNothing();
  await db.insert(auditLog).values({
    siteId: invitation.siteId,
    userId,
    action: "invitation.accepted",
    // Hvilken versjon av vilkårene som ble godtatt, og når (createdAt), er beviset om noen spør.
    detail: { role: invitation.role, ...(invitation.role === "owner" && { vilkar: TEKSTVERSJON, databehandleravtale: TEKSTVERSJON }) },
  });
  return { userId, siteId: invitation.siteId };
}

/** Brukerne med tilgang og invitasjonene som venter, til «Brukere» i innstillingene. */
export async function listAccess(db: Db, siteId: string, now = new Date()) {
  const [site] = await db.select({ orgId: sites.orgId }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { members: [], pending: [] };
  const members = await db
    .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, site.orgId))
    .orderBy(asc(users.email));
  const pending = await db
    .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(eq(invitations.siteId, siteId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, now)))
    .orderBy(asc(invitations.createdAt));
  return { members, pending };
}

export async function revokeInvitation(db: Db, siteId: string, invitationId: string, userId: string) {
  await db.delete(invitations).where(and(eq(invitations.id, invitationId), eq(invitations.siteId, siteId), isNull(invitations.acceptedAt)));
  await db.insert(auditLog).values({ siteId, userId, action: "invitation.revoked", detail: { invitationId } });
}

/** Fjerner en bruker. Siste eier kan ikke fjernes, ellers står nettstedet uten noen som kan administrere det. */
export async function removeMember(db: Db, siteId: string, memberId: string, userId: string) {
  const [site] = await db.select({ orgId: sites.orgId }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new InvitationError("Fant ikke nettstedet");
  const all = await db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.orgId, site.orgId));
  const target = all.find((m) => m.userId === memberId);
  if (!target) return;
  if (target.role === "owner" && all.filter((m) => m.role === "owner").length <= 1) throw new InvitationError("Nettstedet må ha minst én eier");
  await db.delete(memberships).where(and(eq(memberships.orgId, site.orgId), eq(memberships.userId, memberId)));
  await db.insert(auditLog).values({ siteId, userId, action: "member.removed", detail: { memberId } });
}
