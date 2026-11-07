import type { Pack } from "./index";

export const TERMS_TEMPLATE_URL =
  "https://www.forbrukertilsynet.no/lov-og-rett/veiledninger-og-retningslinjer/standard-salgsbetingelser-for-forbrukerkjop-av-varer-over-internett";

/** Nettbutikk med fysiske varer: klær, interiør, leker, mat, håndverk og lignende. */
export const nettbutikk: Pack = {
  key: "nettbutikk",
  label: "Nettbutikk",
  description: "Butikk med fysiske varer, varianter, lager, frakt og henting.",
  schemaType: "OnlineStore",
  kind: "nettbutikk",
  themes: ["boutique", "fjord", "atelier", "nordlys"],
  layout: {
    footerText: "Skriv én setning om butikken og hva du selger.",
    footerColumns: [
      {
        title: "Butikken",
        links: [
          { label: "Alle varer", href: "/produkter" },
          { label: "Om oss", href: "/om-oss" },
        ],
      },
      {
        title: "Kundeservice",
        links: [
          { label: "Kontakt oss", href: "/kontakt" },
          { label: "Kjøpsvilkår", href: "/kjopsvilkar" },
        ],
      },
    ],
  },
  pages: ({ name }) => [
    {
      path: "/",
      title: "Forside",
      showInMenu: true,
      content: {
        seo: { title: name.slice(0, 70), description: `Handle hos ${name}. Trygg betaling, rask levering og enkel retur.`.slice(0, 170) },
        sections: [
          {
            id: "hero",
            type: "hero",
            variant: "sentrert",
            props: {
              overskrift: "Skriv hva butikken selger, kort og tydelig",
              undertekst: "Én setning om hva som gjør varene dine verdt å kjøpe.",
              knappTekst: "Se alle varer",
              knappLenke: "/produkter",
            },
          },
          {
            id: "fordeler",
            type: "fordeler",
            variant: "stripe",
            background: "flate",
            props: {
              punkter: [
                { tittel: "Rask levering", tekst: "Skriv hvor raskt du sender" },
                { tittel: "14 dagers angrerett", tekst: "Enkel retur" },
                { tittel: "Trygg betaling", tekst: "Skriv hvilke betalingsmåter du har" },
              ],
            },
          },
          {
            id: "nyheter",
            type: "produkter",
            variant: "karusell",
            props: { overskrift: "Nyheter", utvalg: "nyeste", knappTekst: "Se alle varer" },
          },
          {
            id: "utvalgte",
            type: "produkter",
            variant: "standard",
            props: { overskrift: "Populære varer", utvalg: "utvalgte", knappTekst: "" },
          },
          {
            id: "trygghet",
            type: "faq",
            variant: "standard",
            props: {
              overskrift: "Spørsmål og svar",
              sporsmal: [
                { sporsmal: "Hvor lang tid tar levering?", svar: "Skriv hvor raskt du sender, og med hvem." },
                { sporsmal: "Kan jeg returnere varer?", svar: "Ja. Du har 14 dagers angrerett. Se kjøpsvilkårene." },
              ],
            },
          },
        ],
      },
    },
    {
      path: "/om-oss",
      title: "Om oss",
      showInMenu: true,
      content: {
        seo: { title: `Om ${name}`.slice(0, 70) },
        sections: [
          {
            id: "om",
            type: "tekst",
            variant: "standard",
            props: { overskrift: `Om ${name}`, brodtekst: "Fortell hvem som står bak butikken, hvor varene kommer fra og hva du er opptatt av." },
          },
        ],
      },
    },
    {
      path: "/kontakt",
      title: "Kontakt",
      showInMenu: true,
      content: {
        seo: { title: `Kontakt ${name}`.slice(0, 70) },
        sections: [
          { id: "kontakt", type: "kontakt", variant: "skjema", props: { overskrift: "Kontakt oss", tekst: "Spørsmål om en vare eller en bestilling? Skriv til oss." } },
        ],
      },
    },
    // Kjøpsvilkårene lages automatisk på /kjopsvilkar (lib/legal/angrerett.ts, lagKjopsvilkar) fra butikkens opplysninger.
  ],
};

type ShopVariant = Pick<Pack, "key" | "label" | "description" | "themes"> & { hero: { overskrift: string; undertekst: string } };

/** Samme butikk med egen tekst i toppen, så forhåndsvisningen og utkastet passer bransjen fra start. */
function shopPack(variant: ShopVariant): Pack {
  const { hero, ...rest } = variant;
  return {
    ...nettbutikk,
    ...rest,
    pages: (input) =>
      nettbutikk.pages(input).map((page) =>
        page.path !== "/"
          ? page
          : {
              ...page,
              content: {
                ...page.content,
                sections: page.content.sections.map((s) => (s.id === "hero" ? { ...s, props: { ...s.props, ...hero } } : s)),
              },
            },
      ),
  };
}

export const shopVariants = [
  shopPack({
    key: "klaer",
    label: "Klær og mote",
    description: "Klær, sko og tilbehør.",
    themes: ["boutique", "atelier", "nordlys", "galleri"],
    hero: { overskrift: "Klær du får lyst til å bruke hver dag", undertekst: "Skriv én setning om stilen, kvaliteten eller hvor klærne kommer fra." },
  }),
  shopPack({
    key: "interior",
    label: "Interiør og gaver",
    description: "Interiør, gaver, keramikk og brukskunst.",
    themes: ["atelier", "boutique", "hytte", "galleri"],
    hero: { overskrift: "Ting som gjør hjemmet litt finere", undertekst: "Skriv én setning om utvalget og hva som gjør det spesielt." },
  }),
  shopPack({
    key: "lokalmat",
    label: "Gårdsbutikk og lokalmat",
    description: "Mat, drikke og produkter fra egen gård eller lokale produsenter.",
    themes: ["hytte", "bistro", "boutique"],
    hero: { overskrift: "Lokal mat, rett fra gården", undertekst: "Skriv hva du lager, hvor det kommer fra og hvordan kundene får det." },
  }),
];
