import { z } from "zod";

/**
 * Feltdefinisjonene er én kilde for både validering og redigeringsskjemaet (lag 1).
 * Et nytt felt i en seksjon gir automatisk et felt i studioet.
 */
export type Field =
  | { key: string; label: string; type: "text"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "textarea"; max?: number; optional?: boolean }
  | { key: string; label: string; type: "link"; optional?: boolean }
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
    case "list":
      return z
        .array(fieldsToZod(field.fields), { error: `${field.label} mangler` })
        .max(field.max ?? 30, `${field.label}: for mange elementer`);
  }
}

export function fieldsToZod(fields: Field[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.key, fieldToZod(f)])));
}
