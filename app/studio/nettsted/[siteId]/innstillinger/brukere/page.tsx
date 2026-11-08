import type { Metadata } from "next";
import { getDb } from "@/db";
import { listAccess } from "@/lib/invitations";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { AccessForm } from "../access-form";

export const metadata: Metadata = { title: "Brukere og tilgang" };

/** Innstillinger › Brukere og tilgang. Alle ser hvem som har tilgang, bare eieren kan invitere og fjerne. */
export default async function UsersPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user, role } = await requireSiteAccess(siteId);
  const access = await listAccess(await getDb(), site.id);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Brukere og tilgang" />
      <AccessForm
        siteId={site.id}
        canManage={role === "owner"}
        currentUserId={user.id}
        members={access.members}
        pending={access.pending.map((p) => ({ ...p, expiresAt: p.expiresAt.toISOString() }))}
      />
    </main>
  );
}
