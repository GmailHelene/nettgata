import type { ShippingAddress } from "@/db/schema";
import { formatNok } from "@/lib/shop/money";
import { paymentInstructions, paymentLabels, type PaymentMethod } from "@/lib/shop/settings";
import { carrierLabel } from "@/lib/shop/tracking";
import { formatOrgnr } from "@/lib/site-info";

export type Rendered = { subject: string; html: string; text: string };

export type ShopInfo = { name: string; email: string; phone: string; street: string; postalCode: string; city: string; orgnr: string };

export type OrderData = {
  number: number;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  paymentMethod: string;
  shippingName: string;
  shippingAddress: ShippingAddress | null;
  subtotalOre: number;
  discountOre: number;
  discountCode: string | null;
  shippingOre: number;
  totalOre: number;
  vatOre: number;
  note: string | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
};

export type LineData = { name: string; variantLabel: string | null; quantity: number; totalOre: number };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Alt som kommer fra kunden eller butikken, escapes, så ingen kan legge HTML eller lenker inn i e-posten. */
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function safeUrl(url: string): string {
  return /^https?:\/\//.test(url) ? esc(url) : "#";
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

function button(url: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${safeUrl(url)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">${esc(label)}</a></p>`;
}

function paragraph(html: string, style = ""): string {
  return `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;${style}">${html}</p>`;
}

function layout(o: { subject: string; preheader: string; brand: string; heading: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="nb">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:28px 28px 8px;font-family:${FONT};color:#111111;">
<p style="margin:0 0 6px;font-size:14px;color:#555555;">${esc(o.brand)}</p>
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;">${esc(o.heading)}</h1>
${o.body}
</td></tr>
<tr><td style="padding:16px 28px 28px;font-family:${FONT};font-size:13px;line-height:1.5;color:#555555;border-top:1px solid #eeeeee;">${o.footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function shopFooter(shop: ShopInfo): string {
  const address = [shop.street, [shop.postalCode, shop.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [
    `<strong>${esc(shop.name)}</strong>`,
    address && esc(address),
    shop.orgnr && `Org.nr. ${esc(formatOrgnr(shop.orgnr))}`,
    shop.email && `<a href="mailto:${esc(shop.email)}" style="color:#555555;">${esc(shop.email)}</a>`,
    shop.phone && esc(shop.phone),
  ]
    .filter(Boolean)
    .join("<br>");
}

const platformFooter = (reason: string) => `Sendt fra Nettgata. ${esc(reason)}`;

function linesTable(lines: LineData[], order: OrderData, withVat: boolean): string {
  const row = (left: string, right: string, style = "") =>
    `<tr><td style="padding:8px 0;font-size:15px;${style}">${left}</td><td style="padding:8px 0;font-size:15px;text-align:right;white-space:nowrap;${style}">${right}</td></tr>`;
  const items = lines
    .map((l) =>
      row(
        `${l.quantity} × ${esc(l.name)}${l.variantLabel ? `<br><span style="font-size:13px;color:#555555;">${esc(l.variantLabel)}</span>` : ""}`,
        esc(formatNok(l.totalOre)),
        "border-bottom:1px solid #eeeeee;",
      ),
    )
    .join("");
  const totals = [
    order.discountOre > 0 && row(`Rabatt${order.discountCode ? ` (${esc(order.discountCode)})` : ""}`, `−${esc(formatNok(order.discountOre))}`),
    row(`Frakt, ${esc(order.shippingName)}`, order.shippingOre === 0 ? "Gratis" : esc(formatNok(order.shippingOre))),
    row("<strong>Totalt</strong>", `<strong>${esc(formatNok(order.totalOre))}</strong>`),
    withVat && row('<span style="color:#555555;">Herav MVA</span>', `<span style="color:#555555;">${esc(formatNok(order.vatOre))}</span>`),
  ]
    .filter(Boolean)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">${items}${totals}</table>`;
}

function linesText(lines: LineData[], order: OrderData): string {
  return [
    ...lines.map((l) => `${l.quantity} x ${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ""}: ${formatNok(l.totalOre)}`),
    order.discountOre > 0 ? `Rabatt${order.discountCode ? ` (${order.discountCode})` : ""}: -${formatNok(order.discountOre)}` : "",
    `Frakt, ${order.shippingName}: ${order.shippingOre === 0 ? "Gratis" : formatNok(order.shippingOre)}`,
    `Totalt: ${formatNok(order.totalOre)} (herav MVA ${formatNok(order.vatOre)})`,
  ]
    .filter(Boolean)
    .join("\n");
}

function addressHtml(a: ShippingAddress): string {
  return `${esc(a.name)}<br>${esc(a.street)}<br>${esc(a.postalCode)} ${esc(a.city)}`;
}

/** «Du betaler når du henter varene.» der det finnes en instruks, ellers betalingsmåten. */
function paymentLine(order: OrderData): string {
  const instruction = paymentInstructions[order.paymentMethod as PaymentMethod];
  if (instruction) return instruction;
  const label = paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod;
  return order.status === "paid" ? `Betalt med ${label}.` : `Betaling: ${label}.`;
}

/** Hvor varene hentes, når butikken har lagt inn adressen sin. */
function pickupLine(shop: ShopInfo): string {
  const place = [shop.street, [shop.postalCode, shop.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return place ? `Du henter varene hos ${shop.name}, ${place}.` : "";
}

function contactLine(shop: ShopInfo): { html: string; text: string } {
  if (shop.email) {
    const t = `Har du spørsmål, svarer du bare på denne e-posten. Da kommer svaret rett til ${shop.name}.`;
    return { html: paragraph(esc(t)), text: t };
  }
  if (shop.phone) {
    const t = `Har du spørsmål, ring ${shop.name} på ${shop.phone}.`;
    return { html: paragraph(esc(t)), text: t };
  }
  return { html: "", text: "" };
}

// ---------- Til kunden ----------

/**
 * Ordrebekreftelsen. `angrerett` er opplysningene og angreskjemaet fra lib/legal/angrerett.ts. Angrerettloven § 18
 * krever dem på varig medium, og en lenke er ikke nok, så de står i selve e-posten.
 */
export function orderConfirmationEmail(o: {
  shop: ShopInfo;
  order: OrderData;
  lines: LineData[];
  orderUrl: string;
  termsUrl: string;
  angrerett?: { overskrift: string; avsnitt: string[]; angreskjemaOverskrift: string; angreskjema: string[]; tekst: string };
}): Rendered {
  const { shop, order, lines } = o;
  const subject = `Takk for bestillingen (ordre ${order.number})`;
  const contact = contactLine(shop);
  const payment = paymentLine(order);
  const pickup = pickupLine(shop);

  const body = [
    paragraph(`${esc(shop.name)} har fått bestillingen din. Ordrenummeret er <strong>${order.number}</strong>.`),
    paragraph(esc(payment)),
    linesTable(lines, order, true),
    order.shippingAddress ? paragraph(`<strong>Leveres til</strong><br>${addressHtml(order.shippingAddress)}`) : pickup ? paragraph(esc(pickup)) : "",
    order.note ? paragraph(`<strong>Din melding til butikken</strong><br>${esc(order.note).replace(/\n/g, "<br>")}`) : "",
    button(o.orderUrl, "Se bestillingen"),
    paragraph("Lenken viser bestillingen din, så det er lurt å ta vare på denne e-posten.", "font-size:14px;color:#555555;"),
    paragraph(`<a href="${safeUrl(o.termsUrl)}" style="color:#111111;">Les kjøpsvilkårene og angreretten</a>`, "font-size:14px;"),
    contact.html,
    o.angrerett
      ? [
          `<h2 style="margin:28px 0 10px;font-size:18px;">${esc(o.angrerett.overskrift)}</h2>`,
          ...o.angrerett.avsnitt.map((a) => paragraph(esc(a), "font-size:14px;")),
          `<div style="margin:16px 0;padding:14px 16px;border:1px solid #cccccc;border-radius:6px;font-size:14px;line-height:1.6;">`,
          `<strong>${esc(o.angrerett.angreskjemaOverskrift)}</strong><br>`,
          o.angrerett.angreskjema.map((line) => esc(line)).join("<br>"),
          `</div>`,
        ].join("")
      : "",
  ].join("");

  const text = [
    `Takk for bestillingen, ${firstName(order.customerName)}!`,
    `${shop.name} har fått bestillingen din. Ordrenummeret er ${order.number}.`,
    payment,
    "",
    linesText(lines, order),
    "",
    order.shippingAddress
      ? `Leveres til: ${order.shippingAddress.name}, ${order.shippingAddress.street}, ${order.shippingAddress.postalCode} ${order.shippingAddress.city}`
      : pickup,
    order.note ? `Din melding til butikken: ${order.note}` : "",
    "",
    `Se bestillingen: ${o.orderUrl}`,
    `Kjøpsvilkår og angrerett: ${o.termsUrl}`,
    contact.text,
    o.angrerett ? "" : "",
    o.angrerett?.tekst ?? "",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: `${shop.name} har fått bestillingen din.`,
      brand: shop.name,
      heading: `Takk for bestillingen, ${firstName(order.customerName)}!`,
      body,
      footer: shopFooter(shop),
    }),
  };
}

export function orderShippedEmail(o: { shop: ShopInfo; order: OrderData; orderUrl: string; trackingUrl: string | null }): Rendered {
  const { shop, order } = o;
  const subject = `Ordren din er sendt (ordre ${order.number})`;
  const carrier = order.trackingNumber ? carrierLabel(order.trackingCarrier) : order.shippingName;
  const contact = contactLine(shop);

  const body = [
    paragraph(`Hei ${esc(firstName(order.customerName))}. Ordre ${order.number} fra ${esc(shop.name)} er sendt med ${esc(carrier)}.`),
    order.trackingNumber ? paragraph(`Sporingsnummer: <strong>${esc(order.trackingNumber)}</strong>`) : "",
    o.trackingUrl ? button(o.trackingUrl, "Spor pakken") : "",
    order.shippingAddress ? paragraph(`<strong>Leveres til</strong><br>${addressHtml(order.shippingAddress)}`) : "",
    paragraph(`<a href="${safeUrl(o.orderUrl)}" style="color:#111111;">Se bestillingen</a>`),
    contact.html,
  ].join("");

  const text = [
    `Hei ${firstName(order.customerName)}. Ordre ${order.number} fra ${shop.name} er sendt med ${carrier}.`,
    order.trackingNumber ? `Sporingsnummer: ${order.trackingNumber}` : "",
    o.trackingUrl ? `Spor pakken: ${o.trackingUrl}` : "",
    `Se bestillingen: ${o.orderUrl}`,
    contact.text,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: layout({ subject, preheader: `Pakken fra ${shop.name} er på vei.`, brand: shop.name, heading: "Pakken er på vei!", body, footer: shopFooter(shop) }),
  };
}

// ---------- Til bedriften ----------

export function newOrderEmail(o: { shop: ShopInfo; order: OrderData; lines: LineData[]; studioUrl: string; shippedNotice: boolean }): Rendered {
  const { shop, order, lines } = o;
  const total = formatNok(order.totalOre);
  const subject = `Ny ordre ${order.number} fra ${order.customerName} (${total})`;
  const payment = paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod;
  const paid = order.status === "paid";
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  const body = [
    paragraph(`${esc(order.customerName)} har bestilt for ${esc(total)} i ${esc(shop.name)}. ${paid ? "Ordren er betalt." : `Venter på betaling (${esc(payment)}).`}`),
    linesTable(lines, order, false),
    paragraph(
      [
        `<strong>Kunde</strong>`,
        esc(order.customerName),
        `<a href="mailto:${esc(order.customerEmail)}" style="color:#111111;">${esc(order.customerEmail)}</a>`,
        order.customerPhone ? esc(order.customerPhone) : "",
      ]
        .filter(Boolean)
        .join("<br>"),
    ),
    order.shippingAddress
      ? paragraph(`<strong>Sendes til</strong><br>${addressHtml(order.shippingAddress)}`)
      : paragraph("Kunden henter varene selv."),
    order.note ? paragraph(`<strong>Melding fra kunden</strong><br>${esc(order.note).replace(/\n/g, "<br>")}`) : "",
    button(o.studioUrl, "Åpne ordren i studioet"),
    o.shippedNotice && order.shippingAddress
      ? paragraph("Når du markerer ordren som sendt, får kunden en e-post med sporingen.", "font-size:14px;color:#555555;")
      : "",
  ].join("");

  const text = [
    `${order.customerName} har bestilt for ${total} i ${shop.name}. ${paid ? "Ordren er betalt." : `Venter på betaling (${payment}).`}`,
    "",
    linesText(lines, order),
    "",
    `Kunde: ${order.customerName}, ${order.customerEmail}${order.customerPhone ? `, ${order.customerPhone}` : ""}`,
    order.shippingAddress
      ? `Sendes til: ${order.shippingAddress.name}, ${order.shippingAddress.street}, ${order.shippingAddress.postalCode} ${order.shippingAddress.city}`
      : "Kunden henter varene selv.",
    order.note ? `Melding fra kunden: ${order.note}` : "",
    "",
    `Åpne ordren: ${o.studioUrl}`,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: `${count} ${count === 1 ? "vare" : "varer"} for ${total}.`,
      brand: shop.name,
      heading: `Ny ordre ${order.number}`,
      body,
      footer: platformFooter("Du får dette fordi varsel om nye ordre er slått på under Innstillinger."),
    }),
  };
}

export function newInquiryEmail(o: {
  shop: ShopInfo;
  inquiry: { name: string; email: string | null; phone: string | null; message: string; pagePath: string | null };
  siteUrl: string;
  studioUrl: string;
}): Rendered {
  const { shop, inquiry } = o;
  const subject = `Ny henvendelse fra ${inquiry.name}`;
  const host = o.siteUrl.replace(/^https?:\/\//, "");
  const reply = inquiry.email
    ? `Svar på denne e-posten, så går svaret rett til ${inquiry.name}.`
    : `${inquiry.name} oppga bare telefon, så ring tilbake på ${inquiry.phone}.`;

  const body = [
    paragraph(`${esc(inquiry.name)} har skrevet til deg via kontaktskjemaet på ${esc(host)}.`),
    paragraph(
      [
        inquiry.email ? `E-post: <a href="mailto:${esc(inquiry.email)}" style="color:#111111;">${esc(inquiry.email)}</a>` : "",
        inquiry.phone ? `Telefon: ${esc(inquiry.phone)}` : "",
        inquiry.pagePath ? `Sendt fra siden: ${esc(inquiry.pagePath)}` : "",
      ]
        .filter(Boolean)
        .join("<br>"),
    ),
    `<div style="margin:0 0 18px;padding:14px 16px;background:#f4f4f2;border-radius:6px;font-size:16px;line-height:1.5;">${esc(inquiry.message).replace(/\n/g, "<br>")}</div>`,
    paragraph(esc(reply)),
    button(o.studioUrl, "Se alle henvendelser"),
  ].join("");

  const text = [
    `${inquiry.name} har skrevet til deg via kontaktskjemaet på ${host}.`,
    inquiry.email ? `E-post: ${inquiry.email}` : "",
    inquiry.phone ? `Telefon: ${inquiry.phone}` : "",
    inquiry.pagePath ? `Sendt fra siden: ${inquiry.pagePath}` : "",
    "",
    inquiry.message,
    "",
    reply,
    `Alle henvendelser: ${o.studioUrl}`,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: inquiry.message.slice(0, 90),
      brand: shop.name,
      heading: subject,
      body,
      footer: platformFooter("Du får dette fordi varsel om nye henvendelser er slått på under Innstillinger."),
    }),
  };
}

/** Invitasjon til et nettsted i studioet. Lenken virker i sju dager og kan bare brukes én gang. */
export function invitationEmail(o: { siteName: string; inviter: string; role: string; link: string }): Rendered {
  const subject = `Du er invitert til ${o.siteName}`;
  const body = [
    paragraph(`${esc(o.inviter)} har gitt deg tilgang til nettstedet ${esc(o.siteName)} som ${esc(o.role.toLowerCase())}.`),
    paragraph("Trykk på knappen for å lage passord og komme i gang. Lenken virker i sju dager."),
    button(o.link, "Godta invitasjonen"),
    paragraph(`Virker ikke knappen? Lim inn denne adressen i nettleseren: ${esc(o.link)}`, "font-size:14px;color:#555555;"),
  ].join("");
  const text = [
    `${o.inviter} har gitt deg tilgang til nettstedet ${o.siteName} som ${o.role.toLowerCase()}.`,
    "Åpne lenken for å lage passord og komme i gang. Den virker i sju dager.",
    "",
    o.link,
  ].join("\n");
  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: `Tilgang til ${o.siteName}`,
      brand: o.siteName,
      heading: subject,
      body,
      footer: platformFooter("Du får dette fordi noen har invitert deg. Har du ikke ventet det, kan du se bort fra e-posten."),
    }),
  };
}

// ---------- Timebestilling ----------

export type BookingMailData = {
  serviceName: string;
  staffName: string;
  /** Ferdig formatert, for eksempel «tirsdag 3. november kl. 09:30». */
  when: string;
  durationMinutes: number;
  priceOre: number | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  message: string;
};

function bookingFacts(b: BookingMailData, withCustomer: boolean): { html: string; text: string } {
  const rows: [string, string][] = [
    ["Tjeneste", b.serviceName],
    ["Hos", b.staffName],
    ["Tid", b.when],
    ["Varighet", `${b.durationMinutes} minutter`],
    ...(b.priceOre !== null ? ([["Pris", formatNok(b.priceOre)]] as [string, string][]) : []),
    ...(withCustomer
      ? ([
          ["Kunde", b.customerName],
          ["E-post", b.customerEmail],
          ...(b.customerPhone ? ([["Telefon", b.customerPhone]] as [string, string][]) : []),
        ] as [string, string][])
      : []),
  ];
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;font-size:15px;color:#555555;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;font-size:15px;">${esc(v)}</td></tr>`)
    .join("")}</table>`;
  return { html, text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") };
}

/** Bekreftelse til kunden, med lenke for å avbestille innen fristen. */
export function bookingConfirmationEmail(o: { shop: ShopInfo; booking: BookingMailData; cancelUrl: string; cancelDeadline: string }): Rendered {
  const { shop, booking } = o;
  const subject = `Timen din hos ${shop.name} er bestilt`;
  const facts = bookingFacts(booking, false);
  const contact = contactLine(shop);
  const cancelText = `Kan du ikke komme? Avbestill senest ${o.cancelDeadline}.`;
  const body = [
    paragraph(`Hei ${esc(firstName(booking.customerName))}, takk for bestillingen. Her er timen din:`),
    facts.html,
    booking.message ? paragraph(`<strong>Din melding</strong><br>${esc(booking.message).replace(/\n/g, "<br>")}`) : "",
    paragraph(esc(cancelText)),
    button(o.cancelUrl, "Avbestill timen"),
    paragraph("Lenken er personlig. Ta vare på denne e-posten, og ikke del lenken med andre.", "font-size:14px;color:#555555;"),
    contact.html,
  ].join("");
  const text = [
    `Hei ${firstName(booking.customerName)}, takk for bestillingen. Her er timen din:`,
    "",
    facts.text,
    booking.message ? `\nDin melding: ${booking.message}` : "",
    "",
    cancelText,
    `Avbestill: ${o.cancelUrl}`,
    contact.text,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
  return {
    subject,
    text,
    html: layout({ subject, preheader: `${booking.serviceName}, ${booking.when}`, brand: shop.name, heading: "Timen er bestilt", body, footer: shopFooter(shop) }),
  };
}

/** Varsel til bedriften om en ny time. Svar går rett til kunden. */
export function newBookingEmail(o: { shop: ShopInfo; booking: BookingMailData; studioUrl: string }): Rendered {
  const { booking } = o;
  const subject = `Ny time: ${booking.serviceName}, ${booking.when}`;
  const facts = bookingFacts(booking, true);
  const body = [
    paragraph(`${esc(booking.customerName)} har bestilt time på nettstedet.`),
    facts.html,
    booking.message
      ? `<div style="margin:0 0 18px;padding:14px 16px;background:#f4f4f2;border-radius:6px;font-size:16px;line-height:1.5;">${esc(booking.message).replace(/\n/g, "<br>")}</div>`
      : "",
    paragraph(esc(`Svar på denne e-posten, så går svaret rett til ${booking.customerName}.`)),
    button(o.studioUrl, "Se alle timer"),
  ].join("");
  const text = [`${booking.customerName} har bestilt time på nettstedet.`, "", facts.text, booking.message ? `\n${booking.message}` : "", "", `Alle timer: ${o.studioUrl}`]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: `${booking.customerName}, ${booking.when}`,
      brand: o.shop.name,
      heading: "Ny time",
      body,
      footer: platformFooter("Du får dette fordi varsel om timebestilling er slått på under Booking i studioet."),
    }),
  };
}

/** Til kunden når timen er avbestilt, enten av kunden selv eller av bedriften. */
export function bookingCancelledEmail(o: { shop: ShopInfo; booking: BookingMailData; byBusiness: boolean; siteUrl: string }): Rendered {
  const { shop, booking } = o;
  const subject = `Timen din hos ${shop.name} er avbestilt`;
  const facts = bookingFacts(booking, false);
  const contact = contactLine(shop);
  const lead = o.byBusiness
    ? `Hei ${firstName(booking.customerName)}, ${shop.name} har dessverre måttet avbestille timen din.`
    : `Hei ${firstName(booking.customerName)}, timen din er avbestilt.`;
  const body = [paragraph(esc(lead)), facts.html, button(o.siteUrl, "Bestill en ny time"), contact.html].join("");
  const text = [lead, "", facts.text, "", `Bestill en ny time: ${o.siteUrl}`, contact.text].filter(Boolean).join("\n");
  return {
    subject,
    text,
    html: layout({ subject, preheader: `${booking.serviceName}, ${booking.when}`, brand: shop.name, heading: "Timen er avbestilt", body, footer: shopFooter(shop) }),
  };
}

/** Til bedriften når kunden har avbestilt med lenken. */
export function bookingCancelledNoticeEmail(o: { shop: ShopInfo; booking: BookingMailData; studioUrl: string }): Rendered {
  const { booking } = o;
  const subject = `Avbestilt: ${booking.serviceName}, ${booking.when}`;
  const facts = bookingFacts(booking, true);
  const body = [paragraph(`${esc(booking.customerName)} har avbestilt timen sin. Tiden er ledig igjen.`), facts.html, button(o.studioUrl, "Se alle timer")].join("");
  const text = [`${booking.customerName} har avbestilt timen sin. Tiden er ledig igjen.`, "", facts.text, "", `Alle timer: ${o.studioUrl}`].join("\n");
  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: `${booking.customerName}, ${booking.when}`,
      brand: o.shop.name,
      heading: "Time avbestilt",
      body,
      footer: platformFooter("Du får dette fordi varsel om timebestilling er slått på under Booking i studioet."),
    }),
  };
}