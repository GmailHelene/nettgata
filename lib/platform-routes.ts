import type { Metadata } from "next";
import { genres, lowerLabel, type BransjeMatch } from "@/lib/genres";
import { getPack } from "@/lib/packs";

/**
 * Sidene på plattformens egen adresse (nettgata.no). De ligger i samme rute som kundenettstedene, men
 * slås bare opp når vertsnavnet er plattformens, så en kunde kan fortsatt ha en egen side som heter /nettbutikk.
 */
export type PlatformRoute =
  | { kind: "landing" }
  | { kind: "nettbutikk" }
  | { kind: "temaer" }
  | { kind: "bransjer" }
  | { kind: "bransje"; match: BransjeMatch }
  | { kind: "juridisk"; doc: "personvern" | "vilkar" | "databehandleravtale" };

/**
 * Bransjer som får egen landingsside. «Annen bedrift» er ingen bransje folk søker etter,
 * og den generelle nettbutikken har sin egen side, /nettbutikk.
 */
export function landingBransjer(): BransjeMatch[] {
  return genres.flatMap((genre) =>
    genre.bransjer
      .filter((b) => b.pack !== "bedrift" && b.pack !== "nettbutikk")
      .map((bransje) => ({ genre, bransje, pack: getPack(bransje.pack)! }))
      .filter((m) => m.pack),
  );
}

export function platformRoute(segments: string[]): PlatformRoute | null {
  const [first, second, ...rest] = segments;
  if (rest.length) return null;
  if (!first) return { kind: "landing" };
  if (second === undefined) {
    if (first === "nettbutikk" || first === "temaer" || first === "bransjer") return { kind: first };
    if (first === "personvern" || first === "vilkar" || first === "databehandleravtale") return { kind: "juridisk", doc: first };
    return null;
  }
  if (first === "bransjer") {
    const match = landingBransjer().find((m) => m.bransje.pack === second);
    return match ? { kind: "bransje", match } : null;
  }
  return null;
}


/** Pakkens eget navn, så «Annet håndverk» i sjangerlisten blir «Nettside for håndverker» her, slik annonsene sier. */
export function bransjeHeading(m: BransjeMatch): string {
  return `${m.pack.kind === "nettbutikk" ? "Nettbutikk" : "Nettside"} for ${lowerLabel(m.pack.label)}`;
}

export function platformPath(route: PlatformRoute): string {
  switch (route.kind) {
    case "landing":
      return "/";
    case "bransje":
      return `/bransjer/${route.match.bransje.pack}`;
    case "juridisk":
      return `/${route.doc}`;
    default:
      return `/${route.kind}`;
  }
}

/** Alle sidene, til sitemap.xml på plattformens adresse. */
export function platformPaths(): string[] {
  const routes: PlatformRoute[] = [
    { kind: "landing" },
    { kind: "nettbutikk" },
    { kind: "temaer" },
    { kind: "bransjer" },
    ...landingBransjer().map((match) => ({ kind: "bransje" as const, match })),
    { kind: "juridisk", doc: "personvern" },
    { kind: "juridisk", doc: "vilkar" },
    { kind: "juridisk", doc: "databehandleravtale" },
  ];
  return routes.map(platformPath);
}

/** Hovedadressen i kanoniske lenker, også når siden vises via reserveadressen på workers.dev. */
export function platformOrigin(fallback: string): string {
  const host = process.env.PLATFORM_CANONICAL_HOST?.trim();
  return host ? `https://${host}` : fallback;
}

const titles: Record<Exclude<PlatformRoute["kind"], "bransje" | "juridisk">, [string, string]> = {
  landing: [
    "Nettside og nettbutikk for norske bedrifter | Nettgata",
    "Ferdige bransjepakker, 12 temaer og nettbutikk med Vipps og Klarna. Fra 199 kr i måneden eks. mva, og domenet står alltid i ditt navn.",
  ],
  nettbutikk: [
    "Nettbutikk med Vipps og Klarna | Nettgata",
    "Nettbutikk med varer, varianter, lager, rabattkoder og frakt. Betalingen går rett til deg. 399 kr i måneden eks. mva.",
  ],
  temaer: ["Temaer for nettsiden din | Nettgata", "12 temaer med fire fargevarianter hver. Se din egen nettside i hvert tema før du velger."],
  bransjer: [
    "Nettside for din bransje | Nettgata",
    "Bransjepakker for håndverkere, frisører, kafeer, regnskapskontorer, fotografer og mange flere. Sidene og tekstene er klare fra start.",
  ],
};

const legalTitles = { personvern: "Personvernerklæring", vilkar: "Vilkår", databehandleravtale: "Databehandleravtale" } as const;

export function platformMetadata(route: PlatformRoute, origin: string): Metadata {
  const [title, description] =
    route.kind === "bransje"
      ? [
          `${bransjeHeading(route.match)} | Nettgata`,
          `${bransjeHeading(route.match)}, med sider, tekster og prisliste klare fra start. ${route.match.pack.description} Domenet står alltid i ditt navn.`,
        ]
      : route.kind === "juridisk"
        ? [`${legalTitles[route.doc]} | Nettgata`, `${legalTitles[route.doc]} for Nettgata, levert av Grønberg Tech Solutions.`]
        : titles[route.kind];
  const url = `${platformOrigin(origin)}${platformPath(route)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { siteName: "Nettgata", locale: "nb_NO", type: "website", title, description, url },
    twitter: { card: "summary" },
  };
}
