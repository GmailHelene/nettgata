import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import {
  aiRuns,
  aiSuggestions,
  emailLog,
  inquiries,
  memberships,
  monthlyReports,
  newsletterDeliveries,
  newsletters,
  newsletterSubscribers,
  pages,
  sites,
  users,
  visitDays,
  visitPages,
  visitSources,
} from "@/db/schema";
import { weeklyAiActive } from "@/lib/ai/access";
import type { AiClient } from "@/lib/ai/client";
import { WEEKLY_CAP_ORE, WEEKLY_MAX_SUGGESTIONS } from "@/lib/ai/config";
import { WEEKLY_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { collectBatches, startNightly, startWeekly } from "@/lib/ai/runs";
import type { SiteBilling } from "@/lib/billing/state";
import { readAnswers } from "@/lib/content/form-fields";
import type { EmailMessage, EmailProvider } from "@/lib/email/send";
import { newInquiryEmail } from "@/lib/email/templates";
import { publishPage } from "@/lib/publishing";
import { changeText, monthlyReportEmail, reportMonth, sendMonthlyReports, buildMonthlyReport } from "@/lib/rapport/maned";
import { defaultPrefs, reportRecipients, savePrefs } from "@/lib/rapport/mottakere";
import { runRetention } from "@/lib/retention";
import { createSiteFromPack } from "@/lib/sites";

/** Falsk e-post: husker alt som sendes. Navnet er «brevo», så deliver() faktisk kaller send(). */
function fakeEmail() {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    name: "brevo",
    send: vi.fn(async (m: EmailMessage) => {
      sent.push(m);
      return { id: `msg-${sent.length}` };
    }),
  };
  return { provider, sent };
}

function message(body: unknown): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(body), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 15_000, output_tokens: 2_500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

function fakeAi(reply: () => Anthropic.Message) {
  const batches = new Map<string, Anthropic.Messages.BatchCreateParams.Request[]>();
  const client: AiClient = {
    create: vi.fn(async () => reply()),
    createBatch: vi.fn(async (requests) => {
      const id = `msgbatch_${batches.size + 1}`;
      batches.set(id, requests);
      return { id };
    }),
    batchStatus: vi.fn(async () => "ended"),
    batchResults: vi.fn(async (id) =>
      (async function* () {
        for (const r of batches.get(id)!) yield { custom_id: r.custom_id, result: { type: "succeeded", message: reply() } } as Anthropic.Messages.MessageBatchIndividualResponse;
      })(),
    ),
  };
  return { client, batches };
}

let db: Db;
let ownerId: string;
let siteId: string;

const PAID: Partial<SiteBilling> = { status: "active", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", plan: "nettside", interval: "month" };
const setBilling = (id: string, billing: Partial<SiteBilling>) => db.update(sites).set({ billing }).where(eq(sites.id, id));

async function publishFront(id: string) {
  const [front] = await db.select().from(pages).where(and(eq(pages.siteId, id), eq(pages.path, "/")));
  await publishPage(db, front.id, ownerId, { allowPlaceholders: true });
  return front;
}

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  const [owner] = await db.insert(users).values({ email: "eier@test.no", name: "Eva Eier", passwordHash: "x" }).returning();
  ownerId = owner.id;
  const site = await createSiteFromPack(db, { name: "Rørlegger Hansen", packKey: "handverker", info: demoInfo, ownerId });
  siteId = site.id;
  // Nettstedet ble laget i september, så det skal ha rapport for oktober.
  await db.update(sites).set({ createdAt: new Date("2026-09-01T10:00:00Z") }).where(eq(sites.id, siteId));
});

// ---------- Månedsrapport ----------

