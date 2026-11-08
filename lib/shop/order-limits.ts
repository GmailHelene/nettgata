import type { Db } from "@/db";
import { hit, rules } from "@/lib/rate-limit";

export const TOO_MANY_ORDERS = "Mange bestillinger på kort tid. Vent litt og prøv igjen.";
export const SHOP_BUSY = "Butikken har fått svært mange bestillinger akkurat nå. Prøv igjen om en stund.";

/** Kort kode av e-postadressen. Selve adressen lagres aldri i rate_limit_events. */
async function emailKey(email: string, secret: Uint8Array): Promise<string> {
  const data = new Uint8Array([...secret, ...new TextEncoder().encode(`ordre:${email}`)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Grensene for kassen, felles for vanlige bestillinger og bestillinger med Vipps, Klarna og Kustom.
 * Svarer med meldingen kunden skal se, eller null når bestillingen kan gå videre.
 * Rekkefølgen betyr noe: den smaleste grensen sjekkes først, så én robot ikke bruker opp kvoten til hele butikken.
 */
export async function orderLimitMessage(
  db: Db,
  o: { siteId: string; ipKey: string; email: unknown; secret: Uint8Array; now?: Date },
): Promise<string | null> {
  if (!(await hit(db, `order-ip:${o.ipKey}`, rules.orderPerIp, o.now))) return TOO_MANY_ORDERS;
  const email = typeof o.email === "string" ? o.email.trim().toLowerCase().slice(0, 120) : "";
  if (email && !(await hit(db, `order-email:${o.siteId}:${await emailKey(email, o.secret)}`, rules.orderPerEmail, o.now))) {
    return TOO_MANY_ORDERS;
  }
  if (!(await hit(db, `order-site:${o.siteId}`, rules.orderPerSite, o.now))) return SHOP_BUSY;
  return null;
}
