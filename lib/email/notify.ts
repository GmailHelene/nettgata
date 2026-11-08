import { count, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { inquiries, inquiryImages, orderLines, orderRefunds, orders, sites } from "@/db/schema";
import { notifyAddress, readNotificationSettings } from "@/lib/notifications";
import { readShopSettings } from "@/lib/shop/settings";
import { trackingUrl } from "@/lib/shop/tracking";
import { readSiteInfo } from "@/lib/site-info";
import { readAnswers } from "@/lib/content/form-fields";
import { ordrebekreftelseTekster } from "@/lib/legal/angrerett";
import { platformUrl, publicSiteUrl } from "@/lib/site-url";
import { deliver, type EmailProvider } from "./send";
import { newInquiryEmail, newOrderEmail, orderConfirmationEmail, orderShippedEmail, refundEmail, withdrawalNoticeEmail, withdrawalReceiptEmail, type OrderData, type ShopInfo } from "./templates";

function shopInfo(site: typeof sites.$inferSelect): ShopInfo {
  const info = readSiteInfo(site.info);
  return { name: site.name, email: info.email, phone: info.phone, street: info.street, postalCode: info.postalCode, city: info.city, orgnr: info.orgnr };
}

function orderData(o: typeof orders.$inferSelect): OrderData {
  return {
    number: o.number,
    status: o.status,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    paymentMethod: o.paymentMethod,
    shippingName: o.shipping.name,
    shippingAddress: o.shippingAddress,
    subtotalOre: o.subtotalOre,
    discountOre: o.discountOre,
    discountCode: o.discountCode,
    shippingOre: o.shippingOre,
    totalOre: o.totalOre,
    vatOre: o.vatOre,
    note: o.note,
    trackingCarrier: o.trackingCarrier,
    trackingNumber: o.trackingNumber,
  };
}

async function loadOrder(db: Db, orderId: string) {
  const [row] = await db.select({ order: orders, site: sites }).from(orders).innerJoin(sites, eq(orders.siteId, sites.id)).where(eq(orders.id, orderId)).limit(1);
  return row ?? null;
}

/** Ordrebekreftelse til kunden (alltid) og varsel til butikken (hvis slått på). */
export async function notifyOrderPlaced(db: Db, provider: EmailProvider, orderId: string) {
  const loaded = await loadOrder(db, orderId);
  if (!loaded) return;
  const { order, site } = loaded;
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const shop = shopInfo(site);
  const base = await publicSiteUrl(db, site);
  const settings = readNotificationSettings(site.notifications);
  const data = orderData(order);
  const lineData = lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, totalOre: l.totalOre }));

  const confirmation = orderConfirmationEmail({
    shop,
    order: data,
    lines: lineData,
    orderUrl: `${base}/ordre/${order.id}?t=${order.accessToken}`,
    termsUrl: `${base}${readShopSettings(site.shop).termsPath}`,
    angrerett: ordrebekreftelseTekster({ butikk: { navn: site.name, info: readSiteInfo(site.info), mva: readSiteInfo(site.info).mvaRegistrert } }),
  });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "ordrebekreftelse", orderId: order.id },
    {
      ...confirmation,
      to: { email: order.customerEmail, name: order.customerName },
      fromName: shop.name,
      ...(shop.email && { replyTo: { email: shop.email, name: shop.name } }),
      tags: ["ordrebekreftelse"],
    },
  );

  const owner = notifyAddress(settings, shop.email);
  if (settings.newOrder && owner) {
    const notice = newOrderEmail({
      shop,
      order: data,
      lines: lineData,
      studioUrl: `${platformUrl()}/studio/nettsted/${site.id}/ordre/${order.id}`,
      shippedNotice: settings.shipped,
    });
    await deliver(
      db,
      provider,
      { siteId: site.id, kind: "ny-ordre", orderId: order.id },
      { ...notice, to: { email: owner }, fromName: "Nettgata", replyTo: { email: order.customerEmail, name: order.customerName }, tags: ["ny-ordre"] },
    );
  }
}

/** «Pakken er på vei» til kunden. Gjelder bare ordre som sendes, ikke de som hentes. */
export async function notifyOrderShipped(db: Db, provider: EmailProvider, orderId: string) {
  const loaded = await loadOrder(db, orderId);
  if (!loaded) return;
  const { order, site } = loaded;
  if (!order.shippingAddress || order.status !== "fulfilled") return;
  if (!readNotificationSettings(site.notifications).shipped) return;
  const shop = shopInfo(site);
  const base = await publicSiteUrl(db, site);
  const email = orderShippedEmail({
    shop,
    order: orderData(order),
    orderUrl: `${base}/ordre/${order.id}?t=${order.accessToken}`,
    trackingUrl: trackingUrl(order.trackingCarrier, order.trackingNumber),
  });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "sendt", orderId: order.id },
    {
      ...email,
      to: { email: order.customerEmail, name: order.customerName },
      fromName: shop.name,
      ...(shop.email && { replyTo: { email: shop.email, name: shop.name } }),
      tags: ["sendt"],
    },
  );
}

/**
 * «Du får penger tilbake» til kunden. Med refundId gjelder den én delvis refusjon, uten gjelder den hele ordren
 * (statusen er «refundert»). Sendes bare når eieren har latt valget «Send e-post til kunden» stå på.
 */
