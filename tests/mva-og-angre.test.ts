import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { auditLog, emailLog, inquiries, orderLines, orders, organizations, productVariants, sites, users } from "@/db/schema";
import type { EmailMessage, EmailProvider } from "@/lib/email/send";
import { orderConfirmationEmail, type OrderData } from "@/lib/email/templates";
import { kasseTekster, lagAngrerettside } from "@/lib/legal/angrerett";
import { generatedLegalPage } from "@/lib/legal/kundesider";
import { registerWithdrawal, withdrawalSchema } from "@/lib/shop/angre";
import { createProduct } from "@/lib/shop/catalog";
import { createOrder, priceLines } from "@/lib/shop/orders";
import { readShopSettings } from "@/lib/shop/settings";
import { readSiteInfo } from "@/lib/site-info";

const dashes = /[–—]| - /;
const settings = readShopSettings({ paymentMethods: ["ved-henting"] });

function recordingProvider(fail = false) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    name: "brevo",
    async send(m) {
      if (fail) throw new Error("Brevo er nede");
      sent.push(m);
      return { id: `msg-${sent.length}` };
    },
  };
  return { provider, sent };
}

describe("butikk som ikke er MVA-registrert", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  let variantId: string;

  async function setRegistered(mvaRegistrert: boolean) {
    await db.update(sites).set({ info: { email: "post@ullstua.no", orgnr: "927889404", mvaRegistrert } }).where(eq(sites.id, siteId));
  }

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [site] = await db
      .insert(sites)
      .values({ orgId: org.id, name: "Ullstua", slug: "ullstua", kind: "nettbutikk", industryPack: "nettbutikk", theme: demoTheme, info: { email: "post@ullstua.no" } })
      .returning();
    siteId = site.id;
    userId = user.id;
    const p = await createProduct(db, siteId, { name: "Lue", vatRate: 25, status: "active", variants: [{ optionValues: [], priceOre: 20000, stock: null }] }, userId);
    [{ id: variantId }] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, p.id));
  });

  const order = () =>
    createOrder(db, siteId, settings, {
      lines: [{ variantId, quantity: 1 }],
      name: "Kari Nordmann",
      email: "kari@test.no",
      shippingCode: "post",
      address: { street: "Gata 1", postalCode: "3340", city: "Åmot" },
      paymentMethod: "ved-henting",
      acceptedTerms: true,
    });

  it("er registrert som standard, så eksisterende butikker tar MVA som før", async () => {
    expect(readSiteInfo({}).mvaRegistrert).toBe(true);
    expect((await priceLines(db, siteId, [{ variantId, quantity: 1 }]))[0].vatRate).toBe(25);
    const o = await order();
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row.vatOre).toBeGreaterThan(0);
  });

  it("selger uten MVA, også på frakten, selv om varen har sats 25 %", async () => {
    await setRegistered(false);
    expect((await priceLines(db, siteId, [{ variantId, quantity: 1 }]))[0].vatRate).toBe(0);
    const o = await order();
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row.vatOre).toBe(0);
    expect(row.totalOre).toBe(20000 + 9900);
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id));
    expect(lines.map((l) => l.vatRate)).toEqual([0]);
  });

  it("vilkårene og kassen lover ikke merverdiavgift, og «MVA» står ikke etter org.nr.", async () => {
    await setRegistered(false);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    const info = readSiteInfo(site.info);
    const tekst = JSON.stringify(generatedLegalPage(site, "/angrerett"));
    expect(tekst).toContain("ikke registrert for merverdiavgift");
    expect(tekst).not.toContain("Prisene står med merverdiavgift");
    expect(tekst).not.toContain("927 889 404 MVA");
    const kasse = kasseTekster({ butikk: { navn: "Ullstua", info, mva: false } });
    expect(kasse.forKnappen).toContain("er med frakt");
    expect(kasse.forKnappen).not.toContain("merverdiavgift");
  });

  it("en registrert nettbutikk har «MVA» etter org.nr. og sier at prisene er med merverdiavgift", async () => {
    await setRegistered(true);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    const tekst = JSON.stringify(generatedLegalPage(site, "/angrerett"));
    expect(tekst).toContain("927 889 404 MVA");
    expect(tekst).toContain("Prisene står med merverdiavgift");
  });

  it("ordrebekreftelsen viser ikke MVA når ordren er uten MVA", () => {
    const shop = { name: "Ullstua", email: "post@ullstua.no", phone: "", street: "", postalCode: "", city: "", orgnr: "" };
    const data: OrderData = {
      number: 1001,
      status: "paid",
      customerName: "Kari",
      customerEmail: "kari@test.no",
      customerPhone: null,
      paymentMethod: "ved-henting",
      shippingName: "Hent selv",
      shippingAddress: null,
      subtotalOre: 20000,
      discountOre: 0,
      discountCode: null,
      shippingOre: 0,
      totalOre: 20000,
      vatOre: 0,
      note: null,
      trackingCarrier: null,
      trackingNumber: null,
    };
    const mail = orderConfirmationEmail({ shop, order: data, lines: [], orderUrl: "https://a.no/o", termsUrl: "https://a.no/v" });
    expect(mail.html).not.toContain("Herav MVA");
    expect(mail.text).not.toContain("MVA");
    const medMva = orderConfirmationEmail({ shop, order: { ...data, vatOre: 4000 }, lines: [], orderUrl: "https://a.no/o", termsUrl: "https://a.no/v" });
    expect(medMva.html).toContain("Herav MVA");
  });

  describe("Angre avtalen", () => {
    const input = { name: "Kari <b>Nordmann</b>", about: "Ordre 1001", email: "kari@test.no" };

    it("krever navn, hvilket kjøp og gyldig e-post", () => {
      expect(withdrawalSchema.safeParse({ ...input, name: " " }).success).toBe(false);
      expect(withdrawalSchema.safeParse({ ...input, about: "" }).success).toBe(false);
      expect(withdrawalSchema.safeParse({ ...input, email: "ikke-epost" }).success).toBe(false);
      expect(withdrawalSchema.safeParse(input).success).toBe(true);
    });

    it("lagrer meldingen, gir kunden kvittering med innhold og tidspunkt, og varsler butikken", async () => {
      const { provider, sent } = recordingProvider();
      const receipt = await registerWithdrawal(db, provider, siteId, input);
      expect(receipt).toMatchObject({ ...input, emailed: true });
      expect(receipt?.at).toMatch(/\d/);

      const [row] = await db.select().from(inquiries).where(eq(inquiries.siteId, siteId));
      expect(row).toMatchObject({ name: input.name, email: input.email, pagePath: "/angre-avtalen" });
      expect(row.message).toContain("Ordre 1001");

      expect(sent.map((m) => [m.to.email, m.fromName, m.replyTo?.email])).toEqual([
        ["kari@test.no", "Ullstua", "post@ullstua.no"],
        ["post@ullstua.no", "Nettgata", "kari@test.no"],
      ]);
      expect(sent[0].text).toContain("Ordre 1001");
      expect(sent[0].text).toContain(receipt!.at);
      expect(sent[0].html).not.toContain("<b>Nordmann</b>");
      for (const m of sent) expect(m.text).not.toMatch(dashes);

      const audits = await db.select().from(auditLog).where(eq(auditLog.action, "order.withdrawal_received"));
      expect(audits).toHaveLength(1);
    });

    it("varsler butikken selv om varsel om henvendelser er slått av", async () => {
      await db.update(sites).set({ notifications: { newInquiry: false } }).where(eq(sites.id, siteId));
      const { provider, sent } = recordingProvider();
      await registerWithdrawal(db, provider, siteId, input);
      expect(sent.map((m) => m.to.email)).toEqual(["kari@test.no", "post@ullstua.no"]);
    });

    it("beskjeden er registrert selv om e-posten feiler, og siden får vite det", async () => {
      const { provider } = recordingProvider(true);
      const receipt = await registerWithdrawal(db, provider, siteId, input);
      expect(receipt?.emailed).toBe(false);
      expect(await db.select().from(inquiries)).toHaveLength(1);
      const logs = await db.select().from(emailLog);
      expect(logs.map((l) => l.status)).toEqual(["feilet", "feilet"]);
    });

    it("gjelder bare nettbutikker", async () => {
      await db.update(sites).set({ kind: "nettside" }).where(eq(sites.id, siteId));
      const { provider, sent } = recordingProvider();
      expect(await registerWithdrawal(db, provider, siteId, input)).toBeNull();
      expect(sent).toHaveLength(0);
      expect(await db.select().from(inquiries)).toHaveLength(0);
    });

    it("angresiden forteller om funksjonen, uten tankestrek", () => {
      const side = lagAngrerettside({ butikk: { navn: "Ullstua", info: readSiteInfo({ email: "post@ullstua.no" }) } });
      const tekst = JSON.stringify(side);
      expect(tekst).toContain("«Angre avtalen»");
      expect(tekst).not.toMatch(/[–—]/);
    });
  });
});
