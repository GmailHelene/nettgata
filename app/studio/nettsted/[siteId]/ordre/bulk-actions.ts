"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { notifyOrderShipped } from "@/lib/email/notify";
import { getEmailProvider } from "@/lib/email/send";
import { changeOrderStatus } from "@/lib/payments/service";
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

export type BulkFulfilState = {
  ok: boolean;
  message: string;
  done: number;
  problems: { orderId: string; number: number | null; reason: string }[];
} | null;

/**
 * «Marker som sendt» for flere betalte ordre. Samme regler som én og én: med Vipps, Klarna og Kustom trekkes beløpet
 * først, og feiler det, står ordren som før. Kunden får «Pakken er på vei» som vanlig. Alle med tilgang kan gjøre det.
 */
export async function bulkFulfilAction(siteId: string, orderIds: string[]): Promise<NonNullable<BulkFulfilState>> {
  try {
    const { site, user } = await requireSiteAccess(siteId);
    const db = await getDb();
    const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)))].slice(0, 25);
    const rows = ids.length
      ? await db
          .select({ id: orders.id, number: orders.number, status: orders.status })
          .from(orders)
          .where(and(eq(orders.siteId, site.id), inArray(orders.id, ids)))
      : [];
    let done = 0;
    const problems: NonNullable<BulkFulfilState>["problems"] = [];
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        problems.push({ orderId: id, number: null, reason: "Fant ikke ordren." });
        continue;
      }
      if (row.status !== "paid") continue;
      try {
        await changeOrderStatus(db, site.id, id, "fulfilled", user.id);
        after(() => notifyOrderShipped(db, getEmailProvider(), id).catch((err) => console.error("Sendt-varsel feilet", err)));
        done++;
      } catch (err) {
        unstable_rethrow(err);
        problems.push({ orderId: id, number: row.number, reason: err instanceof ShopError ? err.message : "Noe gikk galt. Prøv denne ordren alene." });
        if (!(err instanceof ShopError)) console.error("Marker som sendt feilet", id, err);
      }
    }
    revalidatePath(`/studio/nettsted/${site.id}/ordre`, "layout");
    const message = done
      ? `${plural(done, "ordre er", "ordre er")} markert som sendt.${problems.length ? ` ${plural(problems.length, "ordre", "ordre")} ble ikke endret.` : ""}`
      : problems.length
        ? "Ingen ordre ble endret."
        : "Ingen av de valgte ordrene er betalt og klare til sending.";
    return { ok: problems.length === 0 && done > 0, message, done, problems };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, message: err instanceof ShopError ? err.message : "Noe gikk galt. Prøv igjen.", done: 0, problems: [] };
  }
}
