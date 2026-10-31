import { z } from "zod";
import { mediaSrcPattern } from "@/lib/media-types";

/**
 * Feltdefinisjonene er én kilde for både validering og redigeringsskjemaet (lag 1).
 * Et nytt felt i en seksjon gir automatisk et felt i studioet.
 */
export type Field =
  | { key: string; label: string; type: "text"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "textarea"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "link"; optional?: boolean }
  | { key: string; label: string; type: "image"; optional?: boolean }
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

function fieldToZod(field: Field): z.ZodType {
  const required = `${field.label} må fylles ut`;
  switch (field.type) {
    case "text":
    case "textarea": {
      const max = field.max ?? (field.type === "text" ? 160 : 4000);
      const base = z.string({ error: required }).trim().max(max, `${field.label} kan ha maks ${max} tegn`);
      return field.optional ? base.optional().default("") : base.min(1, required);
    }
    case "link": {
      const base = z
        .string({ error: required })
        .trim()
        .max(500, `${field.label} er for lang`)
        .refine((v) => v === "" || isSafeHref(v), `${field.label}: ugyldig lenke`);
      return field.optional ? base.optional().default("") : base.refine((v) => v !== "", required);
    }
    case "image": {
      // Alt-tekst er påkrevd for universell utforming. Rent pyntebilder kan ha tom alt, men da må det velges aktivt.
      const image = z.object({
        src: z.string().regex(mediaSrcPattern, `${field.label}: ugyldig bilde`),
        alt: z.string().trim().max(200, `${field.label}: alt-teksten er for lang`),
        decorative: z.boolean().optional(),
      }).refine((v) => v.decorative || v.alt !== "", `${field.label}: beskriv bildet for dem som ikke ser det (alt-tekst)`);
      return field.optional ? image.nullable().optional().default(null) : image.nullable().refine((v) => v !== null, required);
    }
    case "list":
      return z
        .array(fieldsToZod(field.fields), { error: `${field.label} mangler` })
        .max(field.max ?? 30, `${field.label}: for mange elementer`);
  }
}

export function fieldsToZod(fields: Field[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.key, fieldToZod(f)])));
}

export type ImageValue = { src: string; alt: string; decorative?: boolean };
