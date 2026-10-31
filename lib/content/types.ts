import { z } from "zod";
import { mediaSrcPattern } from "@/lib/media-types";

export const sectionTypes = [
  "hero",
  "tekst",
  "bildetekst",
  "fordeler",
  "kategorikort",
  "tjenester",
  "produkter",
  "galleri",
  "omtaler",
  "faq",
  "kontakt",
  "cta",
] as const;

/** Bakgrunn per seksjon. «Flate» og «Fargerik» gir rytme på siden uten nye farger. */
export const sectionBackgrounds = ["standard", "flate", "fargerik"] as const;
export type SectionType = (typeof sectionTypes)[number];

export const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(sectionTypes),
  variant: z.string().max(32).default("standard"),
  // Valgfri, så eldre innhold uten bakgrunn fortsatt er gyldig. Mangler den, brukes «standard».
  background: z.enum(sectionBackgrounds).optional(),
  props: z.record(z.string(), z.unknown()),
});
export type Section = z.infer<typeof sectionSchema>;

export const pageContentSchema = z.object({
  seo: z
    .object({
      title: z.string().max(70, "Tittelen for Google kan ha maks 70 tegn").optional(),
      description: z.string().max(170, "Beskrivelsen for Google kan ha maks 170 tegn").optional(),
      // Bildet som vises når siden deles. Uten det brukes det første bildet på siden.
      image: z
        .object({ src: z.string().regex(mediaSrcPattern, "Delingsbildet er ugyldig"), alt: z.string().trim().max(200).default("") })
        .nullable()
        .optional(),
    })
    .default({}),
  sections: z.array(sectionSchema).max(40),
});
export type PageContent = z.infer<typeof pageContentSchema>;