describe("månedsrapporten", () => {
  it("regner måneden i norsk tid, også rett etter midnatt den 1.", () => {
    // 31. oktober 23:30 UTC er 1. november 00:30 i Norge (vintertid).
    expect(reportMonth(new Date("2026-10-31T23:30:00Z"))).toMatchObject({ key: "2026-10", from: "2026-10-01", to: "2026-10-31", label: "oktober" });
    // 31. oktober 22:30 UTC er fortsatt 31. oktober i Norge.
    expect(reportMonth(new Date("2026-10-31T22:30:00Z")).key).toBe("2026-09");
    // Januar gir desember året før, og sammenligningen er november.
    expect(reportMonth(new Date("2027-01-01T00:30:00Z"))).toMatchObject({ key: "2026-12", previous: { key: "2026-11", label: "november" } });
    // Sommertid: 31. mars 22:30 UTC er 1. april 00:30 i Norge.
    expect(reportMonth(new Date("2026-03-31T22:30:00Z")).key).toBe("2026-03");
  });

  it("endring mot forrige måned sies med vanlige ord", () => {
    expect(changeText(112, 100, "september")).toBe("opp 12 % fra september");
    expect(changeText(95, 100, "september")).toBe("ned 5 % fra september");
    expect(changeText(100, 100, "september")).toBe("som i september");
    expect(changeText(10, 0, "september")).toBe("");
  });

  it("tallene stemmer, og henvendelser telles etter norsk dato", async () => {
    await publishFront(siteId);
    await db.insert(visitDays).values([
      { siteId, day: "2026-10-01", views: 300, visitors: 100 },
      { siteId, day: "2026-10-31", views: 150, visitors: 50 },
      { siteId, day: "2026-09-15", views: 200, visitors: 125 },
      { siteId, day: "2026-11-01", views: 999, visitors: 999 },
    ]);
    await db.insert(visitPages).values([
      { siteId, day: "2026-10-01", path: "/", views: 200 },
      { siteId, day: "2026-10-31", path: "/", views: 50 },
      { siteId, day: "2026-10-01", path: "/tjenester", views: 120 },
      { siteId, day: "2026-10-02", path: "/kontakt", views: 60 },
      { siteId, day: "2026-10-03", path: "/om", views: 20 },
    ]);
    await db.insert(visitSources).values([
      { siteId, day: "2026-10-01", source: "google.no", visits: 40 },
      { siteId, day: "2026-10-02", source: "google.com", visits: 10 },
      { siteId, day: "2026-10-02", source: "", visits: 30 },
      { siteId, day: "2026-10-02", source: "facebook.com", visits: 20 },
      { siteId, day: "2026-10-03", source: "finn.no", visits: 5 },
    ]);
    await db.insert(inquiries).values([
      { siteId, name: "A", message: "Hei", createdAt: new Date("2026-09-30T22:30:00Z") }, // 1. oktober 00:30 i Norge
      { siteId, name: "B", message: "Hei", createdAt: new Date("2026-10-31T22:59:00Z") }, // 31. oktober 23:59
      { siteId, name: "C", message: "Hei", createdAt: new Date("2026-10-31T23:01:00Z") }, // 1. november
    ]);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    const report = await buildMonthlyReport(db, site, reportMonth(new Date("2026-11-01T06:00:00Z")));
    expect(report).toMatchObject({ visitors: 150, previousVisitors: 125, views: 450, previousViews: 200, inquiries: 2, orders: null, salesOre: null });
    expect(report.pages.map((p) => p.label)).toEqual(["/", "/tjenester", "/kontakt"]);
    expect(report.sources).toEqual([
      { label: "Google", count: 50 },
      { label: "Direkte eller ukjent", count: 30 },
      { label: "Facebook", count: 20 },
    ]);
    expect(report.fixNow.length).toBeLessThanOrEqual(2);

    const email = monthlyReportEmail(report, "owner");
    expect(email.subject).toBe("Slik gikk oktober for Rørlegger Hansen");
    expect(email.text).toContain("Besøkende: 150, opp 20 % fra september");
    expect(email.text).toContain("/studio/nettsted/");
    expect(email.html).toContain("/statistikk");
    // Ingen tankestrek og ingen « - » brukt som tankestrek i teksten kunden får.
    expect(email.text).not.toMatch(/[–—]| - /);
  });

  it("sendes én gang per nettsted og måned, også når to kjøringer går samtidig", async () => {
    await publishFront(siteId);
    const mail = fakeEmail();
    const now = new Date("2026-11-01T06:00:00Z");
    const [a, b] = await Promise.all([sendMonthlyReports(db, mail.provider, { now }), sendMonthlyReports(db, mail.provider, { now })]);
    expect(a.emails + b.emails).toBe(1);
    expect(await sendMonthlyReports(db, mail.provider, { now: new Date("2026-11-01T06:10:00Z") })).toMatchObject({ sites: 0, emails: 0 });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: { email: "eier@test.no" }, fromName: "Nettgata" });
    const [row] = await db.select().from(monthlyReports);
    expect(row).toMatchObject({ month: "2026-10", status: "sendt", recipients: 1 });
    const logged = await db.select().from(emailLog).where(eq(emailLog.kind, "manedsrapport"));
    expect(logged).toHaveLength(1);
  });

  it("går bare de første dagene i måneden, og bare for publiserte nettsteder", async () => {
    const mail = fakeEmail();
    expect(await sendMonthlyReports(db, mail.provider, { now: new Date("2026-11-01T06:00:00Z") })).toMatchObject({ sites: 0 });
    await publishFront(siteId);
    expect(await sendMonthlyReports(db, mail.provider, { now: new Date("2026-11-05T06:00:00Z") })).toMatchObject({ sites: 0, skipped: expect.any(String) });
    expect(mail.sent).toHaveLength(0);
  });

  it("sender i porsjoner, så mange nettsteder ikke tar for lang tid", async () => {
    await publishFront(siteId);
    for (const name of ["Frisør Eva", "Maler Ola"]) {
      const s = await createSiteFromPack(db, { name, packKey: "handverker", info: demoInfo, ownerId });
      await db.update(sites).set({ createdAt: new Date("2026-09-01T10:00:00Z") }).where(eq(sites.id, s.id));
      await publishFront(s.id);
    }
    const mail = fakeEmail();
    const now = new Date("2026-11-01T06:00:00Z");
    expect((await sendMonthlyReports(db, mail.provider, { now, limit: 2 })).sites).toBe(2);
    expect((await sendMonthlyReports(db, mail.provider, { now, limit: 2 })).sites).toBe(1);
    expect((await sendMonthlyReports(db, mail.provider, { now, limit: 2 })).sites).toBe(0);
    expect(mail.sent).toHaveLength(3);
  });

  it("eieren kan slå den av, og redaktøren får den bare hvis hen slår den på", async () => {
    await publishFront(siteId);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    const [editor] = await db.insert(users).values({ email: "redaktor@test.no", passwordHash: "x" }).returning();
    const [dev] = await db.insert(users).values({ email: "utvikler@test.no", passwordHash: "x" }).returning();
    await db.insert(memberships).values([
      { orgId: site.orgId, userId: editor.id, role: "editor" },
      { orgId: site.orgId, userId: dev.id, role: "developer" },
    ]);
    expect(defaultPrefs("owner")).toEqual({ monthlyReport: true, aiEmail: true });
    expect(defaultPrefs("editor")).toEqual({ monthlyReport: false, aiEmail: false });
    expect((await reportRecipients(db, siteId, "monthlyReport")).map((r) => r.email)).toEqual(["eier@test.no"]);

    await savePrefs(db, siteId, ownerId, "owner", { monthlyReport: false, aiEmail: true });
    await savePrefs(db, siteId, editor.id, "editor", { monthlyReport: true, aiEmail: false });
    await expect(savePrefs(db, siteId, dev.id, "developer", { monthlyReport: true, aiEmail: true })).rejects.toThrow(/eier og redaktør/);
    expect((await reportRecipients(db, siteId, "monthlyReport")).map((r) => r.email)).toEqual(["redaktor@test.no"]);
    expect((await reportRecipients(db, siteId, "aiEmail")).map((r) => r.email)).toEqual(["eier@test.no"]);

    const mail = fakeEmail();
    await sendMonthlyReports(db, mail.provider, { now: new Date("2026-11-01T06:00:00Z") });
    expect(mail.sent.map((m) => m.to.email)).toEqual(["redaktor@test.no"]);
    expect(mail.sent[0].text).toContain("har slått på månedsrapporten");

    // Ingen vil ha den: raden lagres likevel, så den ikke prøves igjen.
    await savePrefs(db, siteId, editor.id, "editor", { monthlyReport: false, aiEmail: false });
    await db.delete(monthlyReports);
    await sendMonthlyReports(db, mail.provider, { now: new Date("2026-11-01T07:00:00Z") });
    expect(mail.sent).toHaveLength(1);
    expect((await db.select().from(monthlyReports))[0]).toMatchObject({ status: "ingen" });
  });
});

