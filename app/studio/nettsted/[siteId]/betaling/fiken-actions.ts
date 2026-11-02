"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { chooseFikenCompany, removeFiken, saveFikenSettings, testFikenConnection } from "@/lib/fiken/config";
import { startFikenConnect } from "@/lib/fiken/connect";
import { fikenAvailableTo } from "@/lib/fiken/oauth";
import { describeSendResult, fikenPeriodKeys, sendOrdersToFiken, type FikenPeriodKey } from "@/lib/fiken/send";
import { fikenClosedMessage } from "@/lib/fiken/state";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";
import type { ActionState } from "../../../actions";

/**
 * Tilgangen gir lesing og skriving i regnskapet, og sendte ordre blir bilag i Fiken. Derfor kan bare eieren av butikken
 * (og plattformadmin) koble til, endre og sende. Hvert trykk er kall til Fiken, så grensene stopper gjetting og uhell.
 */
async function fikenOwnerAccess(siteId: string, kind: "oppsett" | "sending") {
  const { site, user, role } = await requireSiteAccess(siteId);
  if (site.kind !== "nettbutikk") throw new ShopError("Fiken-koblingen gjelder bare nettbutikker");
  if (role !== "owner") throw new ShopError("Bare eieren av butikken kan koble til Fiken og sende ordre dit.");
  if (!fikenAvailableTo(user)) throw new ShopError(fikenClosedMessage);
  const db = await getDb();
  const rule = kind === "sending" ? { limit: 30, windowSeconds: 3600 } : { limit: 20, windowSeconds: 3600 };
  if (!(await hit(db, `fiken-${kind}:${site.id}`, rule))) throw new ShopError("Mange forsøk på kort tid. Vent litt og prøv igjen.");
  return { site, user, db };
}

/** Meldingen fra feil som ikke er våre egne, logges uten innhold, siden den kan inneholde nøkler. */
function toState(err: unknown): { ok: false; message: string } {
  unstable_rethrow(err);
  if (err instanceof ShopError) return { ok: false, message: err.message };
  console.error("Fiken-koblingen feilet", err instanceof Error ? err.name : "ukjent feil");
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

const refresh = (siteId: string) => revalidatePath(`/studio/nettsted/${siteId}`, "layout");

export type FikenStartState = { ok: boolean; message: string; url?: string };

/** «Koble til Fiken»: gir adressen i Fiken der eieren gir tilgang. Nettleseren sendes dit, og Fiken sender eieren tilbake hit. */
export async function startFikenConnectAction(siteId: string): Promise<FikenStartState> {
  try {
    const { site, user } = await fikenOwnerAccess(siteId, "oppsett");
    return { ok: true, message: "Sender deg til Fiken...", url: await startFikenConnect(site.id, user.id) };
  } catch (err) {
    return toState(err);
  }
}

/** Eieren har flere selskaper i Fiken og velger hvilket ordrene skal til. */
export async function chooseFikenCompanyAction(siteId: string, companySlug: string): Promise<ActionState> {
  try {
    const { site, user, db } = await fikenOwnerAccess(siteId, "oppsett");
    const company = await chooseFikenCompany(db, site.id, companySlug, user.id);
    refresh(site.id);
    return { ok: true, message: `Koblet til ${company.name} i Fiken. Sjekk kontoene under, og send ordrene når du er klar.` };
  } catch (err) {
    return toState(err);
  }
}

export async function testFikenAction(siteId: string): Promise<ActionState> {
  try {
    const { site, user, db } = await fikenOwnerAccess(siteId, "oppsett");
    const test = await testFikenConnection(db, site.id, user.id);
    refresh(site.id);
    return test;
  } catch (err) {
    return toState(err);
  }
}

export async function saveFikenSettingsAction(siteId: string, settings: unknown): Promise<ActionState> {
  try {
    const { site, user, db } = await fikenOwnerAccess(siteId, "oppsett");
    await saveFikenSettings(db, site.id, settings, user.id);
    refresh(site.id);
    return { ok: true, message: "Valgene er lagret." };
  } catch (err) {
    return toState(err);
  }
}

export async function disconnectFikenAction(siteId: string): Promise<ActionState> {
  try {
    const { site, user, db } = await fikenOwnerAccess(siteId, "oppsett");
    const { revoked } = await removeFiken(db, site.id, user.id);
    refresh(site.id);
    return {
      ok: true,
      message: revoked
        ? "Fiken er koblet fra, og Nettgata har ikke lenger tilgang til regnskapet ditt. Ordre som allerede er sendt, blir liggende i Fiken."
        : "Fiken er koblet fra Nettgata. Fiken svarte ikke, så fjern gjerne Nettgata under Rediger konto, Sikkerhet, Apper du har gitt tilgang til i Fiken. Ordre som allerede er sendt, blir liggende i Fiken.",
    };
  } catch (err) {
    return toState(err);
  }
}

export async function sendOrdersToFikenAction(siteId: string, period: FikenPeriodKey): Promise<ActionState> {
  try {
    if (!fikenPeriodKeys.includes(period)) throw new ShopError("Velg denne eller forrige måned");
    const { site, user, db } = await fikenOwnerAccess(siteId, "sending");
    const result = await sendOrdersToFiken(db, site.id, period, user.id);
    refresh(site.id);
    return describeSendResult(result);
  } catch (err) {
    return toState(err);
  }
}
