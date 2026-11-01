import type { Db } from "@/db";
import { auditLog } from "@/db/schema";
import { BillingError, resolvePrices, resolveTax } from "./checkout";
import { ADDON_AVAILABLE, PRICE_SPECS, type BillingInterval } from "./plans";
import { readBilling, type SiteBilling } from "./state";
import type { StripeClient, StripeSubscription } from "./stripe";
import { syncSubscription } from "./sync";

/**
 * Legge til eller fjerne AI-teamet på et abonnement som allerede løper. Stripe regner ut forholdsmessig pris
 * for resten av perioden, og den kommer på neste faktura. Tilstanden lagres som vanlig fra Stripe (syncSubscription).
 */

const ACTIVE = new Set(["active", "trialing"]);

function addonSpec(interval: BillingInterval) {
  return PRICE_SPECS.find((s) => s.role === "addon" && s.interval === interval)!;
}

function assertCanChange(billing: SiteBilling): asserts billing is SiteBilling & { stripeSubscriptionId: string; interval: BillingInterval } {
  if (billing.manual) throw new BillingError("Abonnementet faktureres utenom kortbetaling. Send en e-post til kontakt@helene.cloud for å endre tillegg.");
  if (!billing.stripeSubscriptionId || !billing.interval || !ACTIVE.has(billing.status)) {
    throw new BillingError("Tillegget kan bare legges til et aktivt abonnement. Velg et abonnement først.");
  }
}

export async function addAiAddon(db: Db, stripe: StripeClient, site: { id: string; billing: unknown }, userId: string) {
  if (!ADDON_AVAILABLE) throw new BillingError("Tillegget er ikke lansert ennå.");
  const billing = readBilling(site.billing);
  assertCanChange(billing);
  if (billing.addon) throw new BillingError("AI-teamet er allerede med i abonnementet.");

  const spec = addonSpec(billing.interval);
  const tax = await resolveTax(stripe);
  const price = (await resolvePrices(stripe, [spec], tax)).get(spec.lookupKey)!;
  await stripe.post<StripeSubscription>(
    `/v1/subscriptions/${encodeURIComponent(billing.stripeSubscriptionId)}`,
    {
      items: [{ price: price.id, quantity: 1, ...(tax.kind === "rate" ? { tax_rates: [tax.id] } : {}) }],
      proration_behavior: "create_prorations",
    },
    { idempotencyKey: `nettgata-tillegg-pa-${site.id}-${billing.stripeSubscriptionId}-${billing.syncedAt ?? "ny"}` },
  );
  await db.insert(auditLog).values({ siteId: site.id, userId, action: "billing.addon_added", detail: { interval: billing.interval } });
  await syncSubscription(db, stripe, billing.stripeSubscriptionId, { siteIdHint: site.id, eventType: "tillegg lagt til" });
}

export async function removeAiAddon(db: Db, stripe: StripeClient, site: { id: string; billing: unknown }, userId: string) {
  const billing = readBilling(site.billing);
  assertCanChange(billing);
  const sub = await stripe.get<StripeSubscription>(`/v1/subscriptions/${encodeURIComponent(billing.stripeSubscriptionId)}`);
  const item = sub.items.data.find((i) => i.price.lookup_key?.startsWith("nettgata_tillegg_ai_"));
  if (!item) throw new BillingError("AI-teamet er ikke med i abonnementet.");
  await stripe.post<StripeSubscription>(`/v1/subscriptions/${encodeURIComponent(sub.id)}`, {
    items: [{ id: item.id, deleted: true }],
    proration_behavior: "create_prorations",
  });
  await db.insert(auditLog).values({ siteId: site.id, userId, action: "billing.addon_removed", detail: {} });
  await syncSubscription(db, stripe, sub.id, { siteIdHint: site.id, eventType: "tillegg fjernet" });
}
