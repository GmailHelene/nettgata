import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, orders, sites } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { setTracking } from "@/lib/shop/orders";
import { readSiteInfo } from "@/lib/site-info";
import { getMediaStore } from "@/lib/storage";
import { BringError, createBooking, decodeLabel, downloadLabel, type BookingResult } from "./client";
import { loadBringAccess } from "./config";
import { decryptBringSecret, encryptBringSecret } from "./crypto";
import { bringProductIds, bringProducts } from "./products";
import { readBringShipping } from "./state";
import { formatWeight } from "./weight";

// ---------- Det som lagres på ordren (orders.shipping) ----------

/** Lagres på ordren når kunden velger Bring i kassen: tjeneste, vekt, postnummer og hvor prisen kom fra. */
export const orderBringSchema = z.object({
  product: z.enum(bringProductIds),
  weightGrams: z.number().int().nullable(),
  toPostalCode: z.string(),
  /** Hentestedet kunden valgte i kassen (bare Pakke til hentested). Mangler det, velger Bring nærmeste. */
  pickupPoint: z
    .object({ id: z.string(), name: z.string(), address: z.string(), postalCode: z.string(), city: z.string() })
    .optional(),
  /** bring: pris fra Bring. reserve: butikkens reservepris. gratis: butikkens regel om gratis frakt. */
  price: z.enum(["bring", "reserve", "gratis"]),
  reason: z.enum(["vekt", "bring"]).nullable().default(null),
});
export type OrderBring = z.infer<typeof orderBringSchema>;

/** Bestillingen hos Bring, lagret på ordren under shipping.bringBooking. */
const bookingSchema = z.object({
  consignmentNumber: z.string().min(1),
  packageNumbers: z.array(z.string()).default([]),
  product: z.enum(bringProductIds),
  weightGrams: z.number().int(),
  test: z.boolean(),
  bookedAt: z.string(),
  /** Nøkkelen til PDF-en i lageret, eller null hvis den ikke er hentet ennå. */
  labelKey: z.string().nullable().default(null),
  /** Adressen til etiketten hos Bring, kryptert. Brukes bare til å hente etiketten på nytt, og vises aldri. */
  labelRef: z.string().nullable().default(null),
});
export type BringBooking = z.infer<typeof bookingSchema>;

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

export function readOrderBring(shipping: unknown): OrderBring | null {
  const parsed = orderBringSchema.safeParse(record(shipping).bring);
  return parsed.success ? parsed.data : null;
}

export function readBringBooking(shipping: unknown): BringBooking | null {
  const parsed = bookingSchema.safeParse(record(shipping).bringBooking);
  return parsed.success ? parsed.data : null;
}

/** Det studioet trenger om bestillingen. Aldri adressen til etiketten hos Bring. */
export type BringBookingView = Omit<BringBooking, "labelRef" | "labelKey"> & { hasLabel: boolean };

export function bringBookingView(shipping: unknown): BringBookingView | null {
  const booking = readBringBooking(shipping);
  if (!booking) return null;
  const { labelRef, labelKey, ...rest } = booking;
  return { ...rest, hasLabel: Boolean(labelKey || labelRef) };
}

export const labelStorageKey = (siteId: string, orderId: string) => `fraktetiketter/${siteId}/${orderId}.pdf`;
const labelContext = (siteId: string, orderId: string) => `nettgata-bring-etikett:${siteId}:${orderId}`;

// ---------- Bestilling ----------

export const bookingInputSchema = z.object({
  product: z.enum(bringProductIds, { error: "Velg en Bring-tjeneste" }),
  weightGrams: z
    .number({ error: "Skriv vekten i hele gram" })
    .int("Skriv vekten i hele gram")
    .min(1, "Skriv hvor mye pakken veier, i gram")
    .max(35_000, "Pakken kan veie maks 35 kg"),
  /** Målene på akkurat denne pakken. Uten dem brukes butikkens vanlige pakkestørrelse, ellers en standard for tjenesten. */
  packageCm: z
    .object({
      length: z.number({ error: "Skriv pakkens mål i hele centimeter" }).int("Skriv pakkens mål i hele centimeter").min(1, "Målene må være minst 1 cm").max(300, "Målene kan være maks 300 cm"),
      width: z.number({ error: "Skriv pakkens mål i hele centimeter" }).int("Skriv pakkens mål i hele centimeter").min(1, "Målene må være minst 1 cm").max(300, "Målene kan være maks 300 cm"),
      height: z.number({ error: "Skriv pakkens mål i hele centimeter" }).int("Skriv pakkens mål i hele centimeter").min(1, "Målene må være minst 1 cm").max(300, "Målene kan være maks 300 cm"),
    })
    .optional(),
});
export type BookingInputValues = z.input<typeof bookingInputSchema>;

