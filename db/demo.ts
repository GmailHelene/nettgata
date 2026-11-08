import type { PageContent } from "@/lib/content/types";
import type { SiteInfo } from "@/lib/site-info";
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
      variant: "skjema",
      props: {
        overskrift: "Kontakt oss",
        tekst: "Beskriv jobben kort, så svarer vi innen én virkedag.",
      },
    },
  ],
};

export const demoInfo: SiteInfo = {
  mvaRegistrert: true,
  phone: "900 00 000",
  email: "post@demo-ror.no",
  street: "Storgata 1",
  postalCode: "3340",
  city: "Åmot",
  orgnr: "",
  openingHours: [
    { day: "Mandag til fredag", time: "07.00 - 16.00" },
    { day: "Lørdag og søndag", time: "Kun akutt" },
  ],
  specialHours: [],
};
