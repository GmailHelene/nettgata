import { headers } from "next/headers";
import { VisitBeacon } from "@/components/site/visit-beacon";
import { isPlatformHost } from "@/lib/hosts";

/**
 * Felles for alle sider på kundenettstedene. Besøkstelleren ligger her og ikke i siden, så den følger med
 * når besøkende bytter side. På plattformens egne adresser (nettgata.no og /vis) telles ingenting.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  return (
    <>
      {children}
      {!isPlatformHost(host) && <VisitBeacon />}
    </>
  );
}
