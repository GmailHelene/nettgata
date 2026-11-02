"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, inquiries, sites } from "@/db/schema";
import { notifyInquiry } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { clientKey, hit, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { formFieldName, MAX_FORM_FIELDS, parseFormAnswers, readFormFields, type FormField } from "@/lib/content/form-fields";
import { getPublishedPage } from "@/lib/publishing";
import type { Db } from "@/db";

/** De egne feltene i kontaktskjemaet slik de står på den publiserte siden. Ukjent side eller seksjon gir ingen felt. */
async function publishedFormFields(db: Db, siteId: string, path: string, sectionId: string): Promise<FormField[]> {
  if (!sectionId || sectionId.length > 64) return [];
  const page = await getPublishedPage(db, siteId, path);
  const section = page?.content.sections.find((s) => s.id === sectionId && s.type === "kontakt" && s.variant === "skjema" && !s.hidden);
  return section ? readFormFields(section.props) : [];
}

/** `extra`: svarene i feltene kunden har lagt til selv, etter feltnavn («felt-0»). */
type Values = { name: string; email: string; phone: string; message: string; extra?: Record<string, string> };
/** Ved feil sendes det kunden skrev tilbake, så skjemaet ikke tømmes. */
/** `field`: feltet feilen gjelder, så skjemaet kan merke det og flytte fokus dit. */
export type InquiryState = { ok: boolean; message: string; values?: Values; field?: string } | null;

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
  .refine((v) => v.email !== "" || v.phone !== "", { message: "Oppgi e-post eller telefon, så vi kan svare deg", path: ["email"] });

/** Tar imot kontaktskjemaet på kundens nettsted. Offentlig, så alt valideres og begrenses. */
export async function submitInquiry(siteId: string, _prev: InquiryState, formData: FormData): Promise<InquiryState> {
  // Honningkrukke: feltet er skjult for mennesker. Roboter som fyller det, får et vanlig svar uten at noe lagres.
  if (String(formData.get("nettsted") ?? "") !== "") return { ok: true, message: "Takk! Meldingen er sendt." };

  const values: Values = {
    name: String(formData.get("name") ?? "").slice(0, 100),
    email: String(formData.get("email") ?? "").slice(0, 120),
    phone: String(formData.get("phone") ?? "").slice(0, 30),
    message: String(formData.get("message") ?? "").slice(0, 4000),
    extra: Object.fromEntries(
      Array.from({ length: MAX_FORM_FIELDS }, (_, i) => formFieldName(i))
        .filter((name) => formData.has(name))
        .map((name) => [name, String(formData.get(name) ?? "").slice(0, 2000)]),
    ),
  };
  const parsed = inquirySchema.safeParse({ ...values, path: String(formData.get("path") ?? "/") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message, values, field: String(parsed.error.issues[0].path[0] ?? "") || undefined };

  // Siden er offentlig, så id-en kan være hva som helst. En ugyldig id skal gi samme svar som en ukjent, ikke en databasefeil.
  if (!/^[0-9a-f-]{36}$/.test(siteId)) return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };
  const db = await getDb();
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, message: "Skjemaet er ikke tilgjengelig", values };

  // De egne feltene hentes fra den publiserte siden. Nettleseren bestemmer aldri hvilke felt som finnes.
  const fields = await publishedFormFields(db, site.id, parsed.data.path, String(formData.get("section") ?? ""));
  const answers = parseFormAnswers(fields, values.extra ?? {});
  if (!answers.ok) return { ok: false, message: answers.message, values, field: answers.field };

  const ipKey = await clientKey(await headers(), getSecret());
  const allowed =
    (await hit(db, `inquiry-ip:${ipKey}`, rules.inquiryPerIp)) && (await hit(db, `inquiry-site:${site.id}`, rules.inquiryPerSite));
  if (!allowed) return { ok: false, message: "Du har sendt mange meldinger på kort tid. Prøv igjen om litt, eller ring oss.", values };

  const { name, email, phone, message, path } = parsed.data;
  const [row] = await db
    .insert(inquiries)
    .values({
      siteId: site.id,
      name,
      email: email || null,
      phone: phone || null,
      // Meldingen slik den ble skrevet, og svarene i de egne feltene for seg, så innboksen kan vise dem som en liste.
      message,
      answers: answers.answers.length ? answers.answers : null,
      pagePath: path,
    })
    .returning({ id: inquiries.id });
  await db.insert(auditLog).values({ siteId: site.id, action: "inquiry.received", detail: { inquiryId: row.id } });
  after(() => notifyInquiry(db, getEmailProvider(), row.id).catch((err) => console.error("Henvendelsesvarsel feilet", err)));

  return { ok: true, message: "Takk! Meldingen er sendt, og du får svar så snart som mulig." };
}
