import { z } from "zod";

export const sectionTypes = ["hero", "tekst", "tjenester", "kontakt", "cta"] as const;
export type SectionType = (typeof sectionTypes)[number];

export const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(sectionTypes),
  variant: z.string().max(32).default("standard"),
  props: z.record(z.string(), z.unknown()),
});
export type Section = z.infer<typeof sectionSchema>;

export const pageContentSchema = z.object({
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(170).optional(),
    })
    .default({}),
  sections: z.array(sectionSchema).max(40),
});
export type PageContent = z.infer<typeof pageContentSchema>;
