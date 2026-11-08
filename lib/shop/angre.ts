import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, inquiries, sites } from "@/db/schema";
import { notifyWithdrawal } from "@/lib/email/notify";
import type { EmailProvider } from "@/lib/email/send";
import { formatOsloDateTime } from "@/lib/oslo-time";

/**
 * Elektronisk angrefunksjon for nettbutikkene (angrerettloven § 20 a, tilføyd ved lov 19. juni 2026 nr. 34).
 * Kunden oppgir navn, hvilket kjøp det gjelder og hvor kvitteringen skal sendes. Meldingen lagres som en henvendelse,
 * og kunden får kvittering med innhold og tidspunkt. Vi sjekker ikke om ordren finnes, så skjemaet ikke kan brukes til
 * å finne ut hvilke ordre en butikk har, og fordi en kunde med feil ordrenummer likevel har gitt beskjed i tide.
 */
export const WITHDRAW_PATH = "/angre-avtalen";

export const withdrawalSchema = z.object({
  name: z.string({ error: "Skriv navnet ditt" }).trim().min(1, "Skriv navnet ditt").max(100, "Navnet er for langt"),
  about: z.string({ error: "Skriv hvilket kjøp det gjelder" }).trim().min(1, "Skriv hvilket kjøp det gjelder").max(300, "Teksten er for lang"),
  email: z.string({ error: "Skriv e-postadressen din" }).trim().max(120, "E-postadressen er for lang").regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Sjekk e-postadressen"),
});

export type Withdrawal = z.infer<typeof withdrawalSchema>;
export type WithdrawalReceipt = Withdrawal & { at: string; emailed: boolean };

/** Lagrer meldingen og sender kvittering og varsel. Null hvis nettstedet ikke er en nettbutikk. */
export async function registerWithdrawal(db: Db, provider: EmailProvider, siteId: string, input: Withdrawal): Promise<WithdrawalReceipt | null> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || site.kind !== "nettbutikk") return null;
  const [row] = await db
    .insert(inquiries)
    .values({
      siteId: site.id,
      name: input.name,
      email: input.email,
      message: `Kunden har brukt angreretten.\nGjelder: ${input.about}`,
      pagePath: WITHDRAW_PATH,
    })
    .returning({ id: inquiries.id, createdAt: inquiries.createdAt });
  await db.insert(auditLog).values({ siteId: site.id, action: "order.withdrawal_received", detail: { inquiryId: row.id } });
  const at = formatOsloDateTime(row.createdAt);
  const emailed = await notifyWithdrawal(db, provider, { site, inquiryId: row.id, ...input, at });
  return { ...input, at, emailed };
}
