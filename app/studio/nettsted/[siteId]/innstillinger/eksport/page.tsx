import type { Metadata } from "next";
import { requireSiteAccess } from "@/lib/session";
import { SiteNav } from "../../site-nav";
import { ExportPanel } from "../export-panel";
import { OwnerOnly } from "../owner-note";

export const metadata: Metadata = { title: "Last ned alt" };

/** Innstillinger › Last ned alt. Filen har alle personopplysningene til nettstedet, så bare eieren får lage den. */
export default async function ExportPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, role } = await requireSiteAccess(siteId);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} active="innstillinger" title="Last ned alt" />
      {role === "owner" ? <ExportPanel siteId={site.id} /> : <OwnerOnly>Bare eieren kan laste ned alt, fordi filen har opplysningene om alle kundene.</OwnerOnly>}
    </main>
  );
}
