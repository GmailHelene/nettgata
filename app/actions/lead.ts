"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, inquiries } from "@/db/schema";
import { notifyInquiry } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { ensurePlatformSite } from "@/lib/platform-site";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { needs, type Need } from "@/lib/leads";

type Values = { name: string; email: string; phone: string; company: string; need: string; bransje: string; message: string };
/** Ved feil sendes det som var skrevet tilbake, så skjemaet ikke tømmes. */
/** `saved` og `id` bare når henvendelsen faktisk ble lagret, så roboter i honningkrukken aldri telles som konvertering. */
export type LeadState = { ok: boolean; message: string; values?: Values; saved?: boolean; id?: string; field?: string } | null;

const leadSchema = z.object({
  name: z.string().trim().min(1, "Skriv navnet ditt").max(100, "Navnet er for langt"),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Sjekk e-postadressen"),
  phone: z.string().trim().max(30, "Telefonnummeret er for langt"),
  company: z.string().trim().max(120, "Navnet på bedriften er for langt"),
  need: z.enum(Object.keys(needs) as [Need, ...Need[]], { error: "Velg hva du trenger" }),
  bransje: z.string().trim().max(80),
  message: z.string().trim().max(3000, "Meldingen er for lang"),
  source: z.string().max(400),
});

/**
 * Skjemaet «Få nettside» på nettgata.no. Offentlig, så alt valideres og begrenses som kontaktskjemaene.
 * Henvendelsen havner i Nettgata sin innboks i studioet (lib/platform-site.ts).
 */
export async function submitLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  // Honningkrukke: skjult for mennesker. Roboter som fyller feltet, får et vanlig svar uten at noe lagres.
  if (String(formData.get("nettsted") ?? "") !== "") return { ok: true, message: "Takk! Du hører fra meg innen én virkedag." };

  const text = (key: string, max: number) => String(formData.get(key) ?? "").slice(0, max);
  const values: Values = {
    name: text("name", 100),
    email: text("email", 120),
    phone: text("phone", 30),
    company: text("company", 120),
    need: text("need", 20),
    bransje: text("bransje", 80),
    message: text("message", 3000),
  };
  // Spørringen fra adressen siden ble åpnet med (utm-parametrene fra annonsen), så innboksen viser hvor henvendelsen kom fra.
  let query = "";
  try {
    const referer = (await headers()).get("referer");
    if (referer) query = new URL(referer).search.slice(0, 200);
  } catch {
    // Ugyldig referer: kilden blir bare stien.
  }
  const parsed = leadSchema.safeParse({ ...values, source: `${text("source", 200)}${query}` });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, values, field: String(parsed.error.issues[0].path[0] ?? "") || undefined };

  const db = await getDb();
  const site = await ensurePlatformSite(db);
  if (!site) return { ok: false, message: "Skjemaet virker ikke akkurat nå. Send en e-post til kontakt@helene.cloud i stedet.", values };

  const ipKey = await clientKey(await headers(), getSecret());
  const allowed = (await hit(db, `inquiry-ip:${ipKey}`, rules.inquiryPerIp)) && (await hit(db, `inquiry-site:${site.id}`, rules.inquiryPerSite));
  if (!allowed) return { ok: false, message: "Du har sendt mange meldinger på kort tid. Prøv igjen om litt.", values };

  const d = parsed.data;
  const message = [
    `Ønsker: ${needs[d.need]}`,
    d.company && `Bedrift: ${d.company}`,
    d.bransje && `Bransje: ${d.bransje}`,
    `Kom fra: ${d.source || "/"}`,
    d.message && `\n${d.message}`,
  ]
    .filter(Boolean)
    .join("\n");
  const [row] = await db
    .insert(inquiries)
    .values({ siteId: site.id, name: d.name, email: d.email, phone: d.phone || null, message, pagePath: (d.source || "/").slice(0, 300) })
    .returning({ id: inquiries.id });
  await db.insert(auditLog).values({ siteId: site.id, action: "inquiry.received", detail: { inquiryId: row.id, lead: d.need } });
  after(() => notifyInquiry(db, getEmailProvider(), row.id).catch((err) => console.error("Varsel om ny henvendelse feilet", err)));

  return { ok: true, message: "Takk! Du hører fra meg innen én virkedag.", saved: true, id: row.id };
}
