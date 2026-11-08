import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { rateLimitEvents } from "@/db/schema";
import { rules } from "@/lib/rate-limit";
import { orderLimitMessage, SHOP_BUSY, TOO_MANY_ORDERS } from "@/lib/shop/order-limits";

const secret = new TextEncoder().encode("test-hemmelighet-som-er-lang-nok");
const siteId = "00000000-0000-0000-0000-000000000001";
const now = new Date(Date.UTC(2026, 10, 8, 12));

let db: Db;
beforeEach(async () => {
  db = await createPgliteDb();
});

const order = (ipKey: string, email: unknown, at = now) => orderLimitMessage(db, { siteId, ipKey, email, secret, now: at });

describe("grenser i kassen", () => {
  it("stopper samme IP etter ti bestillinger på ti minutter, og slipper den til igjen etterpå", async () => {
    for (let i = 0; i < rules.orderPerIp.limit; i++) expect(await order("ip-a", `kunde${i}@eksempel.no`)).toBeNull();
    expect(await order("ip-a", "ny@eksempel.no")).toBe(TOO_MANY_ORDERS);
    expect(await order("ip-a", "ny@eksempel.no", new Date(now.getTime() + 11 * 60_000))).toBeNull();
  });

  it("stopper samme e-postadresse fra mange IP-er, uansett store bokstaver", async () => {
    for (let i = 0; i < rules.orderPerEmail.limit; i++) expect(await order(`ip-${i}`, "Offer@Eksempel.no")).toBeNull();
    expect(await order("ip-ny", " offer@eksempel.no ")).toBe(TOO_MANY_ORDERS);
    // En annen kunde merker ingenting.
    expect(await order("ip-ny", "annen@eksempel.no")).toBeNull();
  });

  it("stopper roboter som bytter både IP og adresse når butikken får urimelig mange bestillinger", async () => {
    const old = new Date(now.getTime() - 30 * 60_000);
    await db.insert(rateLimitEvents).values(Array.from({ length: rules.orderPerSite.limit }, () => ({ key: `order-site:${siteId}`, createdAt: old })));
    expect(await order("ip-ukjent", "x@eksempel.no")).toBe(SHOP_BUSY);
    // En annen butikk er ikke berørt.
    expect(await orderLimitMessage(db, { siteId: "00000000-0000-0000-0000-000000000002", ipKey: "ip-ukjent2", email: "x@eksempel.no", secret, now })).toBeNull();
  });

  it("lagrer aldri e-postadressen i klartekst", async () => {
    await order("ip-a", "hemmelig@eksempel.no");
    const keys = (await db.select({ key: rateLimitEvents.key }).from(rateLimitEvents)).map((r) => r.key).join(" ");
    expect(keys).not.toContain("hemmelig");
    expect(keys).toContain("order-email:");
  });

  it("tåler at e-postfeltet mangler", async () => {
    expect(await order("ip-a", undefined)).toBeNull();
  });
});
