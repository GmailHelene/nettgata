import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { bookings, sites } from "@/db/schema";
import { deliver, type EmailProvider } from "@/lib/email/send";
import {
  bookingCancelledEmail,
  bookingCancelledNoticeEmail,
  bookingConfirmationEmail,
  newBookingEmail,
  type BookingMailData,
  type ShopInfo,
} from "@/lib/email/templates";
import { notifyAddress, readNotificationSettings } from "@/lib/notifications";
import { readSiteInfo } from "@/lib/site-info";
import { platformUrl, publicSiteUrl } from "@/lib/site-url";
import { formatBookingTime } from "./format";
import { readBookingSettings } from "./settings";
import { cancelDeadline } from "./store";

/** Stien på kundens nettsted der lenken i e-posten avbestiller timen. */
export const CANCEL_PATH = "/timebestilling/avbestill";

async function load(db: Db, bookingId: string) {
  const [row] = await db.select({ booking: bookings, site: sites }).from(bookings).innerJoin(sites, eq(bookings.siteId, sites.id)).where(eq(bookings.id, bookingId)).limit(1);
  return row ?? null;
}

function shopInfo(site: typeof sites.$inferSelect): ShopInfo {
  const info = readSiteInfo(site.info);
  return { name: site.name, email: info.email, phone: info.phone, street: info.street, postalCode: info.postalCode, city: info.city, orgnr: info.orgnr };
}

function mailData(b: typeof bookings.$inferSelect): BookingMailData {
  return {
    serviceName: b.serviceName,
    staffName: b.staffName,
    when: formatBookingTime(b.startsAt),
    durationMinutes: Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000),
    priceOre: b.priceOre,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    message: b.message,
  };
}

const studioUrl = (siteId: string) => `${platformUrl()}/studio/nettsted/${siteId}/booking`;

/** Bekreftelse til kunden (alltid) og varsel til bedriften (hvis slått på). token er nøkkelen i avbestillingslenken. */
export async function notifyBookingCreated(db: Db, provider: EmailProvider, bookingId: string, token: string) {
  const loaded = await load(db, bookingId);
  if (!loaded) return;
  const { booking, site } = loaded;
  const shop = shopInfo(site);
  const settings = readBookingSettings(site.booking);
  const data = mailData(booking);
  const base = await publicSiteUrl(db, site);
  const confirmation = bookingConfirmationEmail({
    shop,
    booking: data,
    cancelUrl: `${base}${CANCEL_PATH}?t=${encodeURIComponent(token)}`,
    cancelDeadline: formatBookingTime(cancelDeadline(booking.startsAt, settings)),
  });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "bookingbekreftelse", bookingId: booking.id },
    {
      ...confirmation,
      to: { email: booking.customerEmail, name: booking.customerName },
      fromName: shop.name,
      ...(shop.email && { replyTo: { email: shop.email, name: shop.name } }),
      tags: ["bookingbekreftelse"],
    },
  );
  const owner = notifyAddress(readNotificationSettings(site.notifications), shop.email);
  if (!settings.notifyBusiness || !owner) return;
  const notice = newBookingEmail({ shop, booking: data, studioUrl: studioUrl(site.id) });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "ny-booking", bookingId: booking.id },
    { ...notice, to: { email: owner }, fromName: "Nettgata", replyTo: { email: booking.customerEmail, name: booking.customerName }, tags: ["ny-booking"] },
  );
}

/** Beskjed til kunden om at timen er avbestilt, og til bedriften når det var kunden som avbestilte. */
export async function notifyBookingCancelled(db: Db, provider: EmailProvider, bookingId: string) {
  const loaded = await load(db, bookingId);
  if (!loaded || loaded.booking.status !== "avbestilt") return;
  const { booking, site } = loaded;
  const shop = shopInfo(site);
  const data = mailData(booking);
  const byBusiness = booking.cancelledBy === "bedrift";
  const email = bookingCancelledEmail({ shop, booking: data, byBusiness, siteUrl: await publicSiteUrl(db, site) });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "booking-avbestilt", bookingId: booking.id },
    {
      ...email,
      to: { email: booking.customerEmail, name: booking.customerName },
      fromName: shop.name,
      ...(shop.email && { replyTo: { email: shop.email, name: shop.name } }),
      tags: ["booking-avbestilt"],
    },
  );
  const owner = notifyAddress(readNotificationSettings(site.notifications), shop.email);
  if (byBusiness || !readBookingSettings(site.booking).notifyBusiness || !owner) return;
  const notice = bookingCancelledNoticeEmail({ shop, booking: data, studioUrl: studioUrl(site.id) });
  await deliver(
    db,
    provider,
    { siteId: site.id, kind: "booking-avbestilt-varsel", bookingId: booking.id },
    { ...notice, to: { email: owner }, fromName: "Nettgata", replyTo: { email: booking.customerEmail, name: booking.customerName }, tags: ["booking-avbestilt"] },
  );
}
