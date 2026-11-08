/**
 * Navnene på hendelsene i revisjonsloggen (audit_log), slik eieren ser dem under Innstillinger › Logg.
 * Loggen skrives allerede av hele plattformen. Her får hendelsene et navn en butikkeier forstår, og en gruppe.
 * En hendelse som ikke står her, vises med gruppens navn, så nye hendelser aldri blir borte fra visningen.
 */

export type LogGroup = "ordre" | "betaling" | "varer" | "sider" | "innstillinger" | "brukere" | "kunder" | "regnskap" | "annet";

export const logGroups: Record<LogGroup, string> = {
  ordre: "Ordre",
  betaling: "Betaling",
  varer: "Varer og rabatter",
  sider: "Sider og bilder",
  innstillinger: "Innstillinger",
  brukere: "Brukere og tilgang",
  kunder: "Kunder og henvendelser",
  regnskap: "Regnskap og eksport",
  annet: "Annet",
};

const labels: Record<string, string> = {
  "order.created": "Ny ordre",
  "order.status": "Status på ordre endret",
  "order.tracking": "Sporingsnummer lagt inn",
  "order.partially_refunded": "Deler av ordre refundert",
  "order.refund_abandoned": "Refusjon avbrutt",
  "order.fiken_sent": "Ordre sendt til Fiken",
  "order.fiken_failed": "Ordre kunne ikke sendes til Fiken",
  "creditnote.created": "Kreditnota laget",
  "creditnote.retry": "Kreditnota laget på nytt",
  "payment.paid": "Betaling bekreftet",
  "payment.captured": "Beløp trukket",
  "payment.refunded": "Beløp betalt tilbake",
  "payment.partially_refunded": "Delbeløp betalt tilbake",
  "payment.released": "Reservasjon frigjort",
  "payment.cancelled": "Betaling stoppet",
  "payment.amount_mismatch": "Beløpet stemte ikke, betalingen ble stoppet",
  "payment.validation_rejected": "Betaling avvist i kontrollen",
  "payment.skipped": "Testbetaling uten nøkler",
  "payment.keys_saved": "Betalingsnøkler lagret",
  "payment.keys_tested": "Betalingsnøkler testet",
  "payment.keys_removed": "Betalingsnøkler fjernet",
  "product.created": "Vare lagt til",
  "product.updated": "Vare endret",
  "product.archived": "Vare arkivert",
  "product.import": "Varer importert",
  "product.bulk": "Flere varer endret",
  "product.bulk_variants": "Pris og lager endret",
  "discount.created": "Rabattkode lagt til",
  "discount.updated": "Rabattkode endret",
  "discount.deleted": "Rabattkode slettet",
  "discount.active": "Rabattkode slått av eller på",
  "page.created": "Side lagt til",
  "page.draft_saved": "Kladd lagret",
  "page.published": "Side publisert",
  "page.restored": "Tidligere versjon hentet tilbake",
  "page.duplicated": "Side kopiert",
  "page.deleted": "Side slettet",
  "page.path_changed": "Adressen til en side endret",
  "media.uploaded": "Bilde lastet opp",
  "media.deleted": "Bilde slettet",
  "site.settings_updated": "Firma og kontakt endret",
  "site.theme_updated": "Design endret",
  "site.appearance_updated": "Logo, toppstripe eller bunntekst endret",
  "site.favicon_updated": "Ikon i nettleserfanen endret",
  "site.favicon_removed": "Ikon i nettleserfanen fjernet",
  "site.redirects_updated": "Omdirigeringer endret",
  "site.notifications_updated": "Varsler på e-post endret",
  "site.created": "Nettstedet ble laget",
  "shop.settings_updated": "Frakt, betaling eller vilkår endret",
  "bring.keys_saved": "Bring-nøkler lagret",
  "bring.keys_tested": "Bring-tilkoblingen testet",
  "bring.keys_removed": "Bring-nøkler fjernet",
  "bring.shipping_saved": "Bring-frakt endret",
  "bring.booked": "Fraktetikett bestilt hos Bring",
  "domain.added": "Domene lagt til",
  "domain.removed": "Domene fjernet",
  "invitation.created": "Invitasjon sendt",
  "invitation.accepted": "Invitasjon godtatt",
  "invitation.revoked": "Invitasjon trukket tilbake",
  "member.removed": "Bruker fjernet",
  "customer.exported": "Opplysninger om en kunde lastet ned",
  "customer.erased": "Kunde slettet",
  "inquiry.received": "Ny henvendelse",
  "inquiry.deleted": "Henvendelse slettet",
  "newsletter.sent": "Nyhetsbrev sendt",
  "newsletter.subscriber_deleted": "Abonnent slettet",
  "booking.created": "Ny timebestilling",
  "booking.cancelled": "Timebestilling avbestilt",
  "export.requested": "«Last ned alt» startet",
  "export.downloaded": "«Last ned alt» lastet ned",
  "billing.checkout_started": "Abonnement påbegynt",
  "billing.terms_accepted": "Vilkårene godtatt",
  "billing.addon_added": "Tillegg lagt til",
  "billing.addon_removed": "Tillegg fjernet",
  "ai.run_started": "AI-teamet laget forslag",
  "ai.approved": "Forslag fra AI-teamet godkjent",
  "ai.rejected": "Forslag fra AI-teamet avvist",
};

const prefixGroup: Record<string, LogGroup> = {
  order: "ordre",
  creditnote: "regnskap",
  payment: "betaling",
  product: "varer",
  discount: "varer",
  page: "sider",
  media: "sider",
  site: "innstillinger",
  shop: "innstillinger",
  bring: "innstillinger",
  domain: "innstillinger",
  billing: "innstillinger",
  invitation: "brukere",
  member: "brukere",
  customer: "kunder",
  inquiry: "kunder",
  newsletter: "kunder",
  booking: "kunder",
  fiken: "regnskap",
  export: "regnskap",
};

export function logGroup(action: string): LogGroup {
  if (action.startsWith("order.fiken")) return "regnskap";
  return prefixGroup[action.split(".")[0]] ?? "annet";
}

export function logLabel(action: string): string {
  return labels[action] ?? (action.startsWith("fiken.") ? "Fiken-koblingen" : logGroups[logGroup(action)]);
}

/** Hendelsene i en gruppe, for filteret. Bare kjente navn, så filteret virker i SQL. */
export function actionsIn(group: LogGroup): string[] {
  return Object.keys(labels).filter((a) => logGroup(a) === group);
}

/** Kort beløp fra detaljene, når hendelsen gjelder penger. */
export function logAmount(detail: Record<string, unknown> | null): number | null {
  const v = detail?.amountOre;
  return typeof v === "number" ? v : null;
}

/** Prefiksene som hører til en gruppe, for filteret i SQL (for eksempel «payment.%»). */
export function prefixesIn(group: LogGroup): string[] {
  return Object.entries(prefixGroup)
    .filter(([, g]) => g === group)
    .map(([p]) => p);
}
