import { z } from "zod";

/** Steg mellom starttidene kunden kan velge. */
export const STEP_CHOICES = [5, 10, 15, 20, 30, 60] as const;

/**
 * Innstillinger for egen timebestilling, lagret i sites.booking. Standardverdiene gjelder til bedriften endrer dem.
 * Les alltid via readBookingSettings(), så gamle eller ufullstendige verdier får standardverdier.
 */
export const bookingSettingsSchema = z.object({
  /** Hvor lang tid før timen den senest kan bestilles. */
  noticeHours: z.number().int().min(0).max(168).default(2),
  /** Hvor mange dager fram i tid kunden kan bestille. */
  maxDaysAhead: z.number().int().min(1).max(365).default(60),
  /** Hvor lang tid før timen kunden selv kan avbestille med lenken i e-posten. */
  cancelHours: z.number().int().min(0).max(168).default(24),
  stepMinutes: z
    .number()
    .int()
    .refine((v) => (STEP_CHOICES as readonly number[]).includes(v))
    .default(15),
  /** Varsel på e-post til bedriften om nye og avbestilte timer. */
  notifyBusiness: z.boolean().default(true),
});
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;

export const defaultBookingSettings: BookingSettings = bookingSettingsSchema.parse({});

export function readBookingSettings(raw: unknown): BookingSettings {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Felt for felt, så én ugyldig verdi ikke nullstiller resten.
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(bookingSettingsSchema.shape)) {
    const parsed = (field as z.ZodType).safeParse(source[key]);
    out[key] = parsed.success ? parsed.data : defaultBookingSettings[key as keyof BookingSettings];
  }
  return out as BookingSettings;
}
