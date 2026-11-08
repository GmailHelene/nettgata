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
  "blogg",
  "bestill",
  // Lokalpakken: det lokale bedrifter oftest spør etter.
  "ansatte",
  "apningstider",
  "kart",
  "video",
  "filer",
  // Påmelding til nyhetsbrevet med dobbel opt-in (lib/nyhetsbrev).
  "nyhetsbrev",
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
  /**
   * Slått av: seksjonen ligger på siden i studioet, men vises ikke på nettstedet. Den kan være uferdig
   * og stopper ikke publisering, så kunden kan slå den på og av uten å slette innholdet.
   */
  hidden: z.boolean().optional(),
  props: z.record(z.string(), z.unknown()),
});
export type Section = z.infer<typeof sectionSchema>;

export const pageContentSchema = z.object({
  seo: z
    .object({
      title: z.string().max(70, "Tittelen for Google kan ha maks 70 tegn").optional(),
      description: z.string().max(170, "Beskrivelsen for Google kan ha maks 170 tegn").optional(),
      // Siden vises på nettstedet, men ikke i Google (noindex) og ikke i sitemapen. For takkesider, kampanjer og lignende.
      noindex: z.boolean().optional(),
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