/** Etter to minutter regnes en bestilling som ikke ble ferdig, som avbrutt, og den kan prøves på nytt. */
const STALE_CLAIM_MS = 2 * 60_000;

export type BookingOutcome = { booking: BringBookingView; labelError: string | null; trackingSaved: boolean };

/**
 * Bestiller sendingen hos Bring for en betalt ordre, henter etiketten og lagrer sporingsnummeret.
 * I testmiljøet bestilles det med X-Bring-Test-Indicator, så Bring verken henter pakken eller fakturerer.
 * Ordren holdes av før kallet, så to klikk aldri gir to sendinger.
 */
export async function bookBringShipment(
  db: Db,
  siteId: string,
  orderId: string,
  input: unknown,
  userId: string,
  now = new Date(),
): Promise<BookingOutcome> {
  const parsed = bookingInputSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const { product, weightGrams } = parsed.data;
  const max = bringProducts[product].maxWeightGrams;
  if (weightGrams > max) throw new ShopError(`${bringProducts[product].name} kan veie maks ${formatWeight(max)}. Velg en annen tjeneste.`);

  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk"))).limit(1);
  if (!site) throw new ShopError("Fant ikke nettbutikken");
  const access = await loadBringAccess(site);
  if (!access) throw new ShopError("Bring er ikke koblet til. Koble til Bring under Innstillinger, Frakt med Bring.");
  const shipping = readBringShipping(site.shop);
  if (!shipping) throw new ShopError("Fyll inn avsenderadressen under Frakt med Bring før du lager etiketter.");

  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, site.id))).limit(1);
  if (!order) throw new ShopError("Fant ikke ordren");
  if (!order.shippingAddress) throw new ShopError("Ordren har ingen leveringsadresse, så den skal ikke sendes.");
  if (order.status !== "paid" && order.status !== "fulfilled") {
    throw new ShopError(order.status === "pending_payment" ? "Fraktetikett kan lages når ordren er betalt." : "Ordren er kansellert eller refundert.");
  }
  if (readBringBooking(order.shipping)) throw new ShopError("Etiketten er allerede laget for denne ordren.");

  // Hold av ordren i én SQL-setning. En bestilling som ikke ble ferdig for over to minutter siden, kan prøves på nytt.
  const claimedAt = now.toISOString();
  const stale = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const claimed = await db
    .update(orders)
    .set({ shipping: sql`${orders.shipping} || jsonb_build_object('bringBooking', jsonb_build_object('pending', ${claimedAt}::text))` })
    .where(
      and(
        eq(orders.id, order.id),
        sql`(${orders.shipping} -> 'bringBooking' is null or (${orders.shipping} -> 'bringBooking' ->> 'consignmentNumber' is null and coalesce(${orders.shipping} -> 'bringBooking' ->> 'pending', '') < ${stale}))`,
      ),
    )
    .returning({ id: orders.id });
  if (claimed.length === 0) throw new ShopError("Etiketten lages akkurat nå, eller er allerede laget. Last siden på nytt.");
  const release = () =>
    db
      .update(orders)
      .set({ shipping: sql`${orders.shipping} - 'bringBooking'` })
      .where(and(eq(orders.id, order.id), sql`${orders.shipping} -> 'bringBooking' ->> 'pending' = ${claimedAt}`));

  const info = readSiteInfo(site.info);
  let result: BookingResult;
  try {
    result = await createBooking(access.credentials, access.environment, {
      orderNumber: order.number,
      recipient: {
        name: order.shippingAddress.name || order.customerName,
        street: order.shippingAddress.street,
        postalCode: order.shippingAddress.postalCode,
        city: order.shippingAddress.city,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      sender: { ...shipping.sender, email: info.email || null, phone: info.phone || null },
      product,
      customerNumber: access.customerNumber,
      weightGrams,
      // Bring avviser bestillingen uten mål eller volum (BOOK-INPUT-013), så det må alltid sendes med mål.
      packageCm: parsed.data.packageCm ?? shipping.packageCm ?? bringProducts[product].defaultPackageCm,
      shippingDateTime: now,
      pickupPointId: product === "5800" ? readOrderBring(order.shipping)?.pickupPoint?.id : null,
    });
  } catch (err) {
    await release();
    throw err;
  }

  // Etiketten lagres hos oss, så den kan lastes ned senere uten å spørre Bring. Feiler det, beholdes bestillingen,
  // og adressen hos Bring lagres kryptert, så etiketten kan hentes på nytt fra ordresiden.
  let labelKey: string | null = null;
  let labelError: string | null = null;
  try {
    const pdf = result.labelBase64 ? decodeLabel(result.labelBase64) : result.labelUrl ? await downloadLabel(access.credentials, result.labelUrl) : null;
    if (pdf) {
      labelKey = labelStorageKey(site.id, order.id);
      await (await getMediaStore()).put(labelKey, pdf, "application/pdf");
    } else {
      labelError = "Bring sendte ingen etikett. Finn den i Mybring.";
    }
  } catch (err) {
    labelKey = null;
    labelError = err instanceof BringError ? err.message : "Etiketten kunne ikke lagres.";
    if (!(err instanceof BringError)) console.error("Lagring av fraktetikett feilet", err instanceof Error ? err.name : "ukjent feil");
  }
  const labelRef = !labelKey && result.labelUrl ? await encryptBringSecret(result.labelUrl, labelContext(site.id, order.id)) : null;

  const booking: BringBooking = {
    consignmentNumber: result.consignmentNumber,
    packageNumbers: result.packageNumbers,
    product,
    weightGrams,
    test: access.environment === "test",
    bookedAt: now.toISOString(),
    labelKey,
    labelRef,
  };
  await db
    .update(orders)
    .set({ shipping: sql`${orders.shipping} || jsonb_build_object('bringBooking', ${JSON.stringify(booking)}::jsonb)` })
    .where(eq(orders.id, order.id));
  await db.insert(auditLog).values({
    siteId: site.id,
    userId,
    action: "bring.booked",
    detail: { orderId: order.id, consignmentNumber: result.consignmentNumber, product, test: booking.test },
  });

  // Sporingsnummeret er sendingsnummeret, samme som Bring bruker i sin egen sporingslenke.
  let trackingSaved = true;
  try {
    await setTracking(db, site.id, order.id, { carrier: "posten", number: result.consignmentNumber }, userId);
  } catch (err) {
    if (!(err instanceof ShopError)) throw err;
    trackingSaved = false;
  }
  return { booking: bringBookingView({ bringBooking: booking })!, labelError, trackingSaved };
}