// ---------- Ukentlig AI-rapport ----------

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    rolle: "seo",
    type: "tips",
    tittel: "Et forslag",
    side: "",
    seksjon: "",
    felt: "",
    ny_verdi: "Gjør noe",
    ingress: "",
    kanal: "",
    hvorfor: "Fordi.",
    effekt: "Bedre.",
    ...overrides,
  };
}

describe("ukentlig AI-rapport", () => {
  it("gjelder betalte nettsteder uten tillegget, ikke prøveperioder", () => {
    expect(weeklyAiActive(PAID)).toBe(true);
    expect(weeklyAiActive({ ...PAID, status: "past_due" })).toBe(true);
    expect(weeklyAiActive({ manual: true })).toBe(true);
    expect(weeklyAiActive({ ...PAID, status: "trialing" })).toBe(false);
    expect(weeklyAiActive({ ...PAID, status: "canceled" })).toBe(false);
    expect(weeklyAiActive({})).toBe(false);
    // Med tillegget går den daglige i stedet.
    expect(weeklyAiActive({ ...PAID, addon: true })).toBe(false);
  });

  it("bruker lav innsats, høyst tre forslag og bare SEO og innhold", async () => {
    await publishFront(siteId);
    await setBilling(siteId, PAID);
    const ai = fakeAi(() => message({ forslag: [] }));
    expect(await startWeekly(db, ai.client)).toEqual({ queued: 1, skipped: 0 });
    const [request] = [...ai.batches.values()][0];
    const params = request.params as Anthropic.MessageCreateParamsNonStreaming & { output_config: { effort: string; format: { schema: { properties: { forslag: { items: { properties: { type: { enum: string[] }; rolle: { enum: string[] } } } } } } } } };
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.schema.properties.forslag.items.properties.type.enum).toEqual(["seo_tittel", "seo_beskrivelse", "tekst", "blogginnlegg"]);
    expect(params.output_config.format.schema.properties.forslag.items.properties.rolle.enum).toEqual(["seo", "innhold"]);
    expect(WEEKLY_SYSTEM_PROMPT).toContain(`Gi høyst ${WEEKLY_MAX_SUGGESTIONS} forslag`);
    expect(WEEKLY_SYSTEM_PROMPT).not.toContain("sosialt_innlegg");
    // Den daglige nattkjøringen tar ikke nettsteder uten tillegget.
    expect(await startNightly(db, ai.client)).toEqual({ queued: 0, skipped: 0 });
  });

  it("går bare for publiserte nettsteder med betalt abonnement, og høyst én gang i uka", async () => {
    const ai = fakeAi(() => message({ forslag: [] }));
    const now = new Date("2026-11-02T01:30:00Z");
    await setBilling(siteId, PAID);
    expect(await startWeekly(db, ai.client, now)).toEqual({ queued: 0, skipped: 0 }); // ikke publisert
    await publishFront(siteId);
    await setBilling(siteId, { ...PAID, status: "trialing" });
    expect(await startWeekly(db, ai.client, now)).toEqual({ queued: 0, skipped: 0 }); // prøveperiode
    await setBilling(siteId, PAID);
    expect(await startWeekly(db, ai.client, now)).toEqual({ queued: 1, skipped: 0 });
    expect(await startWeekly(db, ai.client, new Date(now.getTime() + 86_400_000))).toEqual({ queued: 0, skipped: 0 });
    expect(await startWeekly(db, ai.client, new Date(now.getTime() + 7 * 86_400_000))).toEqual({ queued: 1, skipped: 0 });
  });

  it("stopper ved det ukentlige kostnadstaket", async () => {
    await publishFront(siteId);
    await setBilling(siteId, PAID);
    const now = new Date("2026-11-20T01:30:00Z");
    await db.insert(aiRuns).values({ siteId, trigger: "uke", model: "claude-opus-5-5", status: "ferdig", costOre: WEEKLY_CAP_ORE - 100, createdAt: new Date("2026-11-05T01:30:00Z") });
    const ai = fakeAi(() => message({ forslag: [] }));
    expect(await startWeekly(db, ai.client, now)).toEqual({ queued: 0, skipped: 1 });
    // Ny måned, nytt tak.
    expect(await startWeekly(db, ai.client, new Date("2026-12-01T01:30:00Z"))).toEqual({ queued: 1, skipped: 0 });
  });

  it("lagrer høyst tre forslag av riktig type og sender én e-post om dem", async () => {
    await publishFront(siteId);
    await setBilling(siteId, PAID);
    const front = (await db.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.path, "/"))))[0];
    const seo = (n: number) => suggestion({ type: "seo_tittel", side: front.id, ny_verdi: `Rørlegger i Åmot ${n}`, tittel: `Tittel ${n}` });
    const ai = fakeAi(() =>
      message({
        forslag: [
          suggestion({ type: "sosialt_innlegg", rolle: "innhold", kanal: "facebook" }), // ikke med i den ukentlige
          suggestion({ rolle: "butikk" }), // ikke med i den ukentlige
          seo(1),
          seo(2),
          seo(3),
          seo(4),
        ],
      }),
    );
    await startWeekly(db, ai.client);
    const mail = fakeEmail();
    await collectBatches(db, ai.client, new Date(), mail.provider);
    await collectBatches(db, ai.client, new Date(), mail.provider);
    const rows = await db.select().from(aiSuggestions).where(eq(aiSuggestions.siteId, siteId));
    expect(rows.length).toBeLessThanOrEqual(WEEKLY_MAX_SUGGESTIONS);
    expect(rows.every((r) => r.kind === "seo_tittel")).toBe(true);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe(`${rows.length === 1 ? "Ett nytt forslag" : `${rows.length} nye forslag`} til Rørlegger Hansen`);
    expect(mail.sent[0].text).toContain("/ai-teamet");
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.siteId, siteId));
    expect(run).toMatchObject({ trigger: "uke", status: "ferdig" });
    expect(run.costOre).toBeLessThan(150);
  });

  it("ingen e-post når eieren har slått den av, eller når det ikke kom forslag", async () => {
    await publishFront(siteId);
    await setBilling(siteId, PAID);
    await savePrefs(db, siteId, ownerId, "owner", { monthlyReport: true, aiEmail: false });
    const front = (await db.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.path, "/"))))[0];
    const ai = fakeAi(() => message({ forslag: [suggestion({ type: "seo_tittel", side: front.id, ny_verdi: "Ny tittel" })] }));
    await startWeekly(db, ai.client);
    const mail = fakeEmail();
    await collectBatches(db, ai.client, new Date(), mail.provider);
    expect(mail.sent).toHaveLength(0);
  });
});

