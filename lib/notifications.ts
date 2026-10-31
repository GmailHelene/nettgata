import { z } from "zod";

/**
 * Varsler på e-post for ett nettsted. Ordrebekreftelsen til kunden sendes alltid og kan ikke slås av.
 * Tom e-post betyr at varslene går til kontaktadressen under Innstillinger.
 */
export const notificationSettingsSchema = z.object({
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Ugyldig e-postadresse for varsler")
    .default(""),
  newOrder: z.boolean().default(true),
  newInquiry: z.boolean().default(true),
  /** E-post til kunden når ordren er markert som sendt, med sporing hvis den finnes. */
  shipped: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export function readNotificationSettings(raw: unknown): NotificationSettings {
  const parsed = notificationSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : notificationSettingsSchema.parse({});
}

/** Adressen varsler til bedriften sendes til: egen varseladresse, ellers kontaktadressen. */
export function notifyAddress(settings: NotificationSettings, contactEmail: string): string | null {
  return settings.email || contactEmail || null;
}
