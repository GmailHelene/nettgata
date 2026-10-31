import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { emailLog, inquiries, organizations, productVariants, sites, users } from "@/db/schema";
import { notifyInquiry, notifyOrderPlaced, notifyOrderShipped } from "@/lib/email/notify";
import { brevoProvider, deliver, logProvider, type EmailMessage, type EmailProvider } from "@/lib/email/send";
import { newInquiryEmail, orderConfirmationEmail, type OrderData } from "@/lib/email/templates";
import { createProduct } from "@/lib/shop/catalog";
import { saveDiscount } from "@/lib/shop/discounts";
import { createOrder, setOrderStatus, setTracking, type CheckoutInput } from "@/lib/shop/orders";
import { readShopSettings } from "@/lib/shop/settings";

const shop = { name: "Ullstua", email: "post@ullstua.no", phone: "900 00 000", street: "Storgata 1", postalCode: "3340", city: "Åmot", orgnr: "927889404" };
const order: OrderData = {
  number: 1001,
  status: "pending_payment",
  customerName: "Kari <script>alert(1)</script> Nordmann",
  customerEmail: "kari@test.no",
  customerPhone: null,
  paymentMethod: "ved-henting",
  shippingName: "Sendes med posten",
  shippingAddress: { name: "Kari Nordmann", street: "Gata 1", postalCode: "3340", city: "Åmot", country: "NO" },
  subtotalOre: 40000,
  discountOre: 4000,
  discountCode: "HOST10",
  shippingOre: 9900,
  totalOre: 45900,
  vatOre: 9180,
  note: "Kan dere pakke det inn?\n<b>Takk</b>",
  trackingCarrier: null,
  trackingNumber: null,
};

/** Det tydeligste AI-tegnet: tankestrek, eller bindestrek med mellomrom brukt som tankestrek. */
const dashes = /[–—]| - /;

describe("e-postmaler", () => {
  const mail = orderConfirmationEmail({
    shop,
    order,
    lines: [{ name: "Strikket lue", variantLabel: "Blå", quantity: 2, totalOre: 40000 }],
    orderUrl: "https://ullstua.nettgata.no/ordre/abc?t=123",
    termsUrl: "https://ullstua.nettgata.no/kjopsvilkar",
  });

  it("escaper alt kunden har skrevet", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<b>Takk</b>");
    expect(mail.html).toContain("&lt;b&gt;Takk&lt;/b&gt;");
    // Fornavnet i overskriften er escapet selv om det inneholder HTML.
    const tricky = orderConfirmationEmail({ shop, order: { ...order, customerName: "<img/src=x>" }, lines: [], orderUrl: "https://a.no", termsUrl: "javascript:alert(1)" });
    expect(tricky.html).toContain("&lt;img/src=x&gt;");
    expect(tricky.html).not.toContain("javascript:");
  });

  it("har ordre, rabatt, frakt, MVA, lenker og kontakt", () => {
    expect(mail.subject).toBe("Takk for bestillingen (ordre 1001)");
    expect(mail.html).not.toContain("med Sendes med posten");
    for (const part of ["HOST10", "Frakt, Sendes med posten", "Herav MVA", "Du betaler når du henter varene.", "Les kjøpsvilkårene og angreretten", "svarer du bare på denne e-posten"]) {
      expect(mail.html).toContain(part);
    }
    expect(mail.text).toContain("Se bestillingen: https://ullstua.nettgata.no/ordre/abc?t=123");
  });

  it("har ingen tankestreker og ekte æøå", () => {
    for (const rendered of [
      mail,
      newInquiryEmail({ shop, inquiry: { name: "Ola", email: null, phone: "41234567", message: "Hei", pagePath: "/" }, siteUrl: "https://x.no", studioUrl: "https://y.no" }),
    ]) {
      expect(rendered.text).not.toMatch(dashes);
      expect(rendered.subject).not.toMatch(dashes);
    }
    expect(mail.html).toContain("spørsmål");
  });
});

/** Tar vare på alt som «sendes», så testen kan se hvem som fikk hva. */
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

