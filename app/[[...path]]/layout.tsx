import { headers } from "next/headers";
import { VisitBeacon } from "@/components/site/visit-beacon";
import { isPlatformHost, normalizeHost } from "@/lib/hosts";

/**
 * Felles for alle sider på kundenettstedene. Besøkstelleren ligger her og ikke i siden, så den følger med
 * når besøkende bytter side. Av plattformens egne adresser telles bare nettgata.no, og aldri /vis.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  return (
    <>
      {children}
      {(!isPlatformHost(host) || (Boolean(process.env.PLATFORM_STATS_SITE_ID) && normalizeHost(host) === normalizeHost(process.env.PLATFORM_CANONICAL_HOST))) && <VisitBeacon />}
    </>
  );
}
