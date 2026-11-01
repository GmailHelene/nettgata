"use server";

import { ADDON_AVAILABLE } from "@/lib/billing/plans";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import type { ActionState } from "@/app/studio/actions";
import { BillingError, createPortalSession, NOT_READY, startCheckout } from "@/lib/billing/checkout";
import { readBilling } from "@/lib/billing/state";
import { getStripe } from "@/lib/billing/stripe";
import { setManualBilling } from "@/lib/billing/sync";
import { isPlatformHost } from "@/lib/hosts";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { platformUrl } from "@/lib/site-url";

const ONLY_OWNER = "Bare eieren av nettstedet kan endre abonnementet.";

function toState(err: unknown, isAdmin: boolean): ActionState {
  unstable_rethrow(err);
  if (err instanceof BillingError) {
    return { ok: false, message: isAdmin && err.adminDetail ? `${err.message}\n\nFor plattformadmin:\n${err.adminDetail}` : err.message };
  }
  console.error("Abonnement feilet", err);
  const detail = err instanceof Error ? err.message : String(err);
  return { ok: false, message: isAdmin ? `Noe gikk galt hos Stripe: ${detail}` : "Noe gikk galt. Prøv igjen om litt." };
}

/** Kunden kommer tilbake til samme adresse som studioet ble åpnet på, ellers mister de innloggingen. */
async function baseUrl(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  if (!host || !isPlatformHost(host)) return platformUrl();
  return `${process.env.NODE_ENV === "production" ? "https" : "http"}://${host}`;
}

const choiceSchema = z.object({ interval: z.enum(["month", "year"]), addon: z.boolean(), setup: z.boolean() });

/** Sender kunden til Stripe Checkout. Prisene hentes fra Stripe og sjekkes mot vedtatte priser først. */
export async function startCheckoutAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { site, user, role } = await requireSiteAccess(siteId);
  if (role !== "owner") return { ok: false, message: ONLY_OWNER };
  const stripe = getStripe();
  if (!stripe) return { ok: false, message: NOT_READY };
  const choice = choiceSchema.safeParse({
    interval: formData.get("interval"),
    // Tillegget kan ikke bestilles før det er lansert, selv om noen sender feltet likevel.
    addon: ADDON_AVAILABLE && formData.get("addon") === "on",
    setup: formData.get("setup") === "on",
  });
  if (!choice.success) return { ok: false, message: "Velg månedlig eller årlig betaling." };

  let url: string;
  try {
    const db = await getDb();
    if (!(await hit(db, `checkout:${site.id}`, { limit: 10, windowSeconds: 3600 }))) {
      return { ok: false, message: "Mange forsøk på kort tid. Vent litt og prøv igjen." };
    }
    url = await startCheckout(db, stripe, { site, user, choice: choice.data, baseUrl: await baseUrl() });
  } catch (err) {
    return toState(err, user.isPlatformAdmin);
  }
  redirect(url);
}

/** Stripe sin kundeportal: bytte kort, se fakturaer og si opp. */
export async function openPortalAction(siteId: string): Promise<ActionState> {
  const { site, user, role } = await requireSiteAccess(siteId);
  if (role !== "owner") return { ok: false, message: ONLY_OWNER };
  const stripe = getStripe();
  if (!stripe) return { ok: false, message: NOT_READY };

  let url: string;
  try {
    url = await createPortalSession(stripe, readBilling(site.billing), `${await baseUrl()}/studio/nettsted/${site.id}/abonnement`);
  } catch (err) {
    return toState(err, user.isPlatformAdmin);
  }
  redirect(url);
}

const manualSchema = z.object({
  manual: z.boolean(),
  note: z.string().trim().max(200, "Notatet kan ha maks 200 tegn"),
});

/** Bare plattformadmin: kunder Helene fakturerer selv, utenom Stripe. */
export async function saveManualBillingAction(siteId: string, input: { manual: boolean; note: string }): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    if (!user.isPlatformAdmin) return { ok: false, message: "Bare plattformadmin kan endre dette." };
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    await setManualBilling(await getDb(), site.id, parsed.data, user.id);
    revalidatePath(`/studio/nettsted/${site.id}`, "layout");
    return {
      ok: true,
      message: parsed.data.manual
        ? "Lagret. Nettstedet regnes som betalende og kan koble til eget domene."
        : "Lagret. Nettstedet trenger nå et abonnement hos Stripe for å koble til nye domener.",
    };
  } catch (err) {
    return toState(err, false);
  }
}
