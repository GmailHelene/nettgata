"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { removeBringKeys, saveBringKeys, saveBringShipping, testBringConnection } from "@/lib/bring/config";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";
import type { ActionState } from "../../../../actions";

/**
 * Bring-oppsettet bestemmer fraktprisene i kassen og hvem som blir fakturert for sendingene.
 * Derfor kan bare eieren av butikken (og plattformadmin) endre det. Samme regel som for Vipps- og Klarna-nøklene.
 */
async function ownerAccess(siteId: string, opts: { callsBring: boolean }) {
  const { site, user, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") throw new ShopError("Frakt med Bring gjelder bare nettbutikker");
  if (role !== "owner") throw new ShopError("Bare eieren av butikken kan endre Bring-oppsettet.");
  const db = await getDb();
  // Hver test er et kall til Bring. Grensen stopper gjetting og uhell.
  if (opts.callsBring && !(await hit(db, `bring-oppsett:${site.id}`, { limit: 20, windowSeconds: 3600 }))) {
    throw new ShopError("Mange forsøk på kort tid. Vent litt og prøv igjen.");
  }
  return { site, user, db };
}

/** Meldingen fra feil som ikke er våre egne, logges uten innhold, siden skjemaet inneholder nøkler. */
function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof ShopError) return { ok: false, message: err.message };
  console.error("Bring-oppsettet feilet", err instanceof Error ? err.name : "ukjent feil");
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

const refresh = (siteId: string) => revalidatePath(`/studio/nettsted/${siteId}`, "layout");

/**
 * Lagrer nøklene kryptert og tester dem med en gang. Først når testen lykkes, vises Bring i kassen.
 * saved sier om nøklene ble lagret, så skjemaet kan tømmes (også når testen feilet).
 */
export async function saveBringKeysAction(siteId: string, input: Record<string, string>): Promise<{ ok: boolean; message: string; saved: boolean }> {
  let saved = false;
  try {
    const { site, user, db } = await ownerAccess(siteId, { callsBring: true });
    await saveBringKeys(db, site.id, input, user.id);
    saved = true;
    refresh(site.id);
    const test = await testBringConnection(db, site.id, user.id);
    return test.ok
      ? { ok: true, message: `Nøklene er lagret. ${test.message}`, saved }
      : { ok: false, message: `Nøklene er lagret, men testen feilet, så Bring vises ikke i kassen ennå. ${test.message}`, saved };
  } catch (err) {
    return { ...(toState(err) ?? { ok: false, message: "Noe gikk galt. Prøv igjen." }), saved };
  }
}

export async function testBringConnectionAction(siteId: string): Promise<ActionState> {
  try {
    const { site, user, db } = await ownerAccess(siteId, { callsBring: true });
    const test = await testBringConnection(db, site.id, user.id);
    refresh(site.id);
    return test.ok ? { ok: true, message: test.message } : { ok: false, message: `${test.message} Bring vises ikke i kassen før testen lykkes.` };
  } catch (err) {
    return toState(err);
  }
}

export async function removeBringKeysAction(siteId: string): Promise<ActionState> {
  try {
    const { site, user, db } = await ownerAccess(siteId, { callsBring: false });
    await removeBringKeys(db, site.id, user.id);
    refresh(site.id);
    return { ok: true, message: "Nøklene til Bring er fjernet, og Bring vises ikke lenger i kassen. Fraktvalgene dine er tatt vare på." };
  } catch (err) {
    return toState(err);
  }
}

export async function saveBringShippingAction(siteId: string, input: unknown): Promise<ActionState> {
  try {
    const { site, user, db } = await ownerAccess(siteId, { callsBring: false });
    const saved = await saveBringShipping(db, site.id, input, user.id);
    refresh(site.id);
    return {
      ok: true,
      message: saved.products.length
        ? "Fraktvalgene er lagret."
        : "Fraktvalgene er lagret. Ingen Bring-tjenester er valgt, så Bring vises ikke i kassen.",
    };
  } catch (err) {
    return toState(err);
  }
}
