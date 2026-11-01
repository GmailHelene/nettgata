"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { canConnectDomain, DOMAIN_NEEDS_SUBSCRIPTION } from "@/lib/billing/state";
import { addDomain, checkSiteDomains, displayHost, DomainError, dropApex, removeDomain, setPrimaryDomain } from "@/lib/domains";
import { getDomainServices } from "@/lib/domains/services";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import type { ActionState } from "./actions";

function toState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof DomainError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen om litt." };
}

/** `owner`: å koble til, endre eller fjerne et domene bestemmer hvor trafikken går, så det kan bare eieren. Å sjekke kan alle. */
async function context(siteId: string, { owner = false } = {}) {
  const { site, user, role } = await requireSiteAccess(siteId);
  if (owner && role !== "owner") throw new DomainError("Bare eieren av nettstedet kan koble til, endre eller fjerne domener.");
  const db = await getDb();
  const services = getDomainServices(db);
  if (!services) throw new DomainError("Kobling av eget domene er ikke slått på ennå");
  return { site, user, db, services };
}

const refresh = (siteId: string) => revalidatePath(`/studio/nettsted/${siteId}`, "layout");

export async function addDomainAction(siteId: string, input: string): Promise<ActionState> {
  try {
    const { site, user, db, services } = await context(siteId, { owner: true });
    // Nye domener bare for betalende abonnement (eller fakturert utenom Stripe). Plattformadmin kan alltid.
    // Domener som allerede er koblet til, kan fortsatt sjekkes, endres og fjernes.
    if (!canConnectDomain(site.billing, user.isPlatformAdmin)) return { ok: false, message: DOMAIN_NEEDS_SUBSCRIPTION };
    // Hvert domene teller i kvoten hos Cloudflare, så antall forsøk per nettsted er begrenset.
    if (!(await hit(db, `domain-add:${site.id}`, { limit: 10, windowSeconds: 3600 }))) {
      return { ok: false, message: "Mange forsøk på kort tid. Vent en time og prøv igjen." };
    }
    const root = await addDomain(db, services, site.id, input, user.id);
    // Første sjekk med en gang, så kunden ser hva som mangler.
    await checkSiteDomains(db, services, site.id).catch((err) => console.error("Første domenesjekk feilet", err));
    refresh(site.id);
    return { ok: true, message: `${displayHost(root)} er lagt til. Legg inn pekerne under hos domeneforhandleren din.` };
  } catch (err) {
    return toState(err);
  }
}

export async function checkDomainsAction(siteId: string): Promise<ActionState> {
  try {
    const { site, db, services } = await context(siteId);
    await checkSiteDomains(db, services, site.id);
    refresh(site.id);
    return { ok: true, message: "Sjekket nå" };
  } catch (err) {
    return toState(err);
  }
}

export async function removeDomainAction(siteId: string, domainId: string): Promise<ActionState> {
  try {
    const { site, user, db, services } = await context(siteId, { owner: true });
    await removeDomain(db, services, site.id, domainId, user.id);
    refresh(site.id);
    return { ok: true, message: "Domenet er fjernet. Nettstedet ligger fortsatt på gratisadressen." };
  } catch (err) {
    return toState(err);
  }
}

export async function dropApexAction(siteId: string, domainId: string): Promise<ActionState> {
  try {
    const { site, db, services } = await context(siteId, { owner: true });
    await dropApex(db, services, site.id, domainId);
    refresh(site.id);
    return { ok: true, message: "Greit. Vi venter bare på www, og videresendingen hos forhandleren tar seg av resten." };
  } catch (err) {
    return toState(err);
  }
}

export async function setPrimaryDomainAction(siteId: string, domainId: string): Promise<ActionState> {
  try {
    const { site, db } = await context(siteId, { owner: true });
    await setPrimaryDomain(db, site.id, domainId);
    refresh(site.id);
    return { ok: true, message: "Hovedadressen er endret. De andre adressene sender videre hit." };
  } catch (err) {
    return toState(err);
  }
}
