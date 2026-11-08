import { EXAMPLE_IMAGE_SRC, type ImageValue } from "@/lib/content/fields";
import type { Section } from "@/lib/content/types";
import { packImages } from "./bilder";
import type { Pack, PackInput, PackPage } from "./index";

/** Tekstene en side trenger: firmanavnet, stedet og « i <sted>» når stedet ikke står i navnet fra før. */
export type Copy = { name: string; city: string; area: string };

/** Navn, kort forklaring og pris. Tom pris vises ikke. */
type Item = [navn: string, beskrivelse: string, pris?: string];

/**
 * Oppskriften på en tjenestebedrift. Fabrikken under lager sidene, så hver bransje bare
 * trenger tekstene sine. Bildetekstene (alt) sier hva slags bilde kunden bør laste opp.
 */
export type Profile = {
  key: string;
  label: string;
  description: string;
  schemaType: string;
  /** Temaene som passer best. Det første er standard, men kunden kan velge alle. */
  themes: string[];
  hero: {
    title: (c: Copy) => string;
    text: string;
    button: string;
    link?: string;
    variant?: "bilde" | "bakgrunn";
    image: string;
  };
  benefits: [tittel: string, tekst: string][];
  services: { heading: string; items: Item[] };
  prices: { path: string; title: string; heading: string; items: Item[] };
  about: { text: string; image: string };
  gallery?: { heading: string; image: string; page?: { path: string; title: string } };
  faq: [sporsmal: string, svar: string][];
  cta: { heading: string; text: string; button: string; link?: string };
  /** `fields`: egne felt i kontaktskjemaet, i samme form som seksjonen lagrer dem (skjemafelt). */
  contact: { text: string; fields?: { etikett: string; felttype: string; valg?: string; pakrevd: "ja" | "nei" }[] };
  /**
   * Lokalpakken for bransjen: ansatte på «Om oss», åpningstider på forsiden, kart på kontaktsiden
   * og PDF-meny på prissiden. Menyen starter slått av, og kunden slår den på når PDF-en er lastet opp.
   */
  local?: { team?: string; hours?: boolean; map?: boolean; menu?: boolean };
};

const image = (alt: string): ImageValue => ({ src: EXAMPLE_IMAGE_SRC, alt });
const items = (list: Item[]) => list.map(([navn, beskrivelse, pris = ""]) => ({ navn, beskrivelse, pris }));
const galleryItems = (key: string, alt: string, count: number) =>
  Array.from({ length: count }, () => ({ bilde: packImages[key]?.gallery ?? image(alt), tekst: "" }));
const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

function copyFor({ name, city }: PackInput): Copy {
  // Står stedet allerede i firmanavnet, gjentas det ikke («Rør Modum AS i Modum»).
  const area = city && !name.toLowerCase().includes(city.toLowerCase()) ? ` i ${city}` : "";
  return { name, city, area };
}

function cta(profile: Profile, id = "cta"): Section {
  return {
    id,
    type: "cta",
    variant: "standard",
    props: { overskrift: profile.cta.heading, tekst: profile.cta.text, knappTekst: profile.cta.button, knappLenke: profile.cta.link ?? "/kontakt" },
  };
}

/** Plassholdere i «Skriv ...»-form, så publisering stopper til kunden har fylt inn ekte folk. */
function team(heading: string): Section {
  const person = () => ({
    navn: "Skriv navn",
    rolle: "Skriv rolle",
    bilde: image("Bilde av personen"),
    tekst: "Skriv et par setninger om hva personen jobber med.",
    epost: "",
    telefon: "",
  });
  return { id: "ansatte", type: "ansatte", variant: "kort", props: { overskrift: heading, tekst: "", personer: [person(), person()] } };
}

const hoursSection: Section = { id: "apningstider", type: "apningstider", variant: "standard", props: { overskrift: "Åpningstider", tekst: "" } };
const mapSection: Section = { id: "kart", type: "kart", variant: "kart", props: { overskrift: "Finn veien hit", tekst: "" } };
// Slått av til kunden har lastet opp menyen, så siden kan publiseres uten den.
const menuSection: Section = {
  id: "pdf-meny",
  type: "filer",
  variant: "standard",
  hidden: true,
  props: { overskrift: "Menyen som PDF", tekst: "", filer: [{ tittel: "Last ned menyen", fil: null }] },
};

