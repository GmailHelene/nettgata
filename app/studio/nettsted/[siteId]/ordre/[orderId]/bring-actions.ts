"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { bookBringShipment } from "@/lib/bring/booking";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";
import type { ActionState } from "../../../../actions";

/**
 * «Lag fraktetikett hos Bring». Å pakke og sende ordre er vanlig arbeid, så alle med tilgang til butikken kan gjøre det,
 * som med «Marker som sendt». I testmodus blir det en testbestilling som Bring verken henter eller fakturerer.
 */
export async function createBringLabelAction(siteId: string, orderId: string, input: { product: string; weightGrams: number; packageCm?: { length: number; width: number; height: number } }): Promise<ActionState> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    if (site.kind !== "nettbutikk") throw new ShopError("Fraktetiketter gjelder bare nettbutikker");
    const db = await getDb();
    // Hver etikett er en bestilling hos Bring. Grensen stopper uhell, som mange klikk på rad.
    if (!(await hit(db, `bring-etikett:${site.id}`, { limit: 30, windowSeconds: 3600 }))) {
      throw new ShopError("Mange etiketter på kort tid. Vent litt og prøv igjen.");
    }
    const outcome = await bookBringShipment(db, site.id, orderId, input, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/ordre`, "layout");
    const parts = [
      outcome.booking.test ? "Testbestillingen er sendt til Bring. Bring henter ikke pakken og sender ingen faktura." : "Sendingen er bestilt hos Bring.",
      `Sendingsnummeret ${outcome.booking.consignmentNumber} er lagt inn som sporing.`,
    ];
    if (!outcome.trackingSaved) parts[1] = `Sendingsnummeret er ${outcome.booking.consignmentNumber}. Legg det inn under Sporing.`;
    if (outcome.labelError) parts.push(`Etiketten ble ikke hentet: ${outcome.labelError}`);
    return { ok: true, message: parts.join(" ") };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ShopError) return { ok: false, message: err.message };
    console.error("Fraktetikett hos Bring feilet", err instanceof Error ? err.name : "ukjent feil");
    return { ok: false, message: "Noe gikk galt. Sjekk i Mybring om sendingen ble bestilt før du prøver igjen." };
  }
}
