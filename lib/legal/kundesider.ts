import type { PageContent } from "@/lib/content/types";
import { availablePaymentMethods, readShopSettings } from "@/lib/shop/settings";
import { readSiteInfo } from "@/lib/site-info";
import { lagAngrerettside } from "./angrerett";
import { lagPersonvernerklaering } from "./personvern";

type SiteLike = { name: string; kind: "nettside" | "nettbutikk"; info: unknown; shop: unknown };

/** Sidene alle kundenettsteder får automatisk, med lenke i bunnteksten. En egen side med samme adresse vinner. */
export const GENERATED_PATHS = { personvern: "/personvern", angrerett: "/angrerett" } as const;

/**
 * Personvernerklæringen (alle) og angrerettsiden (nettbutikker), laget fra nettstedets egne opplysninger og valg.
 * Oppdateres av seg selv når kunden endrer info eller betalingsmåter, fordi de lages når siden vises.
 * bookingHosts er bookingsystemene som er bygget inn på de publiserte sidene (embeddedBookingHosts).
 */
export function generatedLegalPage(
  site: SiteLike,
  path: string,
  extra: { bookingHosts?: readonly string[] } = {},
): PageContent | null {
  const butikk = { navn: site.name, info: readSiteInfo(site.info) };
  const shop = site.kind === "nettbutikk";
  const betalingsmater = shop ? availablePaymentMethods(readShopSettings(site.shop)) : [];
  if (path === GENERATED_PATHS.personvern) {
    // AI-rapporten er ikke bygget ennå. Erklæringen nevner den først når den er slått på.
    return lagPersonvernerklaering({
      virksomhet: butikk,
      type: site.kind,
      betalingsmater,
      ai: false,
      bookingtjenester: extra.bookingHosts,
    });
  }
  if (path === GENERATED_PATHS.angrerett && shop) return lagAngrerettside({ butikk, betalingsmater });
  return null;
}
