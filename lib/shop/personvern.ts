import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, bookings, customers, emailLog, inquiries, newsletterSubscribers, orderLines, orders } from "@/db/schema";
import { deleteInquiryImages } from "@/lib/henvendelser/bilder";
import type { MediaStore } from "@/lib/storage";
import { ShopError } from "./catalog";

/**
 * Innsyn og sletting for én kunde (GDPR artikkel 15, 17 og 20). Butikken er behandlingsansvarlig og svarer kunden.
 * Nettgata gir verktøyet: alt om kunden i én fil, og sletting som følger bokføringsloven.
 *
 * Ordre må oppbevares i fem år etter utgangen av regnskapsåret (bokføringsloven § 13, samme regel som i
 * personvernerklæringene i lib/legal). Slike ordre blir stående med navn og adresse, men kobles fra kunden.
 * Eldre ordre anonymiseres. Henvendelser, nyhetsbrev og bookinger fra samme e-postadresse slettes.
 */

const lower = (email: string) => email.trim().toLowerCase();

/** Første dag ordren kan anonymiseres: 1. januar seks år etter bestillingsåret (fem år etter regnskapsårets slutt). */
export function retentionEnds(createdAt: Date): Date {
  return new Date(Date.UTC(createdAt.getUTCFullYear() + 6, 0, 1));
}

async function findCustomer(db: Db, siteId: string, customerId: string) {
  const [customer] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.siteId, siteId))).limit(1);
  if (!customer) throw new ShopError("Fant ikke kunden");
  return customer;
}

/** Ordre som hører til kunden: koblet til kunden, eller lagt inn med samme e-post (for eksempel før kunden fantes). */
function ordersFor(siteId: string, customerId: string, email: string) {
  return and(eq(orders.siteId, siteId), sql`(${orders.customerId} = ${customerId} or lower(${orders.customerEmail}) = ${email})`);
}

/** Alt butikken har lagret om kunden, som maskinlesbar fil (artikkel 15 og 20). */
export async function customerDataExport(db: Db, siteId: string, customerId: string) {
  const customer = await findCustomer(db, siteId, customerId);
  const email = lower(customer.email);
  const orderRows = await db.select().from(orders).where(ordersFor(siteId, customerId, email));
  const lines = orderRows.length ? await db.select().from(orderLines).where(inArray(orderLines.orderId, orderRows.map((o) => o.id))) : [];
  const [inquiryRows, subscriberRows, bookingRows, emailRows] = await Promise.all([
    db.select().from(inquiries).where(and(eq(inquiries.siteId, siteId), sql`lower(${inquiries.email}) = ${email}`)),
    db.select().from(newsletterSubscribers).where(and(eq(newsletterSubscribers.siteId, siteId), sql`lower(${newsletterSubscribers.email}) = ${email}`)),
    db.select().from(bookings).where(and(eq(bookings.siteId, siteId), sql`lower(${bookings.customerEmail}) = ${email}`)),
    db.select().from(emailLog).where(and(eq(emailLog.siteId, siteId), sql`lower(${emailLog.recipient}) = ${email}`)),
  ]);
  return {
    laget: new Date().toISOString(),
    forklaring:
      "Dette er alle opplysningene butikken har lagret om deg i Nettgata: kundeopplysninger, ordre, henvendelser fra kontaktskjemaet, nyhetsbrev, timebestillinger og e-poster som er sendt til deg. Betalingsopplysninger som kortnummer lagres aldri her, de ligger hos betalingsløsningen.",
    kunde: { navn: customer.name, epost: customer.email, telefon: customer.phone, registrert: customer.createdAt, notat: customer.note },
    ordre: orderRows.map((o) => ({
      nummer: o.number,
      dato: o.createdAt,
      status: o.status,
      navn: o.customerName,
      epost: o.customerEmail,
      telefon: o.customerPhone,
      leveringsadresse: o.shippingAddress,
      frakt: o.shipping.name,
      betaling: o.paymentMethod,
      beløpØre: o.totalOre,
      refundertØre: o.refundedOre,
      melding: o.note,
      sporingsnummer: o.trackingNumber,
      varer: lines.filter((l) => l.orderId === o.id).map((l) => ({ navn: l.name, variant: l.variantLabel, antall: l.quantity, beløpØre: l.totalOre })),
    })),
    henvendelser: inquiryRows.map((i) => ({ dato: i.createdAt, navn: i.name, epost: i.email, melding: i.message })),
    nyhetsbrev: subscriberRows.map((s) => ({ epost: s.email, navn: s.name, status: s.status, samtykke: s.consentedAt })),
    timebestillinger: bookingRows.map((b) => ({ tidspunkt: b.startsAt, status: b.status, tjeneste: b.serviceName, hos: b.staffName, navn: b.customerName, epost: b.customerEmail, telefon: b.customerPhone })),
    eposter: emailRows.map((e) => ({ dato: e.createdAt, emne: e.subject, status: e.status })),
  };
}

