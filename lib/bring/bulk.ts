import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { orders, sites } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { bookBringShipment, bringLabelPdf, readBringBooking, readOrderBring } from "./booking";
import { loadBringAccess } from "./config";
import { readBringAccount, readBringShipping } from "./state";

/** Workers har en grense på CPU-tid og antall kall per forespørsel. Hver etikett er en bestilling hos Bring pluss en nedlasting. */
export const MAX_BULK_LABELS = 25;

const UUID = /^[0-9a-f-]{36}$/;

/** Ordre-id-ene fra nettleseren: bare gyldige id-er, uten dubletter, mellom 1 og 25. */
export function parseOrderIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string" || !UUID.test(id))) throw new ShopError("Valget av ordre er ugyldig. Last siden på nytt.");
  const ids = [...new Set(raw as string[])];
  if (ids.length === 0) throw new ShopError("Velg minst én ordre.");
  if (ids.length > MAX_BULK_LABELS) throw new ShopError(`Du kan velge maks ${MAX_BULK_LABELS} ordre om gangen. Du valgte ${ids.length}.`);
  return ids;
}

export type BulkItemStatus = "booked" | "skipped" | "failed";
export type BulkItem = { orderId: string; number: number | null; status: BulkItemStatus; reason: string | null };
export type BulkLabelsResult = { booked: number; skipped: number; failed: number; items: BulkItem[] };

type OrderRow = typeof orders.$inferSelect;

/** Hvorfor en ordre ikke skal få etikett i bulk, eller null hvis den kan bookes. Rekkefølgen er den en pakker tenker i. */
function skipReason(order: OrderRow): string | null {
  if (readBringBooking(order.shipping)) return "Har etikett fra før";
  if (order.status === "pending_payment") return "Ikke betalt ennå";
  if (order.status === "cancelled" || order.status === "refunded") return "Kansellert eller refundert";
  if (!order.shippingAddress) {
    return order.shipping.code === "hent" ? "Hentes i butikken, så den trenger ingen etikett" : "Ordren har ingen leveringsadresse";
  }
  const bring = readOrderBring(order.shipping);
  if (!bring) return "Kunden valgte ikke Bring i kassen. Lag etiketten fra ordresiden";
  if (bring.weightGrams === null) return "Vekten mangler. Lag etiketten fra ordresiden og skriv vekten selv";
  return null;
}

/**
 * Bestiller etiketter for de valgte ordrene som ikke har etikett ennå. Ordre som skal hentes, mangler adresse, ikke er betalt
 * eller mangler vekt, hoppes over med en forklaring. Én feil stopper ikke de andre. Ordrene tas én og én, så Bring ikke
 * får mange bestillinger samtidig, og hver ordre holdes av i databasen før kallet (se bookBringShipment), så det samme
 * aldri bookes to ganger, heller ikke ved to samtidige klikk.
 */
export async function bulkBookLabels(db: Db, siteId: string, rawIds: unknown, userId: string, now = new Date()): Promise<BulkLabelsResult> {
  const ids = parseOrderIds(rawIds);

  // Mangler Bring-oppsettet, ville alle ordrene feilet likt. Si det én gang.
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk"))).limit(1);
  if (!site) throw new ShopError("Fant ikke nettbutikken");
  if (!(await loadBringAccess(site))) throw new ShopError("Bring er ikke koblet til. Koble til Bring under Innstillinger, Frakt med Bring.");
  if (!readBringShipping(site.shop)) throw new ShopError("Fyll inn avsenderadressen under Frakt med Bring før du lager etiketter.");

  const rows = await db.select().from(orders).where(and(eq(orders.siteId, siteId), inArray(orders.id, ids)));
  const byId = new Map(rows.map((o) => [o.id, o]));

  const result: BulkLabelsResult = { booked: 0, skipped: 0, failed: 0, items: [] };
  const add = (item: BulkItem) => {
    result.items.push(item);
    result[item.status] += 1;
  };

  for (const id of ids) {
    const order = byId.get(id);
    if (!order) {
      add({ orderId: id, number: null, status: "skipped", reason: "Fant ikke ordren i denne butikken" });
      continue;
    }
    const why = skipReason(order);
    if (why) {
      add({ orderId: id, number: order.number, status: "skipped", reason: why });
      continue;
    }
    const bring = readOrderBring(order.shipping)!;
    try {
      const outcome = await bookBringShipment(db, siteId, id, { product: bring.product, weightGrams: bring.weightGrams }, userId, now);
      const notes = [
        outcome.labelError ? `Etiketten ble ikke hentet: ${outcome.labelError}` : null,
        outcome.trackingSaved ? null : `Sendingsnummeret ${outcome.booking.consignmentNumber} må legges inn under Sporing`,
      ].filter(Boolean);
      add({ orderId: id, number: order.number, status: "booked", reason: notes.length ? notes.join(". ") : null });
    } catch (err) {
      if (err instanceof ShopError) {
        add({ orderId: id, number: order.number, status: "failed", reason: err.message });
      } else {
        console.error("Fraktetikett i bulk feilet", err instanceof Error ? err.name : "ukjent feil");
        add({ orderId: id, number: order.number, status: "failed", reason: "Noe gikk galt. Sjekk i Mybring om sendingen ble bestilt før du prøver igjen" });
      }
    }
  }
  return result;
}

