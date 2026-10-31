import { z } from "zod";
import { isSafeHref } from "@/lib/content/fields";
import { mediaSrcPattern } from "@/lib/media-types";

const href = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || isSafeHref(v), "Ugyldig lenke")
  .default("");

const link = z.object({ label: z.string().trim().min(1, "Lenken må ha en tekst").max(40), href: href.refine((v) => v !== "", "Lenken mangler adresse") });

const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\//.test(v), "Sosiale lenker må starte med https://")
  .default("");

/**
 * Det som går igjen på alle sidene: logo, toppstripe og bunntekst.
 * Lagres per nettsted og gjelder med en gang, uten publisering.
 */
export const siteLayoutSchema = z.object({
  logo: z
    .object({ src: z.string().regex(mediaSrcPattern), alt: z.string().trim().max(200), decorative: z.boolean().optional() })
    .nullable()
    .default(null),
  announcement: z
    .object({ text: z.string().trim().max(140, "Toppstripen kan ha maks 140 tegn").default(""), href })
    .default({ text: "", href: "" }),
  topLinks: z.array(link).max(4).default([]),
  footerText: z.string().trim().max(400).default(""),
  footerColumns: z
    .array(z.object({ title: z.string().trim().min(1, "Kolonnen må ha en overskrift").max(40), links: z.array(link).max(8) }))
    .max(3)
    .default([]),
  social: z
    .object({ facebook: socialUrl, instagram: socialUrl, tiktok: socialUrl, linkedin: socialUrl })
    .default({ facebook: "", instagram: "", tiktok: "", linkedin: "" }),
});
export type SiteLayout = z.infer<typeof siteLayoutSchema>;

export function readSiteLayout(raw: unknown): SiteLayout {
  const parsed = siteLayoutSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : siteLayoutSchema.parse({});
}
