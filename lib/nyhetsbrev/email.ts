import { variantKey } from "@/lib/media-types";
import { formatAddress, formatOrgnr, type SiteInfo } from "@/lib/site-info";
import { resolveTheme, type Theme } from "@/lib/theme";
import type { NewsletterBlock, NewsletterInput } from "./blocks";

/*
 * E-postene til nyhetsbrevet, i nettstedets egne farger. Ren HTML med tabeller og stil på hvert element,
 * fordi mange e-postprogrammer fjerner <style> og ikke kan flexbox. Ingen avhengigheter til server eller database,
 * så studioet viser forhåndsvisningen med akkurat samme kode.
 */

export type NewsletterSite = {
  name: string;
  info: SiteInfo;
  theme: Partial<Theme> | null | undefined;
  /** Der nettstedet vises, for eksempel https://salong.no. Brukes til bilder og lenker som starter med /. */
  baseUrl: string;
};

export type Rendered = { subject: string; html: string; text: string };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Alt kunden skriver, escapes, så ingen kan legge HTML inn i e-posten. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Lenker som starter med / gjelder nettstedet. Andre må være http, https, mailto eller tel. */
export function absoluteUrl(href: string, baseUrl: string): string {
  if (href.startsWith("/")) return `${baseUrl.replace(/\/$/, "")}${href}`;
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : "#";
}

/** Den mellomstore utgaven av bildet (1280 px), så e-posten ikke henter originalen. GIF beholder animasjonen. */
function imageUrl(src: string, baseUrl: string): string {
  // Bildene ligger alltid på /media rett under domenet, også når nettstedet vises via /vis/<slug>.
  let origin = baseUrl;
  try {
    origin = new URL(baseUrl).origin;
  } catch {}
  return absoluteUrl(src.endsWith(".gif") ? src : variantKey(src, 1280), origin);
}

function paragraphs(text: string, color: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${color};">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function blockHtml(block: NewsletterBlock, site: NewsletterSite, t: ReturnType<typeof resolveTheme>): string {
  switch (block.type) {
    case "overskrift":
      return block.tekst ? `<h2 style="margin:8px 0 12px;font-size:22px;line-height:1.3;color:${t.text};">${esc(block.tekst)}</h2>` : "";
    case "tekst":
      return paragraphs(block.tekst, t.text);
    case "bilde":
      return block.src
        ? `<p style="margin:0 0 16px;"><img src="${esc(imageUrl(block.src, site.baseUrl))}" alt="${esc(block.alt)}" width="504" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:6px;"></p>`
        : "";
    case "knapp":
      if (!block.tekst || !block.lenke) return "";
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="background:${t.primary};border-radius:6px;"><a href="${esc(absoluteUrl(block.lenke, site.baseUrl))}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;font-weight:600;color:${t.onPrimary};text-decoration:none;">${esc(block.tekst)}</a></td></tr></table>`;
  }
}

function blockText(block: NewsletterBlock, site: NewsletterSite): string {
  switch (block.type) {
    case "overskrift":
      return block.tekst;
    case "tekst":
      return block.tekst;
    case "bilde":
      return "";
    case "knapp":
      return block.tekst && block.lenke ? `${block.tekst}: ${absoluteUrl(block.lenke, site.baseUrl)}` : "";
  }
}

/** Navn, adresse og org.nr. nederst. Markedsføringsloven krever at det går tydelig fram hvem som sender. */
function senderLines(site: NewsletterSite): string[] {
  const address = formatAddress(site.info);
  return [site.name, address, site.info.orgnr ? `Org.nr. ${formatOrgnr(site.info.orgnr)}` : "", site.info.email].filter(Boolean);
}

function layout(o: { subject: string; preheader: string; site: NewsletterSite; body: string; footer: string }): string {
  const t = resolveTheme(o.site.theme);
  return `<!doctype html>
<html lang="nb">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.subject)}</title></head>
<body style="margin:0;padding:0;background:${t.surface};">
${o.preheader ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</span>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.surface};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${t.background};border-radius:8px;border-top:4px solid ${t.primary};">
<tr><td style="padding:24px 28px 8px;font-family:${FONT};color:${t.text};">
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:${t.text};">${esc(o.site.name)}</p>
${o.body}
</td></tr>
<tr><td style="padding:16px 28px 28px;font-family:${FONT};font-size:13px;line-height:1.6;color:${t.muted};border-top:1px solid ${t.surface};">${o.footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

/**
 * Selve nyhetsbrevet. `unsubscribeUrl` er den personlige avmeldingslenken. I forhåndsvisningen og testutgaven
 * er den en lenke uten nøkkel.
 */
export function newsletterEmail(input: NewsletterInput, site: NewsletterSite, unsubscribeUrl: string): Rendered {
  const t = resolveTheme(site.theme);
  const subject = input.subject.replace(/\p{Cc}+/gu, " ").trim();
  const sender = senderLines(site);
  const reason = `Du får denne e-posten fordi du har meldt deg på nyhetsbrevet fra ${site.name}.`;
  const footer = [
    sender.map((line, i) => (i === 0 ? `<strong>${esc(line)}</strong>` : esc(line))).join("<br>"),
    `<p style="margin:12px 0 0;">${esc(reason)} <a href="${esc(unsubscribeUrl)}" style="color:${t.text};text-decoration:underline;">Meld deg av nyhetsbrevet</a></p>`,
  ].join("");
  const text = [
    ...input.blocks.map((b) => blockText(b, site)).filter(Boolean),
    "",
    "--",
    ...sender,
    "",
    reason,
    `Meld deg av: ${unsubscribeUrl}`,
  ].join("\n\n").replace(/\n{3,}/g, "\n\n");
  return {
    subject,
    text,
    html: layout({ subject, preheader: input.preheader, site, body: input.blocks.map((b) => blockHtml(b, site, t)).join(""), footer }),
  };
}

/** Bekreftelsen i dobbel opt-in. Ingen nyhetsbrev sendes før personen har trykket på knappen her. */
export function confirmationEmail(site: NewsletterSite, confirmUrl: string): Rendered {
  const t = resolveTheme(site.theme);
  const subject = `Bekreft påmeldingen til nyhetsbrevet fra ${site.name}`;
  const intro = `Takk for at du vil ha nyhetsbrevet fra ${site.name}. Trykk på knappen for å bekrefte at det er din e-postadresse.`;
  const ignore = "Har du ikke meldt deg på selv, kan du se bort fra denne e-posten. Da får du ingen nyhetsbrev fra oss.";
  const validity = "Lenken virker i 30 dager.";
  const body = [
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${t.text};">Bekreft påmeldingen</h1>`,
    paragraphs(intro, t.text),
    blockHtml({ type: "knapp", tekst: "Bekreft påmeldingen", lenke: confirmUrl }, site, t),
    paragraphs(`${validity} ${ignore}`, t.muted),
  ].join("");
  const footer = senderLines(site)
    .map((line, i) => (i === 0 ? `<strong>${esc(line)}</strong>` : esc(line)))
    .join("<br>");
  const text = [intro, `Bekreft påmeldingen: ${confirmUrl}`, `${validity} ${ignore}`, "--", ...senderLines(site)].join("\n\n");
  return { subject, text, html: layout({ subject, preheader: intro, site, body, footer }) };
}
