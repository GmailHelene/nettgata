import type { Db } from "@/db";
import { emailLog } from "@/db/schema";

export type EmailAddress = { email: string; name?: string };
export type EmailKind = "ordrebekreftelse" | "ny-ordre" | "sendt" | "ny-henvendelse";

export type EmailMessage = {
  to: EmailAddress;
  /** Avsendernavnet mottakeren ser, for eksempel butikkens navn. Adressen er alltid plattformens (EMAIL_FROM). */
  fromName: string;
  replyTo?: EmailAddress;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
};

export interface EmailProvider {
  readonly name: "brevo" | "logg";
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

/** Brevo (transaksjonell e-post). Svar fra kunden går til replyTo, som er butikkens egen adresse. */
export function brevoProvider(apiKey: string, fromEmail: string): EmailProvider {
  return {
    name: "brevo",
    async send(m) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: m.fromName, email: fromEmail },
          to: [m.to],
          ...(m.replyTo && { replyTo: m.replyTo }),
          subject: m.subject,
          htmlContent: m.html,
          textContent: m.text,
          ...(m.tags?.length && { tags: m.tags }),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => null)) as { messageId?: string; message?: string; code?: string } | null;
      if (!res.ok) throw new Error(`Brevo svarte ${res.status}: ${body?.message ?? body?.code ?? "ukjent feil"}`);
      return { id: body?.messageId ?? null };
    },
  };
}

/** Uten oppsett sendes ingenting. E-posten lagres bare i loggen, og kan forhåndsvises lokalt. */
export const logProvider: EmailProvider = {
  name: "logg",
  async send() {
    return { id: null };
  },
};

export function getEmailProvider(): EmailProvider {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return apiKey && from ? brevoProvider(apiKey, from) : logProvider;
}

type Preview = { subject: string; html: string };
const previews = ((globalThis as { __epostForhandsvisning?: Map<string, Preview> }).__epostForhandsvisning ??= new Map());

/** Innholdet lagres aldri i databasen. Lokalt holdes det i minnet, så malene kan sjekkes i studioet. */
export function emailPreview(id: string): Preview | null {
  if (process.env.NODE_ENV === "production") return null;
  return previews.get(id) ?? null;
}

/**
 * Sender og logger. Kaster aldri: en e-post som feiler skal ikke stoppe en ordre eller en henvendelse.
 * Feilen havner i loggen, så butikken kan se den på ordren.
 */
export async function deliver(
  db: Db,
  provider: EmailProvider,
  entry: { siteId: string; kind: EmailKind; orderId?: string; inquiryId?: string },
  message: EmailMessage,
) {
  let status: "sendt" | "feilet" | "logget" = "logget";
  let providerId: string | null = null;
  let error: string | null = null;
  if (provider.name !== "logg") {
    try {
      providerId = (await provider.send(message)).id;
      status = "sendt";
    } catch (err) {
      status = "feilet";
      error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      console.error("E-post feilet", entry.kind, err);
    }
  }
  const [row] = await db
    .insert(emailLog)
    .values({
      siteId: entry.siteId,
      kind: entry.kind,
      recipient: message.to.email,
      subject: message.subject,
      status,
      providerId,
      error,
      orderId: entry.orderId ?? null,
      inquiryId: entry.inquiryId ?? null,
    })
    .returning({ id: emailLog.id });
  if (process.env.NODE_ENV !== "production") previews.set(row.id, { subject: message.subject, html: message.html });
  return { id: row.id, status };
}
