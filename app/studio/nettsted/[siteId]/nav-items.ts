/**
 * Menyen for ett nettsted. Gruppert etter hvor ofte ting brukes, som i Shopify: det daglige øverst,
 * nettstedet og markedsføringen i midten, Innstillinger som eget rom nederst.
 * Moduler som ikke er i bruk (booking, nyhetsbrev, AI-teamet) står ikke i menyen før de er tatt i bruk,
 * men ligger under «Legg til funksjon». Gjennomgangen av studioet i november 2026 (reports/admin-gjennomgang-2026-11).
 */

export type NavBadgeKey = "ordre" | "henvendelser" | "ai-teamet";
export type NavModule = "booking" | "nyhetsbrev" | "ai-teamet";
/** Punkter som bare vises når funksjonen er åpnet for brukeren, uten å være en modul man legger til selv. */
export type NavFeature = "fiken";

export type NavItem = {
  label: string;
  /** Relativt til /studio/nettsted/<id>. Tom streng er Hjem. */
  href: string;
  shopOnly?: boolean;
  module?: NavModule;
  feature?: NavFeature;
  badge?: NavBadgeKey;
  /** Kort forklaring under «Legg til funksjon». */
  pitch?: string;
  children?: NavItem[];
  /** Sider under denne adressen hører til punktet, også når de ikke står i menyen. */
  also?: string[];
};

export type NavGroup = { label?: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    items: [
      { label: "Hjem", href: "" },
      { label: "Ordre", href: "/ordre", shopOnly: true, badge: "ordre" },
      {
        label: "Varer",
        href: "/varer",
        shopOnly: true,
        children: [
          { label: "Alle varer", href: "/varer" },
          { label: "Pris og lager", href: "/varer/pris-og-lager" },
          { label: "Import", href: "/varer/import" },
        ],
      },
      { label: "Kunder", href: "/kunder", shopOnly: true },
      { label: "Henvendelser", href: "/henvendelser", badge: "henvendelser" },
      { label: "Booking", href: "/booking", module: "booking", pitch: "Kundene bestiller time på nettstedet." },
    ],
  },
  {
    label: "Nettsted",
    items: [
      { label: "Sider og meny", href: "/sider", also: ["/side"] },
      {
        label: "Design",
        href: "/design",
        children: [
          { label: "Tema og farger", href: "/design" },
          { label: "Logo og bunntekst", href: "/design/logo" },
        ],
      },
      { label: "Bilder", href: "/bilder" },
    ],
  },
  {
    label: "Markedsføring",
    items: [
      { label: "Rabatter", href: "/rabatter", shopOnly: true },
      { label: "Nyhetsbrev", href: "/nyhetsbrev", module: "nyhetsbrev", pitch: "Samle e-postadresser og send nyhetsbrev." },
      { label: "AI-teamet", href: "/ai-teamet", module: "ai-teamet", badge: "ai-teamet", pitch: "Forslag til tekster, Google og sosiale medier." },
    ],
  },
  {
    label: "Tall",
    items: [
      { label: "Salg og MVA", href: "/rapporter", shopOnly: true },
      { label: "Besøk", href: "/statistikk" },
    ],
  },
  {
    label: "Innstillinger",
    items: [
      {
        label: "Innstillinger",
        href: "/innstillinger",
        also: ["/domene", "/last-ned"],
        children: [
          { label: "Firma og kontakt", href: "/innstillinger" },
          { label: "Betaling", href: "/betaling", shopOnly: true },
          { label: "Frakt og levering", href: "/innstillinger/frakt", shopOnly: true },
          { label: "Vilkår og lager", href: "/innstillinger/butikk", shopOnly: true },
          { label: "Varsler på e-post", href: "/innstillinger/varsler" },
          { label: "Brukere og tilgang", href: "/innstillinger/brukere" },
          { label: "Google og synlighet", href: "/innstillinger/google" },
          { label: "Flytt fra gammel side", href: "/innstillinger/flytt" },
          { label: "Regnskap (Fiken)", href: "/innstillinger/regnskap", shopOnly: true, feature: "fiken" },
          { label: "Domene", href: "/domene" },
          { label: "Last ned alt", href: "/innstillinger/eksport" },
          { label: "Abonnement", href: "/abonnement" },
        ],
      },
    ],
  },
];

/** Navnet på siden i nettleserfanen, for adresser som ikke står i menyen. */
const extraTitles: [RegExp, string][] = [
  [/^\/side\/[^/]+/, "Rediger side"],
  [/^\/varer\/ny$/, "Ny vare"],
  [/^\/varer\/[^/]+$/, "Rediger vare"],
  [/^\/ordre\/[^/]+$/, "Ordre"],
  [/^\/kunder\/[^/]+$/, "Kunde"],
  [/^\/rabatter\/[^/]+$/, "Rabatt"],
  [/^\/nyhetsbrev\/abonnenter$/, "Abonnenter"],
  [/^\/domene/, "Domene"],
  [/^\/last-ned/, "Last ned alt"],
  [/^\/innstillinger\/bring/, "Frakt og levering"],
];

function flatten(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
}

/** Menypunktet som hører til adressen: det lengste som passer, så /varer/pris-og-lager vinner over /varer. */
export function activeHref(groups: NavGroup[], rest: string): string | null {
  let best: { href: string; len: number } | null = null;
  for (const item of flatten(groups)) {
    for (const prefix of [item.href, ...(item.also ?? [])]) {
      const hit = prefix === "" ? rest === "" : rest === prefix || rest.startsWith(`${prefix}/`);
      if (hit && (!best || prefix.length > best.len)) best = { href: item.href, len: prefix.length };
    }
  }
  return best?.href ?? null;
}

export function pageLabel(groups: NavGroup[], rest: string): string {
  // Forsiden av Innstillinger er undersiden Firma og kontakt, og fanen skal si det samme som overskriften.
  if (rest === "/innstillinger") return "Firma og kontakt";
  const exact = flatten(groups).find((i) => i.href === rest);
  if (exact) return exact.label;
  for (const [re, label] of extraTitles) if (re.test(rest)) return label;
  const href = activeHref(groups, rest);
  return flatten(groups).find((i) => i.href === href)?.label ?? "Studio";
}

/** Menyen for dette nettstedet: butikkpunkter bare for nettbutikker, moduler bare når de er i bruk. */
export function visibleNav(o: {
  shop: boolean;
  modules: Record<NavModule, boolean>;
  features?: Partial<Record<NavFeature, boolean>>;
}): { groups: NavGroup[]; addable: NavItem[] } {
  const keep = (i: NavItem) => (o.shop || !i.shopOnly) && (!i.module || o.modules[i.module]) && (!i.feature || Boolean(o.features?.[i.feature]));
  const groups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(keep).map((i) => (i.children ? { ...i, children: i.children.filter(keep) } : i)),
    }))
    .filter((g) => g.items.length > 0);
  const addable = flatten(navGroups).filter((i) => i.module && !o.modules[i.module]);
  return { groups, addable };
}