describe("sending og logg", () => {
  let db: Db;
  let siteId: string;
  let userId: string;
  const settings = readShopSettings({ paymentMethods: ["ved-henting"] });

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
  });
  afterEach(() => vi.unstubAllGlobals());

  async function placeOrder(overrides: Partial<CheckoutInput> = {}) {
    const p = await createProduct(
      db,
      siteId,
      { name: "Lue", vatRate: 25, status: "active", variants: [{ optionValues: [], priceOre: 20000, stock: null }] },
      userId,
    );
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
    return createOrder(db, siteId, settings, {
      lines: [{ variantId: v.id, quantity: 1 }],
      name: "Kari Nordmann",
      email: "kari@test.no",
      shippingCode: "post",
      address: { street: "Gata 1", postalCode: "3340", city: "Åmot" },
      paymentMethod: "ved-henting",
      acceptedTerms: true,
      ...overrides,
    });
  }

  it("logger uten å sende når e-post ikke er slått på", async () => {
    const result = await deliver(db, logProvider, { siteId, kind: "ny-henvendelse" }, { to: { email: "a@b.no" }, fromName: "X", subject: "S", html: "<p>h</p>", text: "t" });
    expect(result.status).toBe("logget");
  });

  it("en e-post som feiler stopper ingenting, men havner i loggen med feilen", async () => {
    const o = await placeOrder();
    const { provider } = recordingProvider(true);
    await expect(notifyOrderPlaced(db, provider, o.id)).resolves.toBeUndefined();
    const logs = await db.select().from(emailLog).where(eq(emailLog.orderId, o.id));
    expect(logs.map((l) => [l.kind, l.status, l.error])).toEqual([
      ["ordrebekreftelse", "feilet", "Brevo er nede"],
      ["ny-ordre", "feilet", "Brevo er nede"],
    ]);
  });

  it("kunden får bekreftelse, butikken får varsel med svar til kunden", async () => {
    await saveDiscount(db, siteId, null, { code: "TIPROSENT", kind: "percent", value: 10 }, userId);
    const o = await placeOrder({ discountCode: "TIPROSENT", note: "Gave" });
    const { provider, sent } = recordingProvider();
    await notifyOrderPlaced(db, provider, o.id);
    expect(sent.map((m) => [m.to.email, m.fromName, m.replyTo?.email])).toEqual([
      ["kari@test.no", "Ullstua", "post@ullstua.no"],
      ["post@ullstua.no", "Nettgata", "kari@test.no"],
    ]);
    expect(sent[0].html).toContain("TIPROSENT");
    expect(sent[0].text).toContain("/ordre/");
    expect(sent[1].subject).toBe("Ny ordre 1001 fra Kari Nordmann (279 kr)");
    const logs = await db.select().from(emailLog);
    expect(logs.every((l) => l.status === "sendt" && l.providerId)).toBe(true);
  });

  it("respekterer innstillingene: ingen varsel til butikken når det er slått av", async () => {
    await db.update(sites).set({ notifications: { newOrder: false } }).where(eq(sites.id, siteId));
    const o = await placeOrder();
    const { provider, sent } = recordingProvider();
    await notifyOrderPlaced(db, provider, o.id);
    expect(sent.map((m) => m.to.email)).toEqual(["kari@test.no"]);
  });

  it("«pakken er på vei» bare når ordren er sendt, med sporingslenke", async () => {
    const o = await placeOrder();
    const { provider, sent } = recordingProvider();
    await notifyOrderShipped(db, provider, o.id);
    expect(sent).toHaveLength(0);
    await setOrderStatus(db, siteId, o.id, "paid", userId);
    await setTracking(db, siteId, o.id, { carrier: "posten", number: "RR123456785NO" }, userId);
    await setOrderStatus(db, siteId, o.id, "fulfilled", userId);
    await notifyOrderShipped(db, provider, o.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Ordren din er sendt (ordre 1001)");
    expect(sent[0].html).toContain("https://sporing.posten.no/sporing/RR123456785NO");

    // Hentes i butikken: ingen «pakken er på vei».
    const pickup = await placeOrder({ shippingCode: "hent", address: null });
    await setOrderStatus(db, siteId, pickup.id, "paid", userId);
    await setOrderStatus(db, siteId, pickup.id, "fulfilled", userId);
    await notifyOrderShipped(db, provider, pickup.id);
    expect(sent).toHaveLength(1);
  });

  it("henvendelser går til varseladressen, og svar går til den som skrev", async () => {
    await db.update(sites).set({ notifications: { email: "varsel@ullstua.no" } }).where(eq(sites.id, siteId));
    const [row] = await db
      .insert(inquiries)
      .values({ siteId, name: "Ola", email: "ola@test.no", message: "Har dere lue i rødt?", pagePath: "/kontakt" })
      .returning();
    const { provider, sent } = recordingProvider();
    await notifyInquiry(db, provider, row.id);
    expect(sent.map((m) => [m.to.email, m.replyTo?.email, m.subject])).toEqual([["varsel@ullstua.no", "ola@test.no", "Ny henvendelse fra Ola"]]);

    await db.update(sites).set({ notifications: { newInquiry: false } }).where(eq(sites.id, siteId));
    await notifyInquiry(db, provider, row.id);
    expect(sent).toHaveLength(1);
  });

  it("sender riktig forespørsel til Brevo", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "<abc@brevo>" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await brevoProvider("nokkel", "ordre@nettgata.no").send({
      to: { email: "kari@test.no", name: "Kari" },
      fromName: "Ullstua",
      replyTo: { email: "post@ullstua.no" },
      subject: "Hei",
      html: "<p>Hei</p>",
      text: "Hei",
    });
    expect(result.id).toBe("<abc@brevo>");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("nokkel");
    expect(JSON.parse(init.body as string)).toMatchObject({
      sender: { name: "Ullstua", email: "ordre@nettgata.no" },
      to: [{ email: "kari@test.no", name: "Kari" }],
      replyTo: { email: "post@ullstua.no" },
      htmlContent: "<p>Hei</p>",
      textContent: "Hei",
    });
  });
});
