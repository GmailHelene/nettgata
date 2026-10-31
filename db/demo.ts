import type { PageContent } from "@/lib/content/types";
import type { Theme } from "@/lib/theme";

/** Demodata for håndverkerpakken. Brukes av seed-skriptet og testene. */
export const demoTheme: Theme = {
  primary: "#0b4f6c",
  onPrimary: "#ffffff",
  background: "#ffffff",
  surface: "#eef4f7",
  text: "#14202b",
  muted: "#4a5a68",
  fonts: "robust",
  radius: "myk",
};

export const demoFrontpage: PageContent = {
  seo: {
    title: "Rørlegger i Modum | Demo Rør AS",
    description: "Rørlegger i Modum og omegn. Bad, varmtvann og akutte lekkasjer. Fast pris på vanlige jobber.",
  },
  sections: [
    {
      id: "hero",
      type: "hero",
      variant: "standard",
      props: {
        overskrift: "Rørlegger i Modum som svarer samme dag",
        undertekst: "Bad, varmtvannsbereder og lekkasjer. Fast pris på de vanligste jobbene, og du får et skriftlig tilbud før vi starter.",
        knappTekst: "Be om tilbud",
        knappLenke: "#kontakt",
      },
    },
    {
      id: "tjenester",
      type: "tjenester",
      variant: "standard",
      props: {
        overskrift: "Dette hjelper vi med",
        tjenester: [
          { navn: "Nytt bad", beskrivelse: "Fra riving til ferdig bad, med våtromssertifikat.", pris: "Pris etter befaring" },
          { navn: "Varmtvannsbereder", beskrivelse: "Bytte av bereder inkludert frakt av den gamle.", pris: "Fra 14 900 kr" },
          { navn: "Akutt lekkasje", beskrivelse: "Vi kommer samme dag i Modum, Øvre Eiker og Sigdal.", pris: "Timepris" },
        ],
      },
    },
    {
      id: "om",
      type: "tekst",
      variant: "standard",
      props: {
        overskrift: "Om oss",
        brodtekst: "Demo Rør AS er et lokalt rørleggerfirma med sentral godkjenning.\n\nVi har jobbet i Modum siden 2009 og gir alltid skriftlig tilbud før jobben starter.",
      },
    },
    {
      id: "kontakt",
      type: "kontakt",
      variant: "standard",
      props: {
        overskrift: "Kontakt oss",
        telefon: "900 00 000",
        epost: "post@demo-ror.no",
        adresse: "Storgata 1, 3340 Åmot",
        apningstider: [
          { dag: "Mandag til fredag", tid: "07.00 - 16.00" },
          { dag: "Lørdag og søndag", tid: "Kun akutt" },
        ],
      },
    },
  ],
};
