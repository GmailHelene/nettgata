import { z } from "zod";
import { mediaSrcPattern, type ImageFocus } from "@/lib/media-types";

/**
 * Feltdefinisjonene er én kilde for både validering og redigeringsskjemaet (lag 1).
 * Et nytt felt i en seksjon gir automatisk et felt i studioet.
 */
export type Field =
  | { key: string; label: string; type: "text"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "textarea"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "link"; optional?: boolean }
  | { key: string; label: string; type: "image"; optional?: boolean }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "list"; itemLabel: string; fields: Field[]; max?: number };

/** Bare trygge lenker: ingen javascript:, data: eller lignende. */
export function isSafeHref(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
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
      const base = z.string({ error: required }).trim().max(max, `${field.label} kan ha maks ${max} tegn`);
      return optional ? base.optional().default("") : base.min(1, required);
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
        .refine((v) => v === EXAMPLE_IMAGE_SRC || mediaSrcPattern.test(v), `${field.label}: ugyldig bilde`);
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
    case "select":
      return z
        .enum(field.options.map((o) => o.value) as [string, ...string[]])
        .catch(field.options[0].value);
    case "list":
      return z
        .array(fieldsToZod(field.fields, mode), { error: `${field.label} mangler` })
        .max(field.max ?? 30, `${field.label}: for mange elementer`);
  }
}

export function fieldsToZod(fields: Field[], mode: ValidationMode = "publish") {
  return z.object(Object.fromEntries(fields.map((f) => [f.key, fieldToZod(f, mode)])));
}

export type ImageValue = { src: string; alt: string; decorative?: boolean; focus?: ImageFocus };
