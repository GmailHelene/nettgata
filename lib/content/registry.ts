import type { ZodType } from "zod";
import { fieldsToZod, type Field, type ValidationMode } from "./fields";
import { formFieldProblems, formFieldsField } from "./form-fields";
import { pageContentSchema, type PageContent, type Section, type SectionType } from "./types";

export type SectionDefinition = {
  label: string;
  /** Kort forklaring i seksjonsbiblioteket. */
  description: string;
  /** Vises øverst når seksjonen redigeres. */
  hint?: string;
  variants: { key: string; label: string }[];
  fields: Field[];
  /** Sjekker som går på tvers av feltene. Gjelder bare ved publisering, så kladden kan lagres uferdig. */
  check?: (props: Record<string, unknown>) => string[];
};

export const sectionRegistry: Record<SectionType, SectionDefinition> = {
  hero: {
    label: "Toppseksjon",
    description: "Det første folk ser. Én tydelig overskrift og gjerne en knapp.",
    variants: [
      { key: "standard", label: "Venstrestilt" },
      { key: "sentrert", label: "Sentrert" },
      { key: "bilde", label: "Med bilde ved siden av" },
      { key: "bakgrunn", label: "Bilde som bakgrunn" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", max: 90 },
      { key: "undertekst", label: "Undertekst", type: "textarea", max: 300, optional: true },
      { key: "knappTekst", label: "Knappetekst", type: "text", max: 40, optional: true },
      { key: "knappLenke", label: "Knappelenke", type: "link", optional: true },
      { key: "bilde", label: "Bilde", type: "image", optional: true },
    ],
  },
  tekst: {
    label: "Tekst",
    description: "Vanlig tekst, for eksempel om bedriften eller hvordan dere jobber.",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      { key: "brodtekst", label: "Tekst", type: "textarea", max: 6000 },
    ],
  },
  bildetekst: {
    label: "Bilde og tekst",
    description: "Et bilde med tekst ved siden av.",
    variants: [
      { key: "bilde-venstre", label: "Bilde til venstre" },
      { key: "bilde-hoyre", label: "Bilde til høyre" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      { key: "brodtekst", label: "Tekst", type: "textarea", max: 3000 },
      { key: "bilde", label: "Bilde", type: "image" },
      { key: "knappTekst", label: "Knappetekst", type: "text", max: 40, optional: true },
      { key: "knappLenke", label: "Knappelenke", type: "link", optional: true },
    ],
  },
  galleri: {
    label: "Bildegalleri",
    description: "Flere bilder samlet på ett sted.",
    variants: [
      { key: "rutenett", label: "Rutenett" },
      { key: "store", label: "Store bilder" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      {
        key: "bilder",
        label: "Bilder",
        type: "list",
        itemLabel: "Bilde",
        max: 40,
        fields: [
          { key: "bilde", label: "Bilde", type: "image" },
          { key: "tekst", label: "Bildetekst", type: "text", max: 160, optional: true },
        ],
      },
    ],
  },
  omtaler: {
    // Bare ekte omtaler fra ekte kunder. Oppdiktede omtaler er ulovlig etter markedsføringsloven.
    label: "Kundeomtaler",
    description: "Hva ekte kunder har sagt om dere.",
    hint: "Bruk bare ekte omtaler fra ekte kunder, og spør gjerne om lov først. Oppdiktede omtaler er ulovlig etter markedsføringsloven.",
    variants: [{ key: "standard", label: "Kort" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      {
        key: "omtaler",
        label: "Omtaler",
        type: "list",
        itemLabel: "Omtale",
        max: 12,
        fields: [
          { key: "sitat", label: "Hva kunden sa", type: "textarea", max: 600 },
          { key: "navn", label: "Navn", type: "text", max: 80 },
          { key: "sted", label: "Sted eller firma", type: "text", max: 80, optional: true },
        ],
      },
    ],
  },
  faq: {
    label: "Spørsmål og svar",
    description: "Det kundene ofte lurer på, med svar.",
    variants: [{ key: "standard", label: "Utvidbare" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      {
        key: "sporsmal",
        label: "Spørsmål",
        type: "list",
        itemLabel: "Spørsmål",
        max: 30,
        fields: [
          { key: "sporsmal", label: "Spørsmål", type: "text", max: 200 },
          { key: "svar", label: "Svar", type: "textarea", max: 2000 },
        ],
      },
    ],
  },
  produkter: {
    // Gjør ingenting på nettsteder uten butikk.
    label: "Varer",
    description: "Varer fra butikken, hentet automatisk fra varelisten.",
    hint: "Varene hentes fra varelisten. Her velger du bare hvilke som vises.",
    variants: [
      { key: "standard", label: "Rutenett" },
      { key: "karusell", label: "Karusell" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      {
        key: "utvalg",
        label: "Hvilke varer",
        type: "select",
        options: [
          { value: "utvalgte", label: "De første i varelisten" },
          { value: "nyeste", label: "Nyeste" },
          { value: "salg", label: "På salg (med førpris)" },
          { value: "lager", label: "På lager nå" },
        ],
      },
      { key: "samling", label: "Bare varer fra samlingen", type: "collection" },
      { key: "knappTekst", label: "Knappetekst til alle varer", type: "text", max: 40, optional: true },
    ],
  },
  blogg: {
    label: "Blogginnlegg",
    description: "De siste innleggene fra bloggen, med bilde, dato og en kort smakebit.",
    hint: "Innleggene er sidene under /blogg. Lag et nytt innlegg fra Sider.",
    variants: [
      { key: "kort", label: "Kort med bilde" },
      { key: "liste", label: "Liste" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      {
        key: "antall",
        label: "Hvor mange",
        type: "select",
        options: [
          { value: "3", label: "De 3 siste" },
          { value: "6", label: "De 6 siste" },
          { value: "12", label: "De 12 siste" },
          { value: "alle", label: "Alle" },
        ],
      },
    ],
  },
  fordeler: {
    label: "Trygghetspunkter",
    description: "Korte punkter som gjør kunden trygg, som levering, betaling og garanti.",
    variants: [
      { key: "stripe", label: "Stripe" },
      { key: "kort", label: "Kort" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      {
        key: "punkter",
        label: "Punkter",
        type: "list",
        itemLabel: "Punkt",
        max: 4,
        fields: [
          { key: "tittel", label: "Tittel", type: "text", max: 50 },
          { key: "tekst", label: "Forklaring", type: "text", max: 120, optional: true },
        ],
      },
    ],
  },
  kategorikort: {
    label: "Kategorikort",
    description: "Bildekort som sender folk videre til kategorier eller andre sider.",
    variants: [
      { key: "rutenett", label: "Rutenett" },
      { key: "store", label: "Store kort" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      {
        key: "kort",
        label: "Kort",
        type: "list",
        itemLabel: "Kort",
        max: 8,
        fields: [
          { key: "tittel", label: "Tittel", type: "text", max: 60 },
          { key: "tekst", label: "Tekst", type: "text", max: 140, optional: true },
          { key: "bilde", label: "Bilde", type: "image" },
          { key: "lenke", label: "Lenke", type: "link" },
        ],
      },
    ],
  },
  tjenester: {
    label: "Tjenester og priser",
    description: "Det dere tilbyr, med eller uten pris.",
    variants: [
      { key: "standard", label: "Kort" },
      { key: "liste", label: "Prisliste" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      {
        key: "tjenester",
        label: "Tjenester",
        type: "list",
        itemLabel: "Tjeneste",
        max: 40,
        fields: [
          { key: "navn", label: "Navn", type: "text", max: 80 },
          { key: "beskrivelse", label: "Beskrivelse", type: "textarea", max: 400, optional: true },
          { key: "pris", label: "Pris", type: "text", max: 40, optional: true },
        ],
      },
    ],
  },
  kontakt: {
    // Telefon, e-post, adresse og åpningstider hentes fra nettstedets innstillinger (én kilde).
    label: "Kontakt og åpningstider",
    description: "Telefon, e-post, adresse og åpningstider, med eller uten skjema.",
    hint: "Telefon, e-post, adresse og åpningstider hentes fra Innstillinger, så de alltid er like på hele nettstedet.",
    variants: [
      { key: "skjema", label: "Med kontaktskjema" },
      { key: "standard", label: "Uten skjema" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst over skjemaet", type: "textarea", max: 600, optional: true },
      formFieldsField,
    ],
    check: formFieldProblems,
  },
  ansatte: {
    label: "Ansatte og team",
    description: "Folkene bak bedriften, med bilde, rolle og gjerne direkte kontakt.",
    hint: "Spør de ansatte før du legger ut bilde, e-post og telefon. Alt utenom navnet er valgfritt.",
    variants: [
      { key: "kort", label: "Kort med bilde" },
      { key: "liste", label: "Liste uten bilder" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst under overskriften", type: "textarea", max: 400, optional: true },
      {
        key: "personer",
        label: "Personer",
        type: "list",
        itemLabel: "Person",
        max: 24,
        fields: [
          { key: "navn", label: "Navn", type: "text", max: 80 },
          { key: "rolle", label: "Rolle", type: "text", max: 80, optional: true },
          { key: "bilde", label: "Bilde", type: "image", optional: true },
          { key: "tekst", label: "Kort tekst", type: "textarea", max: 400, optional: true },
          { key: "epost", label: "E-post", type: "text", max: 120, optional: true, format: "email" },
          { key: "telefon", label: "Telefon", type: "text", max: 30, optional: true, format: "phone" },
        ],
      },
    ],
  },
  apningstider: {
    // Tidene hentes fra nettstedets innstillinger, samme kilde som kontaktseksjonen og Google.
    label: "Åpningstider",
    description: "Åpningstidene, og dager med andre tider, som romjul og påske.",
    hint: "Åpningstidene og avvikende dager endres under Innstillinger, så de alltid er like på hele nettstedet og hos Google.",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst under tidene", type: "textarea", max: 400, optional: true },
    ],
  },
  kart: {
    label: "Kart og veibeskrivelse",
    description: "Adressen med lenke til kart. Kartet lastes først når den besøkende ber om det.",
    hint: "Adressen hentes fra Innstillinger. Kartet kommer fra Google Maps og lastes først når den besøkende trykker «Vis kart», så ingen spores før det.",
    variants: [
      { key: "kart", label: "Med «Vis kart»-knapp" },
      { key: "lenker", label: "Bare lenker til kart" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Veibeskrivelse og parkering", type: "textarea", max: 600, optional: true },
    ],
  },
  video: {
    label: "Video",
    description: "En video fra YouTube. Den lastes først når den besøkende trykker på spill av.",
    hint: "Videoen hentes fra youtube-nocookie.com og lastes først når den besøkende trykker. Navnet på videoen leses opp av skjermlesere.",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      { key: "lenke", label: "Lenke til videoen på YouTube", type: "text", max: 300, format: "youtube" },
      { key: "tittel", label: "Hva videoen viser (for skjermlesere)", type: "text", max: 120 },
      { key: "tekst", label: "Tekst under videoen", type: "textarea", max: 600, optional: true },
    ],
  },
  filer: {
    label: "Filer og PDF-meny",
    description: "Meny, prisliste eller brosjyre som PDF, som folk kan åpne og laste ned.",
    hint: "Last opp en ny PDF med «Bytt fil» når menyen endres. Lenken på nettstedet oppdateres når du publiserer. Bare PDF, maks 10 MB.",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst", type: "textarea", max: 400, optional: true },
      {
        key: "filer",
        label: "Filer",
        type: "list",
        itemLabel: "Fil",
        max: 10,
        fields: [
          { key: "tittel", label: "Navn på lenken, for eksempel Meny", type: "text", max: 80 },
          { key: "fil", label: "PDF-fil", type: "file" },
        ],
      },
    ],
  },
  bestill: {
    label: "Timebestilling",
    description: "Knapp til bookingsystemet ditt, bestillingen bygd rett inn på siden, eller egen timebestilling med tjenester og ansatte.",
    hint: "Egen booking bruker tjenestene, de ansatte og arbeidstidene under Booking i studioet. For et annet bookingsystem limer du inn lenken til bestillingssiden. Innebygd bestilling virker med Timma, Fresha, Resos, DinnerBooking, Calendly, Spond, TicketCo og Hoopla, og lastes først når den besøkende trykker. Andre lenker vises som knapp.",
    variants: [
      { key: "knapp", label: "Knapp til bestillingen" },
      { key: "innebygd", label: "Innebygd bestilling" },
      // Vises bare når nettstedet har minst én aktiv tjeneste under Booking (RenderContext.booking).
      { key: "egen", label: "Egen booking" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst", type: "textarea", max: 400, optional: true },
      { key: "knappTekst", label: "Knappetekst", type: "text", max: 40, variants: ["knapp", "innebygd"] },
      { key: "lenke", label: "Lenke til bestillingssiden", type: "link", variants: ["knapp", "innebygd"] },
    ],
  },
  nyhetsbrev: {
    // Samtykkesetningen og lenken til personvernerklæringen legges til av seksjonen selv, så de ikke kan fjernes.
    label: "Nyhetsbrev",
    description: "Påmelding til nyhetsbrevet på e-post. Den som melder seg på, bekrefter først på e-post.",
    hint: "Den som melder seg på, får en e-post og må bekrefte før det kommer noe nyhetsbrev. Setningen om samtykke og lenken til personvernerklæringen kommer automatisk. Nyhetsbrevet skriver og sender du under Nyhetsbrev i studioet.",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", max: 90 },
      { key: "tekst", label: "Hva får de, og hvor ofte?", type: "textarea", max: 400, optional: true },
      { key: "knappTekst", label: "Knappetekst", type: "text", max: 40, optional: true },
    ],
  },
  cta: {
    label: "Oppfordring",
    description: "En kort oppfordring med én knapp. Passer fint nederst på siden.",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst", type: "textarea", optional: true },
      { key: "knappTekst", label: "Knappetekst", type: "text", max: 40 },
      { key: "knappLenke", label: "Knappelenke", type: "link" },
    ],
  },
};

export type ValidationResult =
  | { ok: true; content: PageContent }
  | { ok: false; errors: { sectionId?: string; message: string }[] };

// Redigereren sjekker hele siden ved hvert tastetrykk, så skjemaene bygges bare én gang.
const propsSchemas = new Map<string, ZodType>();
function propsSchema(type: SectionType, mode: ValidationMode, variant: string): ZodType {
  const key = `${type}:${mode}:${variant}`;
  let schema = propsSchemas.get(key);
  if (!schema) {
    const { fields, check } = sectionRegistry[type];
    const base = fieldsToZod(fields, mode, variant);
    schema =
      check && mode === "publish"
        ? base.superRefine((props, ctx) => {
            for (const message of check(props)) ctx.addIssue({ code: "custom", message });
          })
        : base;
    propsSchemas.set(key, schema);
  }
  return schema;
}

/** Det som må rettes i én seksjon, uten seksjonsnavnet foran. Vises på seksjonen i redigereren. */
export function sectionProblems(section: Section, mode: ValidationMode = "publish"): string[] {
  const result = propsSchema(section.type, section.hidden ? "draft" : mode, section.variant).safeParse(section.props);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

/**
 * Validerer hele sideinnholdet, inkludert feltene i hver seksjon. «draft» brukes når kladden lagres:
 * da kan noe mangle, men ingenting kan være ugyldig. Publisering krever «publish».
 */
export function validatePageContent(input: unknown, mode: ValidationMode = "publish"): ValidationResult {
  const parsed = pageContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => ({ message: i.message })) };
  }
  const errors: { sectionId?: string; message: string }[] = [];
  const ids = new Set<string>();
  const sections: Section[] = parsed.data.sections.map((section) => {
    if (ids.has(section.id)) errors.push({ sectionId: section.id, message: "Duplisert seksjons-ID" });
    ids.add(section.id);
    const def = sectionRegistry[section.type];
    const variant = def.variants.some((v) => v.key === section.variant) ? section.variant : def.variants[0].key;
    // En avslått seksjon vises ikke, så den kan være uferdig. Den kan likevel aldri være ugyldig.
    const props = propsSchema(section.type, section.hidden ? "draft" : mode, variant).safeParse(section.props);
    if (!props.success) {
      for (const issue of props.error.issues) {
        errors.push({ sectionId: section.id, message: `${def.label}: ${issue.message}` });
      }
      return section;
    }
    return { ...section, variant, props: props.data as Section["props"] };
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, content: { ...parsed.data, sections } };
}