export async function notifyRefund(db: Db, provider: EmailProvider, orderId: string, refundId: string | null) {
  const loaded = await loadOrder(db, orderId);
  if (!loaded) return;
  const { order, site } = loaded;
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  let items: { name: string; variantLabel: string | null; quantity: number }[];
  let amountOre: number;
  let shipping: boolean;
  let message: string | null = null;
  if (refundId) {
    const [refund] = await db.select().from(orderRefunds).where(eq(orderRefunds.id, refundId)).limit(1);
    if (!refund || refund.orderId !== order.id || refund.status !== "ferdig" || !refund.notifyCustomer) return;
    items = refund.lines.flatMap((r) => {
      const line = lines.find((l) => l.id === r.lineId);
      return line ? [{ name: line.name, variantLabel: line.variantLabel, quantity: r.quantity }] : [];
    });
    amountOre = refund.amountOre;
    shipping = refund.shippingOre > 0;
    message = refund.reason;
  } else {
    if (order.status !== "refunded") return;
    // Etter delvise refusjoner gjelder e-posten bare det som var igjen.
    const done = (await db.select().from(orderRefunds).where(eq(orderRefunds.orderId, order.id))).filter((r) => r.status === "ferdig");
    const left = (id: string, q: number) => q - done.flatMap((r) => r.lines).filter((r) => r.lineId === id).reduce((sum, r) => sum + r.quantity, 0);
    items = lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: left(l.id, l.quantity) })).filter((i) => i.quantity > 0);
    amountOre = order.totalOre - order.refundedOre;
    shipping = order.shippingOre > 0 && !done.some((r) => r.shippingOre > 0);
  }
  const shop = shopInfo(site);
  const base = await publicSiteUrl(db, site);
  const email = refundEmail({
    shop,
    order: orderData(order),
    orderUrl: `${base}/ordre/${order.id}?t=${order.accessToken}`,
    amountOre,
    items,
    shipping,
    full: !refundId,
    message,
  });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "refusjon", orderId: order.id },
    {
      ...email,
      to: { email: order.customerEmail, name: order.customerName },
      fromName: shop.name,
      ...(shop.email && { replyTo: { email: shop.email, name: shop.name } }),
      tags: ["refusjon"],
    },
  );
}

/** Varsel til bedriften om en ny melding fra kontaktskjemaet. Svar går rett til den som skrev. */
export async function notifyInquiry(db: Db, provider: EmailProvider, inquiryId: string) {
  const [row] = await db
    .select({ inquiry: inquiries, site: sites })
    .from(inquiries)
    .innerJoin(sites, eq(inquiries.siteId, sites.id))
    .where(eq(inquiries.id, inquiryId))
    .limit(1);
  if (!row) return;
  const { inquiry, site } = row;
  const settings = readNotificationSettings(site.notifications);
  const shop = shopInfo(site);
  const owner = notifyAddress(settings, shop.email);
  if (!settings.newInquiry || !owner) return;
  const [{ imageCount }] = await db.select({ imageCount: count() }).from(inquiryImages).where(eq(inquiryImages.inquiryId, inquiry.id));
  const email = newInquiryEmail({
    shop,
    inquiry: { name: inquiry.name, email: inquiry.email, phone: inquiry.phone, message: inquiry.message, pagePath: inquiry.pagePath, answers: readAnswers(inquiry.answers) },
    siteUrl: await publicSiteUrl(db, site),
    studioUrl: `${platformUrl()}/studio/nettsted/${site.id}/henvendelser`,
    imageCount,
  });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "ny-henvendelse", inquiryId: inquiry.id },
    {
      ...email,
      to: { email: owner },
      fromName: "Nettgata",
      ...(inquiry.email && { replyTo: { email: inquiry.email, name: inquiry.name } }),
      tags: ["ny-henvendelse"],
    },
  );
}

/**
 * Kvittering til kunden og varsel til butikken når angrefunksjonen er brukt (angrerettloven § 20 a).
 * Varselet sendes uansett varslingsinnstillinger, fordi fristen for å betale tilbake løper fra meldingen.
 * Svarer sant bare hvis kvitteringen faktisk er sendt, så siden kan si fra til kunden hvis den ikke er det.
 */
export async function notifyWithdrawal(
  db: Db,
  provider: EmailProvider,
  input: { site: typeof sites.$inferSelect; inquiryId: string; name: string; email: string; about: string; at: string },
): Promise<boolean> {
  const { site, inquiryId, name, email, about, at } = input;
  const shop = shopInfo(site);
  const receipt = withdrawalReceiptEmail({ shop, name, email, about, at, returnInfoUrl: `${await publicSiteUrl(db, site)}/angrerett` });
  const sent = await deliver(
    db,
    provider,
    { siteId: site.id, kind: "angre-kvittering", inquiryId },
    { ...receipt, to: { email, name }, fromName: shop.name, ...(shop.email && { replyTo: { email: shop.email, name: shop.name } }), tags: ["angre-kvittering"] },
  );
  const owner = notifyAddress(readNotificationSettings(site.notifications), shop.email);
  if (owner) {
    const notice = withdrawalNoticeEmail({ name, email, about, at, studioUrl: `${platformUrl()}/studio/nettsted/${site.id}/henvendelser` });
    await deliver(
      db,
      provider,
      { siteId: site.id, kind: "angre-varsel", inquiryId },
      { ...notice, to: { email: owner }, fromName: "Nettgata", replyTo: { email, name }, tags: ["angre-varsel"] },
    );
  }
  return sent.status === "sendt";
}
