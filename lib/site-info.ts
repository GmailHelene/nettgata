import { z } from "zod";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Én kilde for kontaktinformasjon. Den mates til meny, bunntekst, kontaktseksjonen
 * og strukturerte data, så kunden bare endrer åpningstider ett sted.
 */
export const siteInfoSchema = z.object({
  phone: z.string().trim().max(30, "Telefon er for lang").default(""),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || emailPattern.test(v), "Ugyldig e-postadresse")
    .default(""),
  street: z.string().trim().max(120, "Gateadresse er for lang").default(""),
  postalCode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Postnummer må ha fire siffer")
    .default(""),
  city: z.string().trim().max(60, "Poststed er for langt").default(""),
  orgnr: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{9}$/.test(v), "Org.nr må ha ni siffer")
    .default(""),
  openingHours: z
    .array(z.object({ day: z.string().trim().min(1).max(30), time: z.string().trim().min(1).max(40) }))
    .max(10)
    .default([]),
});
export type SiteInfo = z.infer<typeof siteInfoSchema>;

/** Leser lagret info og fyller inn standardverdier for felt som mangler. */
export function readSiteInfo(raw: unknown): SiteInfo {
  const parsed = siteInfoSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : siteInfoSchema.parse({});
}

export function formatOrgnr(orgnr: string): string {
  return orgnr.length === 9 ? `${orgnr.slice(0, 3)} ${orgnr.slice(3, 6)} ${orgnr.slice(6)}` : orgnr;
}

export function formatAddress(info: SiteInfo): string {
  const place = [info.postalCode, info.city].filter(Boolean).join(" ");
  return [info.street, place].filter(Boolean).join(", ");
}
