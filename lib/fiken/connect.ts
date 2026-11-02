import type { Db } from "@/db";
import { auditLog } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { completeFikenConnect, noCompaniesMessage } from "./config";
import {
  FikenAuthError,
  consumeFikenState,
  createFikenState,
  exchangeFikenCode,
  fikenAuthorizeUrl,
  fikenAvailableTo,
  fikenOAuthConfig,
  verifyFikenState,
} from "./oauth";

/**
 * «Koble til Fiken» fra start til slutt: adressen eieren sendes til i Fiken, og det som skjer når Fiken sender
 * eieren tilbake til /studio/fiken/callback. Tilgangen sjekkes i studiohandlingen før start og i ruten etterpå.
 */

export const fikenNotConfiguredMessage = "Fiken-appen er ikke satt opp på plattformen ennå. FIKEN_CLIENT_ID og FIKEN_CLIENT_SECRET mangler.";

/** Adressen i Fiken der eieren gir Nettgata tilgang. state er bundet til nettstedet og brukeren, og går ut etter ti minutter. */
export async function startFikenConnect(siteId: string, userId: string): Promise<string> {
  const config = fikenOAuthConfig();
  if (!config) throw new ShopError(fikenNotConfiguredMessage);
  return fikenAuthorizeUrl(config, await createFikenState(siteId, userId));
}

/** Hva eieren får se etter at Fiken har sendt dem tilbake. Kodene står i adressen, så ingen tekst fra Fiken havner der. */
export const fikenCallbackResults = ["koblet", "velg", "avbrutt", "utlopt", "ingen-tilgang", "ingen-selskap", "feil"] as const;
export type FikenCallbackResult = (typeof fikenCallbackResults)[number];

export const fikenCallbackMessages: Record<FikenCallbackResult, { ok: boolean; message: string }> = {
  koblet: { ok: true, message: "Fiken er koblet til. Sjekk kontoene under, og send ordrene når du er klar." },
  velg: { ok: true, message: "Du har flere selskaper i Fiken. Velg hvilket ordrene skal til." },
  avbrutt: { ok: false, message: "Du avbrøt i Fiken, så ingenting er koblet til." },
  utlopt: { ok: false, message: "Lenken til Fiken var gått ut eller allerede brukt. Trykk «Koble til Fiken» og prøv igjen." },
  "ingen-tilgang": { ok: false, message: "Bare eieren av butikken kan koble til Fiken. Logg inn som eieren og prøv igjen." },
  "ingen-selskap": { ok: false, message: "Brukeren du logget inn med i Fiken, har ikke tilgang til noen selskaper der." },
  feil: { ok: false, message: "Fiken-koblingen ble ikke fullført. Prøv igjen om litt." },
};

export type FikenCallbackInput = { code: string | null; state: string | null; error: string | null };
export type FikenCallbackUser = { id: string; isPlatformAdmin: boolean } | null;

/**
 * Tilbake fra Fiken. state må være signert av oss, ikke utløpt, laget for denne brukeren og ikke brukt før.
 * isOwner sjekker at brukeren fortsatt er eier av nettbutikken. siteId er null når vi ikke kan stole på state.
 */
export async function fikenCallback(
  db: Db,
  input: FikenCallbackInput,
  user: FikenCallbackUser,
  isOwner: (siteId: string) => Promise<boolean>,
  now = Date.now(),
): Promise<{ siteId: string | null; result: FikenCallbackResult }> {
  const payload = input.state ? await verifyFikenState(input.state, now) : null;
  if (!payload) return { siteId: null, result: "utlopt" };
  if (!user || user.id !== payload.userId) return { siteId: null, result: "ingen-tilgang" };
  const siteId = payload.siteId;
  if (!fikenAvailableTo(user) || !(await isOwner(siteId))) return { siteId, result: "ingen-tilgang" };
  if (!(await consumeFikenState(db, payload))) return { siteId, result: "utlopt" };
  if (input.error) {
    await db.insert(auditLog).values({ siteId, userId: user.id, action: "fiken.connect_cancelled", detail: { error: input.error.slice(0, 40) } });
    return { siteId, result: input.error === "access_denied" ? "avbrutt" : "feil" };
  }
  const config = fikenOAuthConfig();
  if (!input.code || input.code.length > 2000 || !config) return { siteId, result: "feil" };
  try {
    const tokens = await exchangeFikenCode(config, input.code, payload, input.state!, now);
    const result = await completeFikenConnect(db, siteId, tokens, user.id);
    return { siteId, result: result.status === "connected" ? "koblet" : "velg" };
  } catch (err) {
    if (err instanceof ShopError && err.message === noCompaniesMessage) return { siteId, result: "ingen-selskap" };
    if (!(err instanceof FikenAuthError) && !(err instanceof ShopError)) console.error("Fiken-tilkoblingen feilet", err instanceof Error ? err.name : "ukjent feil");
    await db.insert(auditLog).values({ siteId, userId: user.id, action: "fiken.connect_failed", detail: { kind: err instanceof Error ? err.name : "ukjent" } });
    return { siteId, result: "feil" };
  }
}
