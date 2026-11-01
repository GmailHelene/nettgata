"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { bulkBookLabels, labelSelection, type BulkItem } from "@/lib/bring/bulk";
import { hit } from "@/lib/rate-limit";
import { requireSiteAccess } from "@/lib/session";
import { ShopError } from "@/lib/shop/catalog";

export type BulkLabelsState = {
  ok: boolean;
  message: string;
  booked: number;
  skipped: number;
  failed: number;
  /** Ordrene som ikke ble booket, med årsak. De som ble booket, trenger ingen forklaring. */
  problems: BulkItem[];
} | null;

export type BulkPrintState = {
  ok: boolean;
  message: string;
  /** Lenken til den samlede PDF-en. Null hvis ingen av de valgte ordrene har etikett. */
  url: string | null;
  count: number;
  skipped: { number: number | null; reason: string }[];
} | null;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * «Lag etiketter» for flere ordre. Samme tilgang som enkelt-etiketten: alle med tilgang til butikken kan gjøre det.
 * Nøklene til Bring brukes bare på serveren.
 */
export async function bulkCreateLabelsAction(siteId: string, orderIds: string[]): Promise<NonNullable<BulkLabelsState>> {
  const empty = { booked: 0, skipped: 0, failed: 0, problems: [] };
  try {
    const { site, user } = await requireSiteAccess(siteId);
    if (site.kind !== "nettbutikk") throw new ShopError("Fraktetiketter gjelder bare nettbutikker");
    const db = await getDb();
    // Hvert kall kan gi opptil 25 bestillinger hos Bring. Grensen stopper uhell, for eksempel mange klikk på rad.
    if (!(await hit(db, `bring-bulk:${site.id}`, { limit: 12, windowSeconds: 3600 }))) {
      throw new ShopError("Mange bulk-kjøringer på kort tid. Vent litt og prøv igjen.");
    }
    const result = await bulkBookLabels(db, site.id, orderIds, user.id);
    revalidatePath(`/studio/nettsted/${site.id}/ordre`, "layout");
    const message = `${plural(result.booked, "etikett ble booket", "etiketter ble booket")}, ${plural(result.skipped, "ordre ble hoppet over", "ordre ble hoppet over")} og ${plural(result.failed, "feilet", "feilet")}.`;
    return {
      ok: result.failed === 0,
      message,
      booked: result.booked,
      skipped: result.skipped,
      failed: result.failed,
      problems: result.items.filter((i) => i.status !== "booked" || i.reason),
    };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ShopError) return { ok: false, message: err.message, ...empty };
    console.error("Bulk-etiketter hos Bring feilet", err instanceof Error ? err.name : "ukjent feil");
    return { ok: false, message: "Noe gikk galt. Sjekk i Mybring om noen av sendingene ble bestilt før du prøver igjen.", ...empty };
  }
}

/**
 * «Skriv ut etiketter»: sier hvilke av de valgte ordrene som har etikett, og gir lenken til den samlede PDF-en.
 * Selve sammenslåingen skjer når lenken åpnes (ordre/etiketter), så dette kallet er raskt.
 */
export async function bulkPrintLabelsAction(siteId: string, orderIds: string[]): Promise<NonNullable<BulkPrintState>> {
  try {
    const { site } = await requireSiteAccess(siteId);
    if (site.kind !== "nettbutikk") throw new ShopError("Fraktetiketter gjelder bare nettbutikker");
    const selection = await labelSelection(await getDb(), site.id, orderIds);
    const skipped = selection.without.map((w) => ({ number: w.number, reason: w.reason }));
    const count = selection.withLabel.length;
    if (count === 0) {
      return { ok: false, message: "Ingen av de valgte ordrene har etikett ennå. Trykk «Lag etiketter» først.", url: null, count, skipped };
    }
    const ids = selection.withLabel.map((l) => l.orderId).join(",");
    return {
      ok: true,
      message: `${plural(count, "etikett er klar", "etiketter er klare")} til utskrift${skipped.length ? `. ${plural(skipped.length, "ordre hoppet over", "ordre hoppet over")}` : ""}.`,
      url: `/studio/nettsted/${site.id}/ordre/etiketter?ids=${ids}`,
      count,
      skipped,
    };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ShopError) return { ok: false, message: err.message, url: null, count: 0, skipped: [] };
    console.error("Utskrift av bulk-etiketter feilet", err instanceof Error ? err.name : "ukjent feil");
    return { ok: false, message: "Noe gikk galt. Prøv igjen.", url: null, count: 0, skipped: [] };
  }
}
