import { fieldsToZod, type Field } from "./fields";
import { pageContentSchema, type PageContent, type Section, type SectionType } from "./types";

export type SectionDefinition = {
  label: string;
  variants: { key: string; label: string }[];
  fields: Field[];
};

export const sectionRegistry: Record<SectionType, SectionDefinition> = {
  hero: {
    label: "Toppseksjon",
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
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", optional: true },
      { key: "brodtekst", label: "Tekst", type: "textarea", max: 6000 },
    ],
  },
  bildetekst: {
    label: "Bilde og tekst",
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
    // Viser de første aktive varene i nettbutikken. Gjør ingenting på nettsteder uten butikk.
    label: "Utvalgte varer",
    variants: [{ key: "standard", label: "Rutenett" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "knappTekst", label: "Knappetekst til alle varer", type: "text", max: 40, optional: true },
    ],
  },
  tjenester: {
    label: "Tjenester og priser",
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
    variants: [
      { key: "skjema", label: "Med kontaktskjema" },
      { key: "standard", label: "Uten skjema" },
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "tekst", label: "Tekst over skjemaet", type: "textarea", max: 600, optional: true },
    ],
  },
  cta: {
    label: "Oppfordring",
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

/** Validerer hele sideinnholdet, inkludert feltene i hver seksjon. */
export function validatePageContent(input: unknown): ValidationResult {
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
    const props = fieldsToZod(def.fields).safeParse(section.props);
    if (!props.success) {
      for (const issue of props.error.issues) {
        errors.push({ sectionId: section.id, message: `${def.label}: ${issue.message}` });
      }
      return section;
    }
    return { ...section, variant, props: props.data };
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, content: { ...parsed.data, sections } };
}
