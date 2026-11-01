import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { inquiries, orderLines, orders, sites } from "@/db/schema";
import { notifyAddress, readNotificationSettings } from "@/lib/notifications";
import { readShopSettings } from "@/lib/shop/settings";
import { trackingUrl } from "@/lib/shop/tracking";
import { readSiteInfo } from "@/lib/site-info";
import { ordrebekreftelseTekster } from "@/lib/legal/angrerett";
import { platformUrl, publicSiteUrl } from "@/lib/site-url";
import { deliver, type EmailProvider } from "./send";
import { newInquiryEmail, newOrderEmail, orderConfirmationEmail, orderShippedEmail, type OrderData, type ShopInfo } from "./templates";

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
    angrerett: ordrebekreftelseTekster({ butikk: { navn: site.name, info: readSiteInfo(site.info) } }),
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
  const email = newInquiryEmail({
    shop,
    inquiry: { name: inquiry.name, email: inquiry.email, phone: inquiry.phone, message: inquiry.message, pagePath: inquiry.pagePath },
    siteUrl: await publicSiteUrl(db, site),
    studioUrl: `${platformUrl()}/studio/nettsted/${site.id}/henvendelser`,
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
