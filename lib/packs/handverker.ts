import type { Pack } from "./index";

/** Håndverker: elektriker, rørlegger, snekker, maler, taktekker og lignende. */
export const handverker: Pack = {
  key: "handverker",
  label: "Håndverker",
  description: "Elektriker, rørlegger, snekker, maler og andre som tar oppdrag hjemme hos kunden.",
  schemaType: "HomeAndConstructionBusiness",
  themes: ["verksted", "fjord", "kontor"],
  pages: ({ name, city }) => {
    // Står stedet allerede i firmanavnet, gjentas det ikke («Rør Modum AS i Modum»).
    const area = city && !name.toLowerCase().includes(city.toLowerCase()) ? ` i ${city}` : "";
    return [
      {
        path: "/",
        title: "Forside",
        showInMenu: true,
        content: {
          seo: {
            title: `${name}${area}`.slice(0, 70),
            description: `${name} tar oppdrag${area} og omegn. Be om et uforpliktende tilbud.`.slice(0, 170),
          },
          sections: [
            {
              id: "hero",
              type: "hero",
              variant: "standard",
              props: {
                overskrift: `Fagfolk du kan stole på${area}`,
                undertekst: "Vi gir deg et skriftlig tilbud før jobben starter, og vi rydder etter oss.",
                knappTekst: "Be om tilbud",
                knappLenke: "/kontakt",
              },
            },
            {
              id: "tjenester",
              type: "tjenester",
              variant: "standard",
              props: {
                overskrift: "Dette hjelper vi med",
                tjenester: [
                  { navn: "Tjeneste 1", beskrivelse: "Skriv kort hva du gjør og for hvem.", pris: "" },
                  { navn: "Tjeneste 2", beskrivelse: "Skriv kort hva du gjør og for hvem.", pris: "" },
                  { navn: "Tjeneste 3", beskrivelse: "Skriv kort hva du gjør og for hvem.", pris: "" },
                ],
              },
            },
            {
              id: "om",
              type: "tekst",
              variant: "standard",
              props: {
                overskrift: `Om ${name}`,
                brodtekst: "Fortell hvor lenge du har holdt på, hvilke områder du dekker og hvilke godkjenninger du har.",
              },
            },
            {
              id: "cta",
              type: "cta",
              variant: "standard",
              props: {
                overskrift: "Klar for et tilbud?",
                tekst: "Fortell oss kort hva du trenger, så svarer vi innen én virkedag.",
                knappTekst: "Kontakt oss",
                knappLenke: "/kontakt",
              },
            },
          ],
        },
      },
      {
        path: "/tjenester",
        title: "Tjenester",
        showInMenu: true,
        content: {
          seo: { title: `Tjenester og priser | ${name}`.slice(0, 70) },
          sections: [
            {
              id: "prisliste",
              type: "tjenester",
              variant: "liste",
              props: {
                overskrift: "Tjenester og priser",
                tjenester: [
                  { navn: "Befaring", beskrivelse: "Vi ser på jobben og gir deg en fast pris.", pris: "Gratis" },
                  { navn: "Timepris", beskrivelse: "For mindre jobber og service.", pris: "" },
                ],
              },
            },
            {
              id: "cta",
              type: "cta",
              variant: "standard",
              props: {
                overskrift: "Usikker på hva du trenger?",
                tekst: "Send en kort beskrivelse, gjerne med bilde, så hjelper vi deg videre.",
                knappTekst: "Kontakt oss",
                knappLenke: "/kontakt",
              },
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
        },
      },
    ];
  },
};