// ---------- Samlet utskrift ----------

export type PrintSelection = { withLabel: { orderId: string; number: number }[]; without: { orderId: string; number: number | null; reason: string }[] };

/** Hvilke av de valgte ordrene som har en etikett, uten å hente selve PDF-ene. */
export async function labelSelection(db: Db, siteId: string, rawIds: unknown): Promise<PrintSelection> {
  const ids = parseOrderIds(rawIds);
  const rows = await db.select().from(orders).where(and(eq(orders.siteId, siteId), inArray(orders.id, ids)));
  const byId = new Map(rows.map((o) => [o.id, o]));
  const selection: PrintSelection = { withLabel: [], without: [] };
  for (const id of ids) {
    const order = byId.get(id);
    if (!order) selection.without.push({ orderId: id, number: null, reason: "Fant ikke ordren i denne butikken" });
    else if (readBringBooking(order.shipping)) selection.withLabel.push({ orderId: id, number: order.number });
    else selection.without.push({ orderId: id, number: order.number, reason: "Ingen etikett laget ennå" });
  }
  return selection;
}

export type CollectedLabels = {
  labels: { orderId: string; number: number; bytes: Uint8Array }[];
  missing: { orderId: string; number: number | null; reason: string }[];
};

async function toBytes(body: ReadableStream | Uint8Array): Promise<Uint8Array> {
  return body instanceof Uint8Array ? body : new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}

/**
 * Henter etikett-PDF-ene for de valgte ordrene, i valgt rekkefølge. Den som kaller, må ha sjekket at brukeren har tilgang
 * til butikken. Etiketter som ikke kan hentes, havner i missing med årsak, og stopper ikke de andre.
 */
export async function collectLabels(db: Db, siteId: string, rawIds: unknown): Promise<CollectedLabels> {
  const selection = await labelSelection(db, siteId, rawIds);
  const collected: CollectedLabels = { labels: [], missing: [...selection.without] };
  for (const { orderId, number } of selection.withLabel) {
    try {
      const label = await bringLabelPdf(db, siteId, orderId);
      if (label) collected.labels.push({ orderId, number, bytes: await toBytes(label.body) });
      else collected.missing.push({ orderId, number, reason: "Etiketten kunne ikke hentes. Finn den i Mybring" });
    } catch (err) {
      if (!(err instanceof ShopError)) console.error("Henting av fraktetikett feilet", err instanceof Error ? err.name : "ukjent feil");
      collected.missing.push({ orderId, number, reason: err instanceof ShopError ? err.message : "Etiketten kunne ikke hentes" });
    }
  }
  return collected;
}

// ---------- Status i ordrelista ----------

export type LabelBadge = { state: "booked"; consignmentNumber: string } | { state: "none" } | null;

/** «Etikett laget» med sporingsnummer, eller «Ikke booket». Ordre som hentes i butikken eller ikke er betalt, får ingen merkelapp. */
export function labelBadge(order: Pick<OrderRow, "status" | "shipping" | "shippingAddress">, bringReady: boolean): LabelBadge {
  const booking = readBringBooking(order.shipping);
  if (booking) return { state: "booked", consignmentNumber: booking.consignmentNumber };
  if (!bringReady || !order.shippingAddress) return null;
  return order.status === "paid" || order.status === "fulfilled" ? { state: "none" } : null;
}

/** Bring er koblet til og avsenderen er fylt inn, så etiketter kan lages. */
export const bringLabelsReady = (shop: unknown) => Boolean(readBringAccount(shop) && readBringShipping(shop));
