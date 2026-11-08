import { z } from "zod";
import { fileSrcPattern, MAX_FILE_BYTES, mediaSrcPattern, packImageSrcPattern, type ImageFocus } from "@/lib/media-types";
import { youtubeId } from "@/lib/embeds";

/**
 * Feltdefinisjonene er én kilde for både validering og redigeringsskjemaet (lag 1).
 * Et nytt felt i en seksjon gir automatisk et felt i studioet.
 */
export type Field = (
  | {
      key: string;
      label: string;
      type: "text";
      max?: number;
      optional?: boolean;
      /** Tekst med fast form. Sjekkes ved lagring og gir riktig tastatur på mobil. */
      format?: TextFormat;
    }
  | { key: string; label: string; type: "textarea"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "link"; optional?: boolean }
  | { key: string; label: string; type: "image"; optional?: boolean }
  /** PDF fra eget lager, for eksempel menyen. Verdien er FileValue. */
  | { key: string; label: string; type: "file"; optional?: boolean }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  /** En av butikkens samlinger. Verdien er adressen (slug). Tom: alle varer. */
  | { key: string; label: string; type: "collection" }
  /** `optional`: listen kan mangle helt, for eksempel i innhold som er lagret før listen fantes. */
  | { key: string; label: string; type: "list"; itemLabel: string; fields: Field[]; max?: number; optional?: boolean }
) & {
  /** Feltet vises og kreves bare i disse variantene av seksjonen. Uten liste gjelder det alle. */
  variants?: string[];
};

export type TextFormat = "email" | "phone" | "youtube";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Telefonnummer med minst åtte siffer, så «Ring»-lenken virker. Samme regel som i Innstillinger. */
export function isPhone(value: string): boolean {
  return /^\+?[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 8;
}

export function isEmail(value: string): boolean {
  return emailPattern.test(value);
}

const formatChecks: Record<TextFormat, { test: (v: string) => boolean; message: (label: string) => string }> = {
  email: { test: isEmail, message: (l) => `${l}: sjekk e-postadressen` },
  phone: { test: isPhone, message: (l) => `${l}: telefonnummeret må ha minst åtte siffer` },
  youtube: { test: (v) => youtubeId(v) !== null, message: (l) => `${l}: lim inn en lenke til en video på YouTube` },
};

/** Feltene som hører til en variant. */
export function fieldsForVariant(fields: Field[], variant: string): Field[] {
  return fields.filter((f) => !f.variants || f.variants.includes(variant));
}

/**
 * Sti på samme nettsted. Nettleseren gjør «\» om til «/» og hopper over tabulator og linjeskift i en adresse,
 * så «/\evil.com» og «/<tab>/evil.com» blir «//evil.com», altså et annet nettsted. Derfor stoppes de her.
 */
export function isLocalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !/[\\\s\x00-\x1f\x7f]/.test(value);
}

/** Bare trygge lenker: ingen javascript:, data: eller lignende, og ingen stier som egentlig går til et annet nettsted. */
export function isSafeHref(value: string): boolean {
  if (value.startsWith("/")) return isLocalPath(value);
  if (value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/** Fokuspunktet i et bilde, i hele prosent. */
export const imageFocusSchema = z.object({
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
});

/**
 * Plassholder for bilder i seksjonsbiblioteket. Den kan stå i en kladd, men stopper publisering,
 * så et eksempelbilde aldri havner på en ekte nettside.
 */
export const EXAMPLE_IMAGE_SRC = "eksempelbilde";

/**
 * «publish» krever at alt er fylt ut. «draft» godtar det som mangler, men aldri det som er ugyldig
 * (farlige lenker, for lang tekst, bilder utenfor eget lager). Slik kan kladden lagres underveis.
 */
export type ValidationMode = "publish" | "draft";

function fieldToZod(field: Field, mode: ValidationMode): z.ZodType {
  const required = `${field.label} må fylles ut`;
  const optional = mode === "draft" || ("optional" in field && field.optional);
  switch (field.type) {
    case "text":
    case "textarea": {
      const max = field.max ?? (field.type === "text" ? 160 : 4000);
      const plain = z.string({ error: required }).trim().max(max, `${field.label} kan ha maks ${max} tegn`);
      // Formatet sjekkes også i kladden: en feil e-postadresse er ugyldig, ikke bare uferdig.
      const check = field.type === "text" && field.format ? formatChecks[field.format] : null;
      const base = check ? plain.refine((v) => v === "" || check.test(v), check.message(field.label)) : plain;
      return optional ? base.optional().default("") : base.refine((v) => v !== "", required);
    }
    case "link": {
      const base = z
        .string({ error: required })
        .trim()
        .max(500, `${field.label} er for lang`)
        .refine((v) => v === "" || isSafeHref(v), `${field.label}: ugyldig lenke`);
      return optional ? base.optional().default("") : base.refine((v) => v !== "", required);
    }
    case "image": {
      const src = z
        .string()
        .refine((v) => mode === "draft" || v !== EXAMPLE_IMAGE_SRC, {
          error: `${field.label}: bytt ut eksempelbildet med et eget bilde`,
          abort: true,
        })
        .refine((v) => v === EXAMPLE_IMAGE_SRC || mediaSrcPattern.test(v) || packImageSrcPattern.test(v), `${field.label}: ugyldig bilde`);
      const image = z.object({
        src,
        alt: z.string().trim().max(200, `${field.label}: alt-teksten er for lang`),
        decorative: z.boolean().optional(),
        focus: imageFocusSchema.optional(),
      });
      // Alt-tekst er påkrevd for universell utforming. Rent pyntebilder kan ha tom alt, men da må det velges aktivt.
      const checked =
        mode === "draft"
          ? image
          : image.refine((v) => v.decorative || v.alt !== "", `${field.label}: skriv en kort beskrivelse av bildet (alt-tekst)`);
      return optional ? checked.nullable().optional().default(null) : checked.nullable().refine((v) => v !== null, required);
    }
    case "file": {
      const file = z.object({
        src: z.string().regex(fileSrcPattern, `${field.label}: ugyldig fil`),
        name: z.string().trim().max(120).default(""),
        size: z.number().int().min(0).max(MAX_FILE_BYTES).optional(),
      });
      return optional ? file.nullable().optional().default(null) : file.nullable().refine((v) => v !== null, `${field.label}: last opp en PDF`);
    }
    case "collection":
      return z.string().trim().max(120).optional().default("");
    case "select":
      return z
        .enum(field.options.map((o) => o.value) as [string, ...string[]])
        .catch(field.options[0].value);
    case "list": {
      const list = z
        .array(fieldsToZod(field.fields, mode), { error: `${field.label} mangler` })
        .max(field.max ?? 30, `${field.label}: for mange elementer`);
      return field.optional ? list.optional().default([]) : list;
    }
  }
}

/** `variant`: felt som ikke hører til varianten, kan mangle (men aldri være ugyldige). */
export function fieldsToZod(fields: Field[], mode: ValidationMode = "publish", variant?: string) {
  return z.object(
    Object.fromEntries(fields.map((f) => [f.key, fieldToZod(f, variant !== undefined && f.variants && !f.variants.includes(variant) ? "draft" : mode)])),
  );
}

export type ImageValue = { src: string; alt: string; decorative?: boolean; focus?: ImageFocus };

/** En opplastet PDF: stien, filnavnet og størrelsen i byte (vises ved lenken). */
export type FileValue = { src: string; name: string; size?: number };
