import type { PageContent } from "@/lib/content/types";
import { availablePaymentMethods, readShopSettings } from "@/lib/shop/settings";
import { aiTeamActive } from "@/lib/ai/access";
import { readSiteInfo } from "@/lib/site-info";
import { lagAngrerettside, lagKjopsvilkar } from "./angrerett";
import { juridiskeMangler } from "./felles";
import { lagPersonvernerklaering } from "./personvern";

type SiteLike = { name: string; kind: "nettside" | "nettbutikk"; info: unknown; shop: unknown; billing?: unknown };

/** Sidene alle kundenettsteder får automatisk, med lenke i bunnteksten. En egen side med samme adresse vinner. */
export const GENERATED_PATHS = { personvern: "/personvern", angrerett: "/angrerett", kjopsvilkar: "/kjopsvilkar" } as const;

/**
 * Personvernerklæringen (alle) og angrerettsiden (nettbutikker), laget fra nettstedets egne opplysninger og valg.
 * Oppdateres av seg selv når kunden endrer info eller betalingsmåter, fordi de lages når siden vises.
 * bookingHosts er bookingsystemene som er bygget inn på de publiserte sidene (embeddedBookingHosts).
 * ownBooking er sant når egen timebestilling er i bruk (usesOwnBooking i lib/egen-booking/store.ts).
 * newsletter er sant når nyhetsbrevet er i bruk (usesNewsletter i lib/nyhetsbrev/subscribers.ts).
 * embeds sier om de publiserte sidene har kart eller video som lastes ved trykk (embeddedServices i lib/embeds.ts).
 * inquiryImages er sant når et publisert kontaktskjema har felt for bilder (usesInquiryImages i lib/henvendelser/bilder.ts).
 */
export function generatedLegalPage(
  site: SiteLike,
  path: string,
  extra: { bookingHosts?: readonly string[]; ownBooking?: boolean; newsletter?: boolean; embeds?: { kart?: boolean; video?: boolean }; inquiryImages?: boolean } = {},
): PageContent | null {
  const shop = site.kind === "nettbutikk";
  const info = readSiteInfo(site.info);
  // «MVA» etter org.nr. bare for nettbutikker, der bedriften selv har svart på om den er registrert.
  const butikk = { navn: site.name, info, mva: shop && info.mvaRegistrert };
  const betalingsmater = shop ? availablePaymentMethods(readShopSettings(site.shop)) : [];
  if (path === GENERATED_PATHS.personvern) {
    // Anthropic nevnes bare når AI-teamet er med i abonnementet.
    return lagPersonvernerklaering({
      virksomhet: butikk,
      type: site.kind,
      betalingsmater,
      ai: aiTeamActive(site.billing),
      bookingtjenester: extra.bookingHosts,
      egenBooking: extra.ownBooking,
      nyhetsbrev: extra.newsletter,
      innebygd: extra.embeds,
      bilderISkjema: extra.inquiryImages,
    });
  }
  if (path === GENERATED_PATHS.angrerett && shop) return lagAngrerettside({ butikk, betalingsmater });
  if (path === GENERATED_PATHS.kjopsvilkar && shop) return lagKjopsvilkar({ butikk, betalingsmater });
  return null;
}

/**
 * Har butikken kjøpsvilkår kassen kan lenke til? En publisert egen side på termsPath holder alltid. Står termsPath
 * på standardadressen, holder de automatiske vilkårene, men bare når navn, adresse, e-post, org.nr. og telefon er
 * fylt ut, fordi vilkårene ellers mangler opplysninger loven krever.
 */
export async function hasCheckoutTerms(
  site: SiteLike,
  termsPath: string,
  findPublished: (path: string) => Promise<unknown>,
): Promise<boolean> {
  if (await findPublished(termsPath)) return true;
  if (site.kind !== "nettbutikk" || termsPath !== GENERATED_PATHS.kjopsvilkar) return false;
  return juridiskeMangler({ navn: site.name, info: readSiteInfo(site.info) }, { nettbutikk: true }).length === 0;
}
