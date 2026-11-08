import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoTheme } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { auditLog, customers, inquiries, newsletterSubscribers, orders, organizations, sites, users } from "@/db/schema";
import { customerDataExport, eraseCustomer, retentionEnds } from "@/lib/shop/personvern";

let db: Db;
let siteId: string;
let userId: string;
let customerId: string;
let n = 1001;

async function order(createdAt: Date, status: "fulfilled" | "paid" = "fulfilled") {
  const [row] = await db
    .insert(orders)
    .values({
      siteId,
      number: n++,
      status,
      customerName: "Ola Nordmann",
      customerEmail: "Ola@Test.no",
      customerPhone: "900 00 000",
      customerId,
      shipping: { code: "post", name: "Posten", priceOre: 0 },
      shippingAddress: { name: "Ola Nordmann", street: "Storgata 1", postalCode: "3340", city: "Åmot", country: "NO" },
      subtotalOre: 10000,
      shippingOre: 0,
      totalOre: 10000,
      vatOre: 2000,
      paymentMethod: "faktura",
      paidAt: createdAt,
      accessToken: "x".repeat(48),
      createdAt,
    })
    .returning();
  return row;
}

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  n = 1001;
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
  const [site] = await db.insert(sites).values({ orgId: org.id, name: "Butikk", slug: "butikk", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme }).returning();
  siteId = site.id;
  const [c] = await db.insert(customers).values({ siteId, email: "ola@test.no", name: "Ola Nordmann", phone: "900 00 000" }).returning();
  customerId = c.id;
});

describe("personvern for én kunde", () => {
  it("oppbevaringen varer til fem år etter utgangen av regnskapsåret", () => {
    expect(retentionEnds(new Date("2026-03-15T10:00:00Z")).toISOString()).toBe("2032-01-01T00:00:00.000Z");
  });

  it("innsyn gir ordre, henvendelser og nyhetsbrev med samme e-post, uansett store og små bokstaver", async () => {
    await order(new Date("2026-10-01T10:00:00Z"));
    await db.insert(inquiries).values({ siteId, name: "Ola", email: "OLA@test.no", message: "Hei" });
    await db.insert(newsletterSubscribers).values({ siteId, email: "ola@test.no", status: "bekreftet", consentText: "Ja takk", consentedAt: new Date() });
    const data = await customerDataExport(db, siteId, customerId);
    expect(data.kunde.epost).toBe("ola@test.no");
    expect(data.ordre).toHaveLength(1);
    expect(data.henvendelser).toHaveLength(1);
    expect(data.nyhetsbrev).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/[–—]/);
  });

  it("sletting beholder ordre regnskapet trenger, anonymiserer gamle og sletter resten", async () => {
    const now = new Date("2032-06-01T10:00:00Z");
    const old = await order(new Date("2026-03-01T10:00:00Z"));
    const recent = await order(new Date("2030-03-01T10:00:00Z"));
    await db.insert(inquiries).values({ siteId, name: "Ola", email: "ola@test.no", message: "Hei" });
    const r = await eraseCustomer(db, null, siteId, customerId, userId, now);
    expect(r).toMatchObject({ keptOrders: 1, anonymizedOrders: 1, inquiries: 1 });
    expect(r.keptUntil?.toISOString()).toBe("2036-01-01T00:00:00.000Z");
    const [a] = await db.select().from(orders).where(eq(orders.id, old.id));
    expect(a).toMatchObject({ customerName: "Slettet kunde", customerPhone: null, shippingAddress: null, customerId: null });
    const [b] = await db.select().from(orders).where(eq(orders.id, recent.id));
    expect(b).toMatchObject({ customerName: "Ola Nordmann", customerId: null });
    expect(await db.select().from(customers)).toHaveLength(0);
    expect(await db.select().from(inquiries)).toHaveLength(0);
    // Loggen sier hva som ble gjort, men ikke hvem.
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "customer.erased"));
    expect(JSON.stringify(log.detail)).not.toMatch(/Ola|ola@/i);
  });

  it("stopper når kunden har ordre som ikke er sendt", async () => {
    await order(new Date(), "paid");
    await expect(eraseCustomer(db, null, siteId, customerId, userId)).rejects.toThrow("ikke er sendt ennå");
  });
});
