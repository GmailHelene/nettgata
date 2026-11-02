import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domains, pages } from "@/db/schema";
import { displayHost, rootOf } from "@/lib/domains";
import { presetOf } from "@/lib/themes";
import { readBringAccount } from "@/lib/bring/state";
import { readShopSettings } from "@/lib/shop/settings";
import { requireSiteAccess } from "@/lib/session";
import { readSiteInfo } from "@/lib/site-info";
import { SiteNav } from "../site-nav";
import { SettingsForm } from "./settings-form";
import { ShopSettingsForm } from "./shop-settings-form";
import { AppearanceForm } from "./appearance-form";
import { NotificationsForm } from "./notifications-form";
import { readNotificationSettings } from "@/lib/notifications";
import { getEmailProvider } from "@/lib/email/send";
import { readSiteLayout } from "@/lib/site-layout";
import { listAccess } from "@/lib/invitations";
import { AccessForm } from "./access-form";
import { RedirectsForm } from "./redirects-form";
import { FaviconForm } from "./favicon-form";
import { letterIconSvg } from "@/lib/favicon";
import { canChooseReports, readPrefs } from "@/lib/rapport/mottakere";
import { ReportForm } from "./report-form";
import { ExportPanel } from "./export-panel";

export default async function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, user, role } = await requireSiteAccess(siteId);
  const preset = presetOf(site.theme);
  const access = await listAccess(await getDb(), site.id);
  const domainRows = await (await getDb()).select().from(domains).where(eq(domains.siteId, site.id));
  const primary = domainRows.find((d) => d.isPrimary && d.status === "active");
  const waiting = domainRows.find((d) => d.status === "pending" && d.kind !== "apex");

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="innstillinger" />
      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-5">
        <div>
          <h2 className="font-semibold">Domene</h2>
          <p className="text-sm text-neutral-600">
            {primary
              ? `Live på ${displayHost(primary.hostname)}`
              : waiting
                ? `${displayHost(rootOf(waiting))} venter på DNS-pekerne`
                : "Nettstedet har ikke eget domene ennå"}
          </p>
        </div>
        <Link href={`/studio/nettsted/${site.id}/domene`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          {primary || waiting ? "Administrer domene" : "Koble til domene"}
        </Link>
      </section>
      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-5">
        <div>
          <h2 className="font-semibold">Design</h2>
          <p className="text-sm text-neutral-600">
            {preset ? `Temaet ${preset.def.label}, fargene ${preset.palette.label}` : "Eget oppsett fra før temaene kom"}
          </p>
        </div>
        <Link href={`/studio/nettsted/${site.id}/design`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          Bytt tema eller tilpass
        </Link>
      </section>
      <SettingsForm siteId={site.id} name={site.name} info={readSiteInfo(site.info)} />
      <AppearanceForm siteId={site.id} initial={readSiteLayout(site.layout)} />
      <FaviconForm
        siteId={site.id}
        current={readSiteLayout(site.layout).favicon?.src ?? null}
        fallback={`data:image/svg+xml,${encodeURIComponent(letterIconSvg(site.name, site.theme))}`}
      />
      {canChooseReports(role) && <ReportForm siteId={site.id} initial={await readPrefs(await getDb(), site.id, user.id, role)} email={user.email} />}
      <AccessForm
        siteId={site.id}
        canManage={role === "owner"}
        currentUserId={user.id}
        members={access.members}
        pending={access.pending.map((p) => ({ ...p, expiresAt: p.expiresAt.toISOString() }))}
      />
      {/* Omdirigeringer, varsler og butikkoppsett styrer trafikk, personopplysninger og penger. Serveren sjekker det samme. */}
      {role === "owner" ? (
        <>
          <RedirectsForm siteId={site.id} initial={site.redirects ?? []} />
          <NotificationsForm
            siteId={site.id}
            initial={readNotificationSettings(site.notifications)}
            contactEmail={readSiteInfo(site.info).email}
            shop={site.kind === "nettbutikk"}
            emailEnabled={getEmailProvider().name !== "logg"}
          />
          {site.kind === "nettbutikk" && (
            <ShopSettingsForm
              siteId={site.id}
              initial={readShopSettings(site.shop)}
              pages={(await (await getDb()).select().from(pages).where(eq(pages.siteId, site.id)).orderBy(asc(pages.sortOrder))).map((p) => ({
                path: p.path,
                title: p.title,
                published: p.publishedVersionId !== null,
              }))}
            />
          )}
        </>
      ) : (
        <p className="mb-8 rounded-lg border bg-white p-5 text-sm text-neutral-700">
          Omdirigeringer, varsler{site.kind === "nettbutikk" ? ", frakt og betalingsmåter" : ""} kan bare endres av eieren av nettstedet.
        </p>
      )}
      {site.kind === "nettbutikk" && <BringLink siteId={site.id} shop={site.shop} />}
      {/* Filen har alle personopplysningene til nettstedet, så bare eieren får lage og laste den ned. */}
      {role === "owner" && <ExportPanel siteId={site.id} />}
    </main>
  );
}

/** Frakt med Bring har egen side, med butikkens egen Mybring-konto. */
function BringLink({ siteId, shop }: { siteId: string; shop: unknown }) {
  const account = readBringAccount(shop);
  return (
    <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-5">
      <div>
        <h2 className="font-semibold">Frakt med Bring</h2>
        <p className="text-sm text-neutral-600">
          {account?.testedAt
            ? `Koblet til${account.environment === "test" ? " i testmodus" : ""}. Kassen viser pris fra Bring.`
            : account
              ? "Ikke i bruk før tilkoblingen er testet"
              : "Pris fra Bring i kassen og fraktetikett fra ordren, med din egen Bring-avtale"}
        </p>
      </div>
      <Link href={`/studio/nettsted/${siteId}/innstillinger/bring`} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
        {account ? "Administrer Bring" : "Sett opp Bring"}
      </Link>
    </section>
  );
}
