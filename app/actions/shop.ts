"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { notifyOrderPlaced } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { clientKey, hit, isLimited, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { getPublishedPage } from "@/lib/publishing";
import { ShopError } from "@/lib/shop/catalog";
import { assertUsable, describeDiscount, findDiscount, type Discount } from "@/lib/shop/discounts";
import { cartTotals, createOrder, priceLines, setOrderStatus, shippingFor, type CheckoutInput } from "@/lib/shop/orders";
import { availablePaymentMethods, paymentLabels, readShopSettings } from "@/lib/shop/settings";

const itemsSchema = z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).max(50);

async function shopSite(siteId: string) {
  if (!/^[0-9a-f-]{36}$/.test(siteId)) return null;
  const db = await getDb();
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk"))).limit(1);
  return site ? { db, site, settings: readShopSettings(site.shop) } : null;
}

/** Offentlig: gjeldende priser og valg for handlekurven. Viser aldri mer enn det kunden uansett ser i butikken. */
export async function getCheckoutData(siteId: string, items: unknown, shippingCode?: string, discountCode?: unknown) {
  const parsedItems = itemsSchema.safeParse(items);
  const ctx = await shopSite(siteId);
  if (!ctx || !parsedItems.success) return null;
  const lines = await priceLines(ctx.db, ctx.site.id, parsedItems.data);
  const subtotalOre = lines.reduce((sum, l) => sum + l.totalOre, 0);

  let discount: Discount | null = null;
  let discountError: string | null = null;
  const code = typeof discountCode === "string" ? discountCode.slice(0, 40).trim() : "";
  if (code) {
    // Bare koder som ikke finnes teller mot grensen. Slik stoppes gjetting uten å plage kunder som skriver feil én gang.
    const key = `discount-ip:${await clientKey(await headers(), getSecret())}`;
    if (await isLimited(ctx.db, key, rules.discountFailuresPerIp)) {
      discountError = "For mange forsøk med rabattkoder. Vent litt og prøv igjen.";
    } else {
      const found = await findDiscount(ctx.db, ctx.site.id, code);
      if (!found || !found.active) await hit(ctx.db, key, rules.discountFailuresPerIp);
      try {
        assertUsable(found, subtotalOre, new Date());
        discount = found;
      } catch (err) {
        if (!(err instanceof ShopError)) throw err;
        discountError = err.message;
      }
    }
  }

  const totals = cartTotals(ctx.settings, lines, shippingCode ?? ctx.settings.shippingOptions[0].code, discount);
  const freeShipping = discount?.kind === "free_shipping";
  return {
    lines: lines.map((l) => ({
      variantId: l.variantId,
      name: l.name,
      variantLabel: l.variantLabel,
      quantity: l.quantity,
      unitPriceOre: l.unitPriceOre,
      totalOre: l.totalOre,
      // Kunden får vite hvor mange som er igjen bare når det er færre enn i kurven.
      maxQuantity: l.stock === null ? 99 : Math.min(99, l.stock),
    })),
    shippingOptions: ctx.settings.shippingOptions.map((o) => ({
      ...o,
      priceOre: shippingFor(ctx.settings, o.code, totals.subtotalOre - totals.discountOre, freeShipping)?.priceOre ?? o.priceOre,
    })),
    freeShippingOverOre: ctx.settings.freeShippingOverOre,
    paymentMethods: availablePaymentMethods(ctx.settings).map((m) => ({ code: m, label: paymentLabels[m] })),
    termsPath: ctx.settings.termsPath,
    subtotalOre: totals.subtotalOre,
    discount: discount ? { code: discount.code, label: describeDiscount(discount), amountOre: totals.discountOre, freeShipping } : null,
    discountError,
    shippingOre: totals.shippingOre,
    totalOre: totals.totalOre,
    vatOre: totals.vatOre,
  };
}

export type PlaceOrderResult = { ok: true; orderId: string; token: string } | { ok: false; message: string };

export async function placeOrder(siteId: string, input: CheckoutInput): Promise<PlaceOrderResult> {
  const ctx = await shopSite(siteId);
  if (!ctx) return { ok: false, message: "Butikken er ikke tilgjengelig" };

  const ipKey = await clientKey(await headers(), getSecret());
  if (!(await hit(ctx.db, `order-ip:${ipKey}`, { limit: 10, windowSeconds: 600 }))) {
    return { ok: false, message: "Mange bestillinger på kort tid. Vent litt og prøv igjen." };
  }

  // Uten publiserte kjøpsvilkår kan butikken ikke ta imot bestillinger (angrerettloven og ehandelsloven).
  if (!(await getPublishedPage(ctx.db, ctx.site.id, ctx.settings.termsPath))) {
    return { ok: false, message: "Butikken tar ikke imot bestillinger akkurat nå. Prøv igjen senere." };
  }

  try {
    const order = await createOrder(ctx.db, ctx.site.id, ctx.settings, input);
    // Testbetaling finnes bare utenfor produksjon og markerer ordren som betalt med en gang.
    if (order.paymentMethod === "test") await setOrderStatus(ctx.db, ctx.site.id, order.id, "paid", null);
    // Ordrebekreftelsen sendes etter at kunden har fått svar, så kassen ikke venter på e-posten.
    after(() => notifyOrderPlaced(ctx.db, getEmailProvider(), order.id).catch((err) => console.error("Ordrevarsel feilet", err)));
    return { ok: true, orderId: order.id, token: order.accessToken };
  } catch (err) {
    if (err instanceof ShopError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: "Bestillingen kunne ikke fullføres. Ingenting er trukket. Prøv igjen." };
  }
}