// ---------- Etiketten ----------

/**
 * PDF-en for ordren. Ligger den ikke hos oss ennå, hentes den fra Bring og lagres.
 * Den som kaller, må ha sjekket at brukeren har tilgang til butikken.
 */
export async function bringLabelPdf(db: Db, siteId: string, orderId: string): Promise<{ body: ReadableStream | Uint8Array; filename: string } | null> {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  const booking = order ? readBringBooking(order.shipping) : null;
  if (!order || !booking) return null;
  const filename = `fraktetikett-ordre-${order.number}.pdf`;
  const store = await getMediaStore();
  if (booking.labelKey) {
    const stored = await store.get(booking.labelKey);
    if (stored) return { body: stored.body, filename };
  }
  if (!booking.labelRef) return null;

  const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const access = site ? await loadBringAccess(site) : null;
  if (!access) throw new ShopError("Bring er ikke koblet til, så etiketten kan ikke hentes. Finn den i Mybring.");
  const url = await decryptBringSecret(booking.labelRef, labelContext(siteId, orderId));
  const pdf = await downloadLabel(access.credentials, url);
  const key = labelStorageKey(siteId, orderId);
  await store.put(key, pdf, "application/pdf");
  await db
    .update(orders)
    .set({ shipping: sql`jsonb_set(${orders.shipping}, '{bringBooking,labelKey}', to_jsonb(${key}::text))` })
    .where(eq(orders.id, orderId));
  return { body: pdf, filename };
}