// ---------- Små ting ----------

describe("henvendelser med egne felt", () => {
  it("svarene lagres for seg og vises som liste i e-posten", async () => {
    const [row] = await db
      .insert(inquiries)
      .values({ siteId, name: "Ola", message: "Lekker under vasken", answers: [{ label: "Adresse", value: "Storgata 1" }] })
      .returning();
    expect(readAnswers(row.answers)).toEqual([{ label: "Adresse", value: "Storgata 1" }]);
    // Eldre rader har ingen svar i egen kolonne.
    expect(readAnswers(null)).toEqual([]);
    expect(readAnswers([{ label: 1 }, "x", { label: "A", value: "B" }])).toEqual([{ label: "A", value: "B" }]);
    const email = newInquiryEmail({
      shop: { name: "Rørlegger Hansen", email: "", phone: "", street: "", postalCode: "", city: "", orgnr: "" },
      inquiry: { name: "Ola", email: "ola@test.no", phone: null, message: row.message, pagePath: "/", answers: readAnswers(row.answers) },
      siteUrl: "https://example.no",
      studioUrl: "https://nettgata.no/studio",
    });
    expect(email.text).toContain("Lekker under vasken\n\nAdresse: Storgata 1");
    expect(email.html).toContain("Storgata 1");
  });
});

