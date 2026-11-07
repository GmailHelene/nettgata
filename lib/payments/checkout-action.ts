"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { getPublishedPage } from "@/lib/publishing";
import { clientKey, hit } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { ShopError } from "@/lib/shop/catalog";
import { createOrder, type CheckoutInput } from "@/lib/shop/orders";
import { isOnlinePayment, readShopSettings } from "@/lib/shop/settings";
import { paymentOrigin, returnUrl, startPayment } from "./service";
import { hasCheckoutTerms } from "@/lib/legal/kundesider";
import { readyProviders, type ReadyProviders } from "./state";

async function shopSite(siteId: string) {
  if (typeof siteId !== "string" || !/^[0-9a-f-]{36}$/.test(siteId)) return null;
  const db = await getDb();
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk"))).limit(1);
  return site ? { db, site } : null;
}

export type OnlinePaymentResult = { ok: true; orderId: string; redirectUrl: string } | { ok: false; message: string };

/**
 * Kassen med Vipps eller Klarna: lagrer ordren (varene holdes av), starter betalingen og gir adressen kunden
 * skal sendes til. Ordrebekreftelsen sendes først når Vipps eller Klarna har bekreftet betalingen.
 * Samme kontroller som vanlige bestillinger (app/actions/shop.ts): grense per IP og publiserte kjøpsvilkår.
 */
export async function placeOrderWithOnlinePayment(siteId: string, input: CheckoutInput): Promise<OnlinePaymentResult> {
  const ctx = await shopSite(siteId);
  if (!ctx) return { ok: false, message: "Butikken er ikke tilgjengelig" };
  const { db, site } = ctx;
  if (!isOnlinePayment(String(input?.paymentMethod ?? ""))) return { ok: false, message: "Velg Vipps eller Klarna" };
  const settings = readShopSettings(site.shop);

  const h = await headers();
  if (!(await hit(db, `order-ip:${await clientKey(h, getSecret())}`, { limit: 10, windowSeconds: 600 }))) {
    return { ok: false, message: "Mange bestillinger på kort tid. Vent litt og prøv igjen." };
  }
  // Uten publiserte kjøpsvilkår kan butikken ikke ta imot bestillinger (angrerettloven og ehandelsloven).
  if (!(await hasCheckoutTerms(site, settings.termsPath, (p) => getPublishedPage(db, site.id, p)))) {
    return { ok: false, message: "Butikken tar ikke imot bestillinger akkurat nå. Prøv igjen senere." };
  }

  const proto = process.env.NODE_ENV === "production" ? "https" : (h.get("x-forwarded-proto") ?? "http");
  try {
    const origin = await paymentOrigin(db, site, h.get("host") ?? "", proto);
    const order = await createOrder(db, site.id, settings, input, { startsPayment: true });
    const redirectUrl = await startPayment(db, site, order, returnUrl(origin, order));
    return { ok: true, orderId: order.id, redirectUrl };
  } catch (err) {
    if (err instanceof ShopError) return { ok: false, message: err.message };
    console.error("Bestilling med betaling feilet", err instanceof Error ? err.message : "ukjent feil");
    return { ok: false, message: "Bestillingen kunne ikke fullføres. Ingenting er trukket. Prøv igjen." };
  }
}

/** Offentlig: hvilke av Vipps og Klarna kassen kan vise, og om de står i testmiljøet. Aldri noe om nøklene. */
export async function onlinePaymentInfo(siteId: string): Promise<ReadyProviders> {
  const ctx = await shopSite(siteId);
  return ctx ? readyProviders(ctx.site.shop) : {};
}
