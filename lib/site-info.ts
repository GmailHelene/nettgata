import { z } from "zod";
import { parseOsloDate } from "@/lib/oslo-time";
import { parseGoogleVerification } from "@/lib/seo/verification";

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
  /** Registrert i Merverdiavgiftsregisteret. Er den av, selger nettbutikken alt uten MVA, uansett satsen på varen. */
  mvaRegistrert: z.boolean().default(true),
  openingHours: z
    .array(z.object({ day: z.string().trim().min(1).max(30), time: z.string().trim().min(1).max(40) }))
    .max(10)
    .default([]),
  /**
   * Avvikende åpningstider på enkeltdager, som julaften og påske. Dager som er passert, vises ikke.
   * `time` er fri tekst som de vanlige tidene, for eksempel «Stengt» eller «10.00 - 14.00».
   */
  specialHours: z
    .array(
      z.object({
        date: z.string().refine((v) => parseOsloDate(v) !== null, "Velg en gyldig dato for avvikende åpningstid"),
        label: z.string().trim().max(60, "Navnet på dagen er for langt").default(""),
        time: z.string().trim().min(1, "Skriv tiden eller «Stengt»").max(40, "Tiden er for lang"),
      }),
    )
    .max(30, "Maks 30 avvikende dager")
    .default([]),
  /**
   * «Område vi dekker»: stedene bedriften jobber i, skilt med komma. Brukes i titlene i Google (det første stedet),
   * i strukturerte data (areaServed) og i kontaktseksjonen.
   */
  // Valgfrie, så info lagret før feltene fantes fortsatt er gyldig. Ugyldig lagret verdi gir tomt felt, aldri feil.
  serviceArea: z.string().trim().max(200).optional().catch(undefined),
  /** Koden fra Google Search Console, uten resten av meta-taggen (lib/seo/verification.ts). */
  googleVerification: z.string().optional().catch(undefined),
});
export type SiteInfo = z.infer<typeof siteInfoSchema>;

/**
 * Strengere variant som brukes når kunden lagrer: telefonen må ha minst åtte siffer, så «Ring»-lenken virker.
 * Lagret info leses med den milde varianten over. Ellers kunne et gammelt telefonformat visket ut adresse og åpningstider.
 */
export const siteInfoInputSchema = siteInfoSchema.extend({
  phone: z
    .string()
    .trim()
    .max(30, "Telefon er for lang")
    .refine(
      (v) => v === "" || (/^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, "").length >= 8),
      "Telefonnummeret må ha minst åtte siffer, for eksempel 32 78 00 00",
    )
    .default(""),
  serviceArea: z.string().trim().max(200, "Området er for langt. Skriv de viktigste stedene.").default(""),
  // Kunden kan lime inn hele meta-taggen fra Google eller bare koden. Vi lagrer koden.
  googleVerification: z
    .string()
    .trim()
    .max(400)
    .transform((v, ctx) => {
      const code = parseGoogleVerification(v);
      if (code !== null) return code;
      ctx.addIssue({ code: "custom", message: "Koden fra Google ser ikke riktig ut. Lim inn hele meta-taggen eller bare koden." });
      return z.NEVER;
    })
    .default(""),
});

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
