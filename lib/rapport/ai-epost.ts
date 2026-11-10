import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sites } from "@/db/schema";
import { deliver, type EmailProvider } from "@/lib/email/send";
import { emailParts, type Rendered } from "@/lib/email/templates";
import { platformUrl } from "@/lib/site-url";
import { reportRecipients, type Recipient } from "./mottakere";

/**
 * Den korte e-posten etter den ukentlige AI-rapporten: «3 nye forslag», med lenke til AI-teamet i studioet.
 * Forslagene står ikke i e-posten. De skal leses og godkjennes i studioet, der kunden ser før og etter.
 */

export function weeklySuggestionsEmail(o: { siteName: string; count: number; url: string; role: Recipient["role"] }): Rendered {
  const { esc, button, paragraph, layout, platformFooter } = emailParts;
  const what = o.count === 1 ? "ett nytt forslag" : `${o.count} nye forslag`;
  const subject = `${o.count === 1 ? "Ett nytt forslag" : `${o.count} nye forslag`} til ${o.siteName}`;
  const intro = `AI-teamet har sett gjennom ${o.siteName} denne uka og har ${what} til deg.`;
  const how = `${o.count === 1 ? "Les forslaget, og trykk Godkjenn hvis du vil bruke det" : "Les forslagene, og trykk Godkjenn på dem du vil bruke"}. Endringen havner i kladden, og ingenting vises på nettstedet før du publiserer.`;
  const footer =
    o.role === "owner"
      ? `Du får denne e-posten fordi du er eier av ${o.siteName}. Vil du ikke ha den, slår du den av under Innstillinger, Rapporter på e-post.`
      : `Du får denne e-posten fordi du har slått den på for ${o.siteName} under Innstillinger. Der kan du slå den av igjen.`;
  return {
    subject,
    text: [intro, "", how, "", `Se forslagene: ${o.url}`, "", footer].join("\n"),
    html: layout({
      subject,
      preheader: intro,
      brand: "Nettgata",
      heading: subject,
      body: [paragraph(esc(intro)), paragraph(esc(how)), button(o.url, o.count === 1 ? "Se forslaget" : "Se forslagene")].join(""),
      footer: platformFooter(footer),
    }),
  };
}

/** Sender e-posten til dem som skal ha den (lib/rapport/mottakere.ts). Kalles én gang per ferdig ukentlig kjøring. */
export async function notifyWeeklySuggestions(db: Db, provider: EmailProvider, siteId: string, count: number) {
  const [site] = await db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return 0;
  const url = `${platformUrl()}/studio/nettsted/${site.id}/ai-teamet`;
  const recipients = await reportRecipients(db, site.id, "aiEmail");
  for (const r of recipients) {
    const email = weeklySuggestionsEmail({ siteName: site.name, count, url, role: r.role });
    await deliver(db, provider, { siteId: site.id, kind: "ai-forslag" }, { ...email, to: { email: r.email, ...(r.name && { name: r.name }) }, fromName: "Nettgata", tags: ["ai-forslag"] });
  }
  return recipients.length;
}
