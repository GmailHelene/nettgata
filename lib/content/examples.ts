import { EXAMPLE_IMAGE_SRC, type Field, type ImageValue } from "./fields";
import { sectionRegistry } from "./registry";
import type { Section, SectionType } from "./types";

/**
 * Eksempelinnhold til seksjonsbiblioteket. Teksten forklarer hva som bør stå der, så den er lett å
 * kjenne igjen hvis den blir stående. Tekst merket med ex() gir et varsel før publisering.
 */
const exampleTexts = new Set<string>();
function ex(text: string): string {
  exampleTexts.add(text);
  return text;
}

const bilde: ImageValue = { src: EXAMPLE_IMAGE_SRC, alt: "Eksempelbilde" };
const kunde = () => ({ navn: ex("Navn på kunden"), sted: ex("Sted") });

const examples: Record<SectionType, Record<string, unknown>> = {
  hero: {
    overskrift: ex("Skriv hva dere gjør, i én setning"),
    undertekst: ex("Fortell kort hvem dere hjelper og hvorfor kundene velger dere. To linjer holder."),
    knappTekst: "Ta kontakt",
    knappLenke: "/kontakt",
    bilde,
  },
  tekst: {
    overskrift: "Om oss",
    brodtekst: ex(
      "Skriv et par avsnitt om bedriften. Hvem står bak, hvor holder dere til, og hvor lenge har dere holdt på?\n\n" +
        "Skriv som du snakker. Kundene vil vite hvem de handler med, og vanlige ord gjør mer enn flotte ord.",
    ),
  },
  bildetekst: {
    overskrift: "Slik jobber vi",
    brodtekst: ex(
      "Vis noe ekte i bildet, for eksempel lokalet, et ferdig oppdrag eller folkene bak. " +
        "Bruk teksten til å fortelle hva kunden ser og hva de kan forvente.",
    ),
    bilde,
    knappTekst: "",
    knappLenke: "",
  },
  fordeler: {
    overskrift: "",
    punkter: [
      { tittel: "Levering", tekst: ex("Hvor fort får kunden det de har bestilt?") },
      { tittel: "Betaling", tekst: ex("Vipps, kort, faktura eller noe annet") },
      { tittel: "Garanti", tekst: ex("Skriv hva kunden kan regne med hvis noe går galt") },
    ],
  },
  kategorikort: {
    overskrift: "Finn det du ser etter",
    kort: ["Nyheter", "Mest kjøpt", "Gaver", "Salg"].map((tittel) => ({ tittel, tekst: "", bilde, lenke: "/produkter" })),
  },
  tjenester: {
    overskrift: "Tjenester og priser",
    tjenester: [
      {
        navn: ex("Navnet på tjenesten"),
        beskrivelse: ex("Hva er med, og hvor lang tid tar det? Kunder liker å vite det før de tar kontakt."),
        pris: ex("fra 990 kr"),
      },
      { navn: ex("En tjeneste til"), beskrivelse: ex("Skriv prisen slik du ville sagt den til en kunde."), pris: ex("1 500 kr") },
      {
        navn: ex("Pris etter avtale"),
        beskrivelse: ex("Noe er vanskelig å prise på forhånd. Da kan du si det rett ut."),
        pris: "Etter avtale",
      },
    ],
  },
  produkter: { overskrift: "Utvalgte varer", utvalg: "utvalgte", knappTekst: "Se alle varene" },
  galleri: { overskrift: "Bilder", bilder: Array.from({ length: 6 }, () => ({ bilde, tekst: "" })) },
  omtaler: {
    overskrift: "Hva kundene sier",
    omtaler: [
      { sitat: ex("Her limer du inn noe en ekte kunde har skrevet, for eksempel fra Google eller en e-post."), ...kunde() },
      { sitat: ex("Spør kunden om lov først, og skriv det slik kunden sa det."), ...kunde() },
      { sitat: ex("Oppdiktede omtaler er ulovlig, så bruk bare ekte tilbakemeldinger."), ...kunde() },
    ],
  },
  faq: {
    overskrift: "Spørsmål og svar",
    sporsmal: [
      { sporsmal: ex("Hva lurer kundene oftest på?"), svar: ex("Skriv svaret slik du ville sagt det på telefonen. Kort og konkret.") },
      {
        sporsmal: "Hvor raskt kan dere hjelpe?",
        svar: ex("Mange vil vite dette før de tar kontakt. Et ærlig svar gir færre spørsmål i innboksen."),
      },
      { sporsmal: "Hva koster det?", svar: ex("Har dere faste priser, skriv dem her. Hvis ikke, forklar hva prisen avhenger av.") },
    ],
  },
  kontakt: { overskrift: "Kontakt oss", tekst: "Send en melding her, eller ring oss om det haster." },
  cta: {
    overskrift: "Lurer du på noe?",
    tekst: ex("Skriv hva kunden får hvis de tar kontakt nå, for eksempel et uforpliktende tilbud."),
    knappTekst: "Ta kontakt",
    knappLenke: "/kontakt",
  },
};

/** Seksjonen slik den vises i biblioteket. */
export function exampleSection(type: SectionType, variant: string, id = `eksempel-${type}-${variant}`): Section {
  const props = structuredClone(examples[type]);
  // Toppseksjonen viser bare bildet i bildevariantene. Et usynlig eksempelbilde ville stoppet publiseringen.
  if (type === "hero" && variant !== "bilde" && variant !== "bakgrunn") props.bilde = null;
  return { id, type, variant, props };
}

/** Interne lenker i eksemplene beholdes bare hvis siden finnes, ellers blir det en død lenke på nettstedet. */
function dropMissingLinks(fields: Field[], value: Record<string, unknown>, paths: ReadonlySet<string>) {
  for (const field of fields) {
    const current = value[field.key];
    if (field.type === "link" && typeof current === "string" && current.startsWith("/") && !paths.has(current)) {
      value[field.key] = "";
      // En valgfri knapp uten lenke vises ikke. Da skal ikke knappeteksten stå igjen og forvirre.
      if (field.optional && typeof value.knappTekst === "string") value.knappTekst = "";
    }
    if (field.type === "list" && Array.isArray(current)) {
      for (const item of current) dropMissingLinks(field.fields, item as Record<string, unknown>, paths);
    }
  }
}

/**
 * Seksjonen som settes inn på siden. Kundeomtaler starter tomme, fordi bare ekte omtaler skal inn.
 * `paths` er sidene som finnes på nettstedet.
 */
export function newSection(type: SectionType, variant: string, id: string, paths: Iterable<string>): Section {
  const section = exampleSection(type, variant, id);
  if (type === "omtaler") section.props.omtaler = [];
  dropMissingLinks(sectionRegistry[type].fields, section.props, new Set(paths));
  return section;
}

/** Om seksjonen fortsatt har eksempeltekst som bør byttes ut før publisering. */
export function hasExampleText(section: Section): boolean {
  const walk = (value: unknown): boolean => {
    if (typeof value === "string") return exampleTexts.has(value.trim());
    if (Array.isArray(value)) return value.some(walk);
    return value !== null && typeof value === "object" && Object.values(value).some(walk);
  };
  return walk(section.props);
}
