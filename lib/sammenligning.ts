/**
 * Prisene til konkurrentene på /sammenlign. Hvert tall er lest av på leverandørens egen prisside den datoen som
 * står her (markedsføringsloven § 6 og § 7: ingenting påstås uten at det er sjekket). Sjekk på nytt og oppdater
 * datoen før siden endres, og minst hver tredje måned.
 */
export const SAMMENLIGNING_SJEKKET = "20.11.2026";

export type Konkurrent = {
  navn: string;
  kilde: string;
  /** Det billigste abonnementet som gir en nettside eller nettbutikk, slik siden viser det. */
  billigst: string;
  /** Det som står på prissiden om gebyrer, betaling og prøvetid. */
  punkter: string[];
};

export const konkurrenter: Konkurrent[] = [
  {
    navn: "Quickbutik",
    kilde: "https://quickbutik.com/no/priser",
    billigst: "Startup: 179 kr/mnd ved betaling per år. Standard 699 kr og Pro 999 kr per måned, per år.",
    punkter: [
      "Kortgebyr i Quickbutik Checkout på Startup: 1,95 % + 1,85 kr per kjøp, eks. mva.",
      "Vipps, Klarna og kort er med i kassen.",
      "Gratis i 14 dager, og du kan avslutte når som helst.",
      "Laget for nettbutikk.",
    ],
  },
  {
    navn: "Shopify",
    kilde: "https://www.shopify.com/no/pricing",
    billigst: "Basic: 289 kr/mnd ved årlig betaling, 389 kr/mnd ved månedlig betaling.",
    punkter: [
      "Kortgebyr med Shopify Payments på Basic: 2 % + 2,00 kr per kjøp.",
      "Bruker du en annen betalingsløsning enn Shopify Payments, er transaksjonsgebyret 2 % på Basic.",
      "Vipps er ikke nevnt på prissiden.",
      "Laget for nettbutikk.",
    ],
  },
  {
    navn: "Wix",
    kilde: "https://no.wix.com/pricing",
    billigst: "Light: US$ 14 i måneden. Core, som er den billigste med «Godta betalinger», koster US$ 25 i måneden.",
    punkter: [
      "Prisene vises i dollar på den norske siden.",
      "Gratis domene det første året.",
      "14 dagers pengene-tilbake-garanti på Premium-pakkene.",
      "Vipps er ikke nevnt på prissiden.",
    ],
  },
];