describe("sletting av mottakerlister for nyhetsbrev", () => {
  it("sletter mottakerne tolv måneder etter at nyhetsbrevet ble sendt, men beholder nyhetsbrevet", async () => {
    const [sub] = await db
      .insert(newsletterSubscribers)
      .values({ siteId, email: "a@test.no", status: "bekreftet", consentText: "Ja", consentedAt: new Date("2025-01-01") })
      .returning();
    const [old] = await db
      .insert(newsletters)
      .values({ siteId, subject: "Gammelt", status: "sendt", recipientCount: 1, sentCount: 1, finishedAt: new Date("2025-10-01T10:00:00Z") })
      .returning();
    const [fresh] = await db
      .insert(newsletters)
      .values({ siteId, subject: "Nytt", status: "sendt", recipientCount: 1, sentCount: 1, finishedAt: new Date("2026-06-01T10:00:00Z") })
      .returning();
    await db.insert(newsletterDeliveries).values([
      { newsletterId: old.id, subscriberId: sub.id, status: "sendt" },
      { newsletterId: fresh.id, subscriberId: sub.id, status: "sendt" },
    ]);
    const result = await runRetention(db, new Date("2026-11-02T03:00:00Z"));
    expect(result.newsletterDeliveries).toBe(1);
    const left = await db.select().from(newsletterDeliveries);
    expect(left.map((d) => d.newsletterId)).toEqual([fresh.id]);
    expect((await db.select().from(newsletters)).map((n) => n.recipientCount)).toEqual([1, 1]);
  });
});
