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
  designs: [
    {
      key: "ren",
      label: "Ren og enkel",
      theme: {
        primary: "#111111",
        onPrimary: "#ffffff",
        background: "#ffffff",
        surface: "#f4f4f2",
        text: "#111111",
        muted: "#555555",
        fonts: "moderne",
        radius: "skarp",
      },
    },
    {
      key: "varm",
      label: "Varm",
      theme: {
        primary: "#8a3b12",
        onPrimary: "#ffffff",
        background: "#fbf7f2",
        surface: "#f1e8dc",
        text: "#2b1d14",
        muted: "#5e4a3c",
        fonts: "klassisk",
        radius: "myk",
      },
    },
    {
      key: "frisk",
      label: "Frisk",
      theme: {
        primary: "#0f5c4a",
        onPrimary: "#ffffff",
        background: "#ffffff",
        surface: "#e8f3ef",
        text: "#10221d",
        muted: "#4a5d57",
        fonts: "moderne",
        radius: "rund",
      },
    },
  ],
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
    {
      // Plassholder med vilje: vilkårene skal bygge på Forbrukertilsynets mal og godkjennes av butikken.
      // Kassen er stengt til denne siden er publisert.
      path: "/kjopsvilkar",
      title: "Kjøpsvilkår",
      showInMenu: false,
      content: {
        seo: { title: `Kjøpsvilkår | ${name}`.slice(0, 70) },
        sections: [
          {
            id: "vilkar",
            type: "tekst",
            variant: "standard",
            props: {
              overskrift: "Kjøpsvilkår",
              brodtekst: `IKKE PUBLISER FØR DETTE ER ERSTATTET.\n\nLim inn Forbrukertilsynets standard salgsbetingelser for forbrukerkjøp av varer over Internett, fylt ut med butikkens navn, org.nr., kontaktinformasjon, betaling, frakt og angreskjema. Malen ligger her: ${TERMS_TEMPLATE_URL}`,
            },
          },
        ],
      },
    },
  ],
};
