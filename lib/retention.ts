import { and, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { aiSuggestions, inquiries, rateLimitEvents } from "@/db/schema";

/**
 * Sletting som personvernerklæringene lover (lib/legal). Kjøres hver natt etter sikkerhetskopien.
 * Tallene er utkast som Helene bekrefter.
 */

/** Forsøk som teller mot grensene (innlogging, skjemaer, rabattkoder). Ingen grense ser lenger tilbake enn et døgn. */
export const RATE_LIMIT_KEEP_HOURS = 48;
/** Henvendelser fra kontaktskjemaene. Erklæringen lover sletting senest tolv måneder etter siste kontakt. */
export const INQUIRY_KEEP_MONTHS = 12;

/** Forslag fra AI-teamet som er avvist eller utdatert. Godkjente beholdes som historikk over hva som er endret. */
export const AI_SUGGESTION_KEEP_DAYS = 90;

export async function runRetention(db: Db, now = new Date()) {
  const limitCutoff = new Date(now.getTime() - RATE_LIMIT_KEEP_HOURS * 3_600_000);
  const inquiryCutoff = new Date(now);
  inquiryCutoff.setMonth(inquiryCutoff.getMonth() - INQUIRY_KEEP_MONTHS);

  const rateLimits = await db.delete(rateLimitEvents).where(lt(rateLimitEvents.createdAt, limitCutoff)).returning({ id: rateLimitEvents.id });
  const oldInquiries = await db.delete(inquiries).where(lt(inquiries.createdAt, inquiryCutoff)).returning({ id: inquiries.id });
  const aiCutoff = new Date(now.getTime() - AI_SUGGESTION_KEEP_DAYS * 86_400_000);
  const oldSuggestions = await db
    .delete(aiSuggestions)
    .where(and(inArray(aiSuggestions.status, ["avvist", "utdatert"]), lt(aiSuggestions.createdAt, aiCutoff)))
    .returning({ id: aiSuggestions.id });
  return { rateLimits: rateLimits.length, inquiries: oldInquiries.length, aiSuggestions: oldSuggestions.length };
}
