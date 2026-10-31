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
    ],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text", max: 90 },
      { key: "undertekst", label: "Undertekst", type: "textarea", max: 300, optional: true },
      { key: "knappTekst", label: "Knappetekst", type: "text", max: 40, optional: true },
      { key: "knappLenke", label: "Knappelenke", type: "link", optional: true },
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
    label: "Kontakt og åpningstider",
    variants: [{ key: "standard", label: "Standard" }],
    fields: [
      { key: "overskrift", label: "Overskrift", type: "text" },
      { key: "telefon", label: "Telefon", type: "text", max: 30, optional: true },
      { key: "epost", label: "E-post", type: "text", max: 120, optional: true },
      { key: "adresse", label: "Adresse", type: "text", max: 160, optional: true },
      {
        key: "apningstider",
        label: "Åpningstider",
        type: "list",
        itemLabel: "Dag",
        max: 10,
        fields: [
          { key: "dag", label: "Dag", type: "text", max: 30 },
          { key: "tid", label: "Tid", type: "text", max: 40 },
        ],
      },
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
