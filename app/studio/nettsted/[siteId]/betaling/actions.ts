"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { isPlatformHost } from "@/lib/hosts";
import { platformUrl } from "@/lib/site-url";
import { disconnectStripe, removePaymentKeys, savePaymentKeys, startStripeOnboarding, testPaymentConnection } from "@/lib/payments/config";
import { keyProviders, providerNames, type KeyProvider } from "@/lib/payments/state";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";
import { availablePaymentMethods, readShopSettings } from "@/lib/shop/settings";
import type { ActionState } from "../../../actions";

/** Nøklene bestemmer hvor pengene går. Derfor kan bare eieren av butikken (og plattformadmin) endre dem. */
async function ownerAccess(siteId: string, provider: KeyProvider | "stripe") {
  if (provider !== "stripe" && !keyProviders.includes(provider)) throw new ShopError("Ukjent betalingsløsning");
  const { site, user, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") throw new ShopError("Betaling med Vipps og Klarna gjelder bare nettbutikker");
  if (role !== "owner") throw new ShopError("Bare eieren av butikken kan endre betalingsoppsettet.");
  const db = await getDb();
  // Hver test er et kall til Vipps eller Klarna. Grensen stopper gjetting og uhell.
  if (!(await hit(db, `betaling-oppsett:${site.id}`, { limit: 20, windowSeconds: 3600 }))) {
    throw new ShopError("Mange forsøk på kort tid. Vent litt og prøv igjen.");
  }
  return { site, user, db };
}

/** Meldingen fra feil som ikke er våre egne, logges uten innhold, siden skjemaet inneholder nøkler. */
function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof ShopError) return { ok: false, message: err.message };
  console.error("Betalingsoppsettet feilet", err instanceof Error ? err.name : "ukjent feil");
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

const refresh = (siteId: string) => revalidatePath(`/studio/nettsted/${siteId}`, "layout");

/**
 * Lagrer nøklene kryptert og tester dem med en gang. Først når testen lykkes, vises løsningen i kassen.
 * saved sier om nøklene ble lagret, så skjemaet kan tømmes (også når testen feilet).
 */
export async function savePaymentKeysAction(
  siteId: string,
  provider: KeyProvider,
  input: Record<string, string>,
): Promise<{ ok: boolean; message: string; saved: boolean }> {
  let saved = false;
  try {
    const { site, user, db } = await ownerAccess(siteId, provider);
    await savePaymentKeys(db, site.id, provider, input, user.id);
    saved = true;
    refresh(site.id);
    const test = await testPaymentConnection(db, site.id, provider, user.id);
    const name = providerNames[provider];
    return test.ok
      ? { ok: true, message: `Nøklene er lagret, og tilkoblingen virker. ${name} vises nå i kassen.`, saved }
      : { ok: false, message: `Nøklene er lagret, men testen feilet, så ${name} vises ikke i kassen ennå. ${test.message}`, saved };
  } catch (err) {
    return { ...(toState(err) ?? { ok: false, message: "Noe gikk galt. Prøv igjen." }), saved };
  }
}

export async function testPaymentConnectionAction(siteId: string, provider: KeyProvider): Promise<ActionState> {
  try {
    const { site, user, db } = await ownerAccess(siteId, provider);
    const test = await testPaymentConnection(db, site.id, provider, user.id);
    refresh(site.id);
    return test.ok
      ? { ok: true, message: `${test.message} ${providerNames[provider]} vises i kassen.` }
      : { ok: false, message: `${test.message} ${providerNames[provider]} vises ikke i kassen før testen lykkes.` };
  } catch (err) {
    return toState(err);
  }
}

export async function removePaymentKeysAction(siteId: string, provider: KeyProvider): Promise<ActionState> {
  try {
    const { site, user, db } = await ownerAccess(siteId, provider);
    await removePaymentKeys(db, site.id, provider, user.id);
    refresh(site.id);
    const [after] = await db.select({ shop: sites.shop }).from(sites).where(eq(sites.id, site.id)).limit(1);
    const left = availablePaymentMethods(readShopSettings(after?.shop));
    const name = providerNames[provider];
    return left.length
      ? { ok: true, message: `Nøklene til ${name} er fjernet, og ${name} vises ikke lenger i kassen.` }
      : { ok: true, message: `Nøklene til ${name} er fjernet. Kassen har ingen betalingsmåter nå, så velg minst én under Innstillinger.` };
  } catch (err) {
    return toState(err);
  }
}

/** Oppretter butikkens Stripe-konto første gang og gir lenken til Stripes registrering. */
export async function startStripeAction(siteId: string): Promise<{ ok: boolean; message: string; url?: string }> {
  try {
    const { site, user, db } = await ownerAccess(siteId, "stripe");
    const host = (await headers()).get("host") ?? "";
    const base = host && isPlatformHost(host) ? `${process.env.NODE_ENV === "production" ? "https" : "http"}://${host}` : platformUrl();
    const page = `${base}/studio/nettsted/${site.id}/betaling`;
    const url = await startStripeOnboarding(db, site, user, { returnUrl: `${page}?stripe=ferdig`, refreshUrl: `${page}?stripe=utlopt` });
    refresh(site.id);
    return { ok: true, message: "Sender deg til Stripe...", url };
  } catch (err) {
    return toState(err) ?? { ok: false, message: "Noe gikk galt. Prøv igjen." };
  }
}

export async function disconnectStripeAction(siteId: string): Promise<ActionState> {
  try {
    const { site, user, db } = await ownerAccess(siteId, "stripe");
    await disconnectStripe(db, site.id, user.id);
    refresh(site.id);
    return { ok: true, message: "Kort er tatt ut av kassen. Stripe-kontoen din er urørt." };
  } catch (err) {
    return toState(err);
  }
}