export type CustomerErasure = { keptOrders: number; anonymizedOrders: number; keptUntil: Date | null; inquiries: number; subscriptions: number; bookings: number };

/**
 * Sletter kunden (artikkel 17). Ordre innenfor oppbevaringstiden beholdes som regnskapet krever, men kobles fra
 * kunden. Det er bare ordre og kreditnotaer som har lovkrav om oppbevaring, så resten slettes.
 */
export async function eraseCustomer(db: Db, store: MediaStore | null, siteId: string, customerId: string, userId: string | null, now = new Date()): Promise<CustomerErasure> {
  const customer = await findCustomer(db, siteId, customerId);
  const email = lower(customer.email);
  const orderRows = await db.select({ id: orders.id, createdAt: orders.createdAt, status: orders.status }).from(orders).where(ordersFor(siteId, customerId, email));
  const open = orderRows.filter((o) => o.status === "pending_payment" || o.status === "paid");
  if (open.length) throw new ShopError("Kunden har ordre som ikke er sendt ennå. Send eller kanseller dem først, så kan kunden slettes.");

  const old = orderRows.filter((o) => retentionEnds(o.createdAt) <= now);
  const kept = orderRows.filter((o) => retentionEnds(o.createdAt) > now);
  if (old.length) {
    await db
      .update(orders)
      .set({ customerName: "Slettet kunde", customerEmail: "slettet@nettgata.invalid", customerPhone: null, shippingAddress: null, note: null, staffNote: null, customerId: null })
      .where(and(eq(orders.siteId, siteId), inArray(orders.id, old.map((o) => o.id)), lt(orders.createdAt, now)));
  }

  const inquiryRows = await db.select({ id: inquiries.id }).from(inquiries).where(and(eq(inquiries.siteId, siteId), sql`lower(${inquiries.email}) = ${email}`));
  if (inquiryRows.length) {
    // Bildene i lageret først. Med henvendelsene borte ville bare ryddejobben funnet dem igjen.
    if (store) await deleteInquiryImages(db, store, siteId, inquiryRows.map((i) => i.id));
    await db.delete(inquiries).where(and(eq(inquiries.siteId, siteId), inArray(inquiries.id, inquiryRows.map((i) => i.id))));
  }
  const subs = await db.delete(newsletterSubscribers).where(and(eq(newsletterSubscribers.siteId, siteId), sql`lower(${newsletterSubscribers.email}) = ${email}`)).returning({ id: newsletterSubscribers.id });
  const books = await db.delete(bookings).where(and(eq(bookings.siteId, siteId), sql`lower(${bookings.customerEmail}) = ${email}`)).returning({ id: bookings.id });
  await db.update(emailLog).set({ recipient: "slettet" }).where(and(eq(emailLog.siteId, siteId), sql`lower(${emailLog.recipient}) = ${email}`));
  // Ordrene som må beholdes, kobles fra av fremmednøkkelen (on delete set null).
  await db.delete(customers).where(and(eq(customers.id, customer.id), eq(customers.siteId, siteId)));

  const keptUntil = kept.length ? new Date(Math.max(...kept.map((o) => retentionEnds(o.createdAt).getTime()))) : null;
  const result = { keptOrders: kept.length, anonymizedOrders: old.length, keptUntil, inquiries: inquiryRows.length, subscriptions: subs.length, bookings: books.length };
  // Loggen sier hva som ble gjort, men aldri hvem: ingen navn eller e-post.
  await db.insert(auditLog).values({ siteId, userId, action: "customer.erased", detail: { ...result, keptUntil: keptUntil?.toISOString() ?? null } });
  return result;
}
