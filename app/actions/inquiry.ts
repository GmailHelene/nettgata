"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, inquiries, sites } from "@/db/schema";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";

type Values = { name: string; email: string; phone: string; message: string };
/** Ved feil sendes det kunden skrev tilbake, så skjemaet ikke tømmes. */
export type InquiryState = { ok: boolean; message: string; values?: Values } | null;

const inquirySchema = z
  .object({
    name: z.string({ error: "Skriv navnet ditt" }).trim().min(1, "Skriv navnet ditt").max(100, "Navnet er for langt"),
    email: z
      .string()
      .trim()
      .max(120)
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Sjekk e-postadressen")
      .default(""),
    phone: z.string().trim().max(30, "Telefonnummeret er for langt").default(""),
    message: z.string({ error: "Skriv en melding" }).trim().min(5, "Skriv litt mer i meldingen").max(4000, "Meldingen er for lang"),
    path: z.string().max(300).default("/"),
  })
  .refine((v) => v.email !== "" || v.phone !== "", { message: "Oppgi e-post eller telefon, så vi kan svare deg" });

/** Tar imot kontaktskjemaet på kundens nettsted. Offentlig, så alt valideres og begrenses. */
export async function submitInquiry(siteId: string, _prev: InquiryState, formData: FormData): Promise<InquiryState> {
  // Honningkrukke: feltet er skjult for mennesker. Roboter som fyller det, får et vanlig svar uten at noe lagres.
  if (String(formData.get("nettsted") ?? "") !== "") return { ok: true, message: "Takk! Meldingen er sendt." };

  const values: Values = {
    name: String(formData.get("name") ?? "").slice(0, 100),
    email: String(formData.get("email") ?? "").slice(0, 120),
    phone: String(formData.get("phone") ?? "").slice(0, 30),
    message: String(formData.get("message") ?? "").slice(0, 4000),
  };
  const parsed = inquirySchema.safeParse({ ...values, path: String(formData.get("path") ?? "/") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, values };

  const db = await getDb();
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };

  const ipKey = await clientKey(await headers(), getSecret());
  const allowed =
    (await hit(db, `inquiry-ip:${ipKey}`, rules.inquiryPerIp)) && (await hit(db, `inquiry-site:${site.id}`, rules.inquiryPerSite));
  if (!allowed) return { ok: false, message: "Du har sendt mange meldinger på kort tid. Prøv igjen om litt, eller ring oss.", values };

  const { name, email, phone, message, path } = parsed.data;
  const [row] = await db
    .insert(inquiries)
    .values({ siteId: site.id, name, email: email || null, phone: phone || null, message, pagePath: path })
    .returning({ id: inquiries.id });
  await db.insert(auditLog).values({ siteId: site.id, action: "inquiry.received", detail: { inquiryId: row.id } });
  // Varsel på e-post til bedriften kommer når Brevo er koblet til (fase 1b).

  return { ok: true, message: "Takk! Meldingen er sendt, og du får svar så snart som mulig." };
}
