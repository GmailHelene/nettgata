"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { deliver, getEmailProvider } from "@/lib/email/send";
import { invitationEmail } from "@/lib/email/templates";
import { acceptInvitation, createInvitation, InvitationError, removeMember, revokeInvitation, roles, type Role } from "@/lib/invitations";
import { platformOrigin } from "@/lib/platform-routes";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { createSession, getCurrentUser, requireSiteAccess } from "@/lib/session";
import type { ActionState } from "./actions";

export type InviteState = (ActionState & { link?: string; emailed?: boolean }) | null;

function toState(err: unknown): { ok: false; message: string } {
  unstable_rethrow(err);
  if (err instanceof InvitationError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

/** Bare eiere (og Helene som plattformadmin) kan gi andre tilgang. */
async function requireOwner(siteId: string) {
  const access = await requireSiteAccess(siteId);
  if (access.role !== "owner") throw new InvitationError("Bare eieren kan invitere og fjerne brukere");
  return access;
}

export async function inviteAction(siteId: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const { user, site } = await requireOwner(siteId);
    const db = await getDb();
    const email = String(formData.get("email") ?? "");
    const role = String(formData.get("role") ?? "editor");
    const { token, invitation } = await createInvitation(db, { siteId: site.id, email, role, invitedBy: user.id });

    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
    const link = `${platformOrigin(`${proto}://${h.get("host") ?? "localhost"}`)}/studio/invitasjon/${token}`;

    const provider = getEmailProvider();
    const mail = invitationEmail({ siteName: site.name, inviter: user.name || user.email, role: roles[invitation.role as Role], link });
    await deliver(db, provider, { siteId: site.id, kind: "invitasjon" }, { to: { email: invitation.email }, fromName: "Nettgata", ...mail });
    revalidatePath(`/studio/nettsted/${site.id}/innstillinger`);
    const emailed = provider.name !== "logg";
    return {
      ok: true,
      message: emailed
        ? `Invitasjonen er sendt til ${invitation.email}. Du kan også sende lenken selv.`
        : `Send lenken til ${invitation.email}. Den virker i sju dager og kan brukes én gang.`,
      link,
      emailed,
    };
  } catch (err) {
    return toState(err);
  }
}

export async function revokeInvitationAction(siteId: string, invitationId: string): Promise<ActionState> {
  try {
    const { user, site } = await requireOwner(siteId);
    await revokeInvitation(await getDb(), site.id, invitationId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/innstillinger`);
    return { ok: true, message: "Invitasjonen er trukket tilbake" };
  } catch (err) {
    return toState(err);
  }
}

export async function removeMemberAction(siteId: string, memberId: string): Promise<ActionState> {
  try {
    const { user, site } = await requireOwner(siteId);
    await removeMember(await getDb(), site.id, memberId, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/innstillinger`);
    return { ok: true, message: "Brukeren har ikke lenger tilgang" };
  } catch (err) {
    return toState(err);
  }
}

/**
 * Godtar en invitasjon. Offentlig (den inviterte har kanskje ingen bruker ennå), så antall forsøk begrenses.
 * Ny bruker blir logget inn med en gang og sendt til nettstedet.
 */
export async function acceptInvitationAction(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let siteId: string;
  try {
    const db = await getDb();
    const ipKey = await clientKey(await headers(), getSecret());
    if (!(await hit(db, `invitation-ip:${ipKey}`, rules.loginPerIp))) return { ok: false, message: "For mange forsøk. Vent et kvarter og prøv igjen." };

    const current = await getCurrentUser();
    const acceptedTerms = formData.get("vilkar") === "ja";
    if (current) {
      siteId = (await acceptInvitation(db, token, { userId: current.id }, new Date(), acceptedTerms)).siteId;
    } else {
      const password = String(formData.get("password") ?? "");
      if (password !== String(formData.get("password2") ?? "")) return { ok: false, message: "Passordene er ikke like" };
      const result = await acceptInvitation(db, token, { name: String(formData.get("name") ?? ""), password }, new Date(), acceptedTerms);
      await createSession(result.userId);
      siteId = result.siteId;
    }
  } catch (err) {
    return toState(err);
  }
  redirect(`/studio/nettsted/${siteId}`);
}