/** Lager en bransjepakke med forside, prisside, om oss, galleri (hvis bransjen har det) og kontakt. */
export function servicePack(profile: Profile): Pack {
  const local = profile.local ?? {};
  return {
    key: profile.key,
    label: profile.label,
    description: profile.description,
    schemaType: profile.schemaType,
    themes: profile.themes,
    pages: (input) => {
      const c = copyFor(input);
      const { hero, gallery } = profile;
      const pages: PackPage[] = [
        {
          path: "/",
          title: "Forside",
          showInMenu: true,
          content: {
            seo: {
              title: clip(`${c.name}${c.area}`, 70),
              description: clip(`${hero.title(c)}. ${hero.text}`, 170),
            },
            sections: [
              {
                id: "hero",
                type: "hero",
                variant: hero.variant ?? "bilde",
                props: {
                  overskrift: clip(hero.title(c), 90),
                  undertekst: hero.text,
                  knappTekst: hero.button,
                  knappLenke: hero.link ?? "/kontakt",
                  bilde: packImages[profile.key]?.hero ?? image(hero.image),
                },
              },
              {
                id: "fordeler",
                type: "fordeler",
                variant: "stripe",
                props: { overskrift: "", punkter: profile.benefits.map(([tittel, tekst]) => ({ tittel, tekst })) },
              },
              { id: "tjenester", type: "tjenester", variant: "standard", props: { overskrift: profile.services.heading, tjenester: items(profile.services.items) } },
              {
                id: "om",
                type: "bildetekst",
                variant: "bilde-hoyre",
                background: "flate",
                props: {
                  overskrift: `Om ${c.name}`,
                  brodtekst: profile.about.text,
                  bilde: packImages[profile.key]?.about ?? image(profile.about.image),
                  knappTekst: "Les mer om oss",
                  knappLenke: "/om-oss",
                },
              },
              ...(gallery
                ? [{ id: "galleri", type: "galleri", variant: "rutenett", props: { overskrift: gallery.heading, bilder: galleryItems(profile.key, gallery.image, 3) } } satisfies Section]
                : []),
              ...(local.hours ? [hoursSection] : []),
              cta(profile),
            ],
          },
        },
        {
          path: profile.prices.path,
          title: profile.prices.title,
          showInMenu: true,
          content: {
            seo: { title: clip(`${profile.prices.title} | ${c.name}`, 70) },
            sections: [
              { id: "priser", type: "tjenester", variant: "liste", props: { overskrift: profile.prices.heading, tjenester: items(profile.prices.items) } },
              ...(local.menu ? [menuSection] : []),
              {
                id: "faq",
                type: "faq",
                variant: "standard",
                props: { overskrift: "Spørsmål og svar", sporsmal: profile.faq.map(([sporsmal, svar]) => ({ sporsmal, svar })) },
              },
              cta(profile),
            ],
          },
        },
        {
          path: "/om-oss",
          title: "Om oss",
          showInMenu: true,
          content: {
            seo: { title: clip(`Om ${c.name}`, 70) },
            sections: [
              {
                id: "om",
                type: "bildetekst",
                variant: "bilde-venstre",
                props: { overskrift: `Om ${c.name}`, brodtekst: profile.about.text, bilde: packImages[profile.key]?.about ?? image(profile.about.image) },
              },
              ...(local.team ? [team(local.team)] : []),
              {
                id: "fordeler",
                type: "fordeler",
                variant: "kort",
                props: { overskrift: "Derfor velger folk oss", punkter: profile.benefits.map(([tittel, tekst]) => ({ tittel, tekst })) },
              },
              cta(profile),
            ],
          },
        },
      ];
      if (gallery?.page) {
        pages.push({
          path: gallery.page.path,
          title: gallery.page.title,
          showInMenu: true,
          content: {
            seo: { title: clip(`${gallery.page.title} | ${c.name}`, 70) },
            sections: [{ id: "galleri", type: "galleri", variant: "rutenett", props: { overskrift: gallery.heading, bilder: galleryItems(profile.key, gallery.image, 6) } }],
          },
        });
      }
      pages.push({
        path: "/kontakt",
        title: "Kontakt",
        showInMenu: true,
        content: {
          seo: { title: clip(`Kontakt ${c.name}`, 70) },
          sections: [
            {
              id: "kontakt",
              type: "kontakt",
              variant: "skjema",
              props: {
                overskrift: "Kontakt oss",
                tekst: profile.contact.text,
                skjemafelt: (profile.contact.fields ?? []).map((f) => ({ valg: "", ...f })),
              },
            },
            ...(local.map ? [mapSection] : []),
          ],
        },
      });
      return pages;
    },
  };
}
