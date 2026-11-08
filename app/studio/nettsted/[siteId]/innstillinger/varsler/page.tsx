import type { Metadata } from "next";
import { getDb } from "@/db";
import { getEmailProvider } from "@/lib/email/send";
import { readNotificationSettings } from "@/lib/notifications";
import { canChooseReports, readPrefs } from "@/lib/rapport/mottakere";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../../site-nav";
import { NotificationsForm } from "../notifications-form";
import { OwnerOnly } from "../owner-note";
import { ReportForm } from "../report-form";

export const metadata: Metadata = { title: "Varsler på e-post" };

/** Innstillinger › Varsler på e-post: hvem som får beskjed om henvendelser og ordre, og månedsrapporten. */
export default async function NotificationsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user, role } = await requireSiteAccess(siteId);
  const shop = site.kind === "nettbutikk";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Varsler på e-post" />
      {/* Varslene inneholder personopplysninger, så eieren bestemmer hvem som får dem. Serveren sjekker det samme. */}
      {role === "owner" ? (
        <NotificationsForm
          siteId={site.id}
          initial={readNotificationSettings(site.notifications)}
          contactEmail={readSiteInfo(site.info).email}
          shop={shop}
          emailEnabled={getEmailProvider().name !== "logg"}
        />
      ) : (
        <OwnerOnly>
          Hvem som får varsel om henvendelser{shop ? " og ordre" : ""}, kan bare eieren endre, fordi varslene inneholder kundenes opplysninger.
        </OwnerOnly>
      )}
      {canChooseReports(role) && <ReportForm siteId={site.id} initial={await readPrefs(await getDb(), site.id, user.id, role)} email={user.email} />}
    </main>
  );
}
