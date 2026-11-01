import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { aiRuns, aiSuggestions, inquiries, orders, pages, pageVersions, productVariants, products, sites, users } from "@/db/schema";
import { POST as collectRoute } from "@/app/api/cron/ai/route";
import { POST as nightlyRoute } from "@/app/api/cron/ai-natt/route";
import { aiTeamActive } from "@/lib/ai/access";
import { setAiClientForTests, type AiClient } from "@/lib/ai/client";
import { costOre, MONTHLY_CAP_ORE } from "@/lib/ai/config";
import { CAP_REACHED, collectBatches, runNow, startNightly } from "@/lib/ai/runs";
import { approveSuggestion, cleanText, rejectSuggestion } from "@/lib/ai/suggestions";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { addAiAddon, removeAiAddon } from "@/lib/billing/addon";
import { ADDON, PRICE_SPECS } from "@/lib/billing/plans";
import { readBilling, type SiteBilling } from "@/lib/billing/state";
import { createStripeClient } from "@/lib/billing/stripe";
import { cronKey } from "@/lib/cron";
import { createPost } from "@/lib/pages";
import { publishPage } from "@/lib/publishing";
import { runRetention } from "@/lib/retention";
import { createSiteFromPack } from "@/lib/sites";

/** Merkelapper som aldri skal finnes i noe som sendes til AI-en. */
const SECRET_MARKERS = ["hemmelig-kunde@test.no", "Kari Hemmelig", "Melding fra skjemaet XYZ", "Hemmeliggata 7", "411 22 333", "firma@hemmelig-test.no"];

const ACTIVE_ADDON: Partial<SiteBilling> = { addon: true, status: "active", stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", interval: "month", plan: "nettside" };

type Json = Record<string, unknown>;

function message(body: unknown, usage = { input_tokens: 12_000, output_tokens: 3_000 }, stop: string = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: typeof body === "string" ? body : JSON.stringify(body), citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { ...usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

/** Falsk Anthropic: husker hva som ble sendt, og svarer det testen har lagt klart. Ingen nettverk, ingen kostnad. */
function fakeAi() {
  const created: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const batches = new Map<string, { requests: Anthropic.Messages.BatchCreateParams.Request[]; status: string }>();
  let reply: (params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message = () => message({ forslag: [] });
  const client: AiClient = {
    create: vi.fn(async (params) => {
      created.push(params);
      return reply(params);
    }),
    createBatch: vi.fn(async (requests) => {
      const id = `msgbatch_${batches.size + 1}`;
      batches.set(id, { requests, status: "in_progress" });
      return { id };
    }),
    batchStatus: vi.fn(async (id) => batches.get(id)!.status),
    batchResults: vi.fn(async (id) => {
      const batch = batches.get(id)!;
      return (async function* () {
        for (const r of batch.requests) {
          yield { custom_id: r.custom_id, result: { type: "succeeded", message: reply(r.params as Anthropic.MessageCreateParamsNonStreaming) } } as Anthropic.Messages.MessageBatchIndividualResponse;
        }
      })();
    }),
  };
  return {
    client,
    created,
    batches,
    setReply(fn: typeof reply) {
      reply = fn;
    },
  };
}

function suggestion(overrides: Json = {}): Json {
  return {
    rolle: "seo",
    type: "seo_tittel",
    tittel: "Forsiden mangler sted i tittelen",
    side: "",
    seksjon: "",
    felt: "",
    ny_verdi: "Rørlegger i Åmot – rask hjelp",
    ingress: "",
    kanal: "",
    hvorfor: "Tittelen sier ikke hvor du holder til.",
    effekt: "Flere treff på søk med stedsnavn.",
    ...overrides,
  };
}

let db: Db;
let userId: string;
let siteId: string;
let otherSiteId: string;
let ai: ReturnType<typeof fakeAi>;

const setBilling = (id: string, billing: Partial<SiteBilling>) => db.update(sites).set({ billing }).where(eq(sites.id, id));
const pageAt = async (id: string, path: string) => (await db.select().from(pages).where(and(eq(pages.siteId, id), eq(pages.path, path))))[0];
const allSuggestions = (id: string) => db.select().from(aiSuggestions).where(eq(aiSuggestions.siteId, id));

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  const info = { ...demoInfo, phone: "411 22 333", email: "firma@hemmelig-test.no", street: "Hemmeliggata 7" };
  siteId = (await createSiteFromPack(db, { name: "Rørlegger Hansen", packKey: "handverker", info, ownerId: userId })).id;
  otherSiteId = (await createSiteFromPack(db, { name: "Annen bedrift", packKey: "handverker", info, ownerId: userId })).id;
  ai = fakeAi();
  setAiClientForTests(ai.client);
});

afterEach(() => {
  setAiClientForTests(null);
  vi.unstubAllGlobals();
});

describe("tilgang", () => {
  it("gjelder bare tillegget betalt i Stripe, ikke manuell fakturering eller avsluttede abonnement", () => {
    expect(aiTeamActive(ACTIVE_ADDON)).toBe(true);
    expect(aiTeamActive({ ...ACTIVE_ADDON, status: "past_due" })).toBe(true);
    expect(aiTeamActive({ ...ACTIVE_ADDON, addon: false })).toBe(false);
    expect(aiTeamActive({ ...ACTIVE_ADDON, status: "canceled" })).toBe(false);
    expect(aiTeamActive({ manual: true, addon: false, status: "none" })).toBe(false);
    expect(aiTeamActive({})).toBe(false);
  });

  it("kjører ikke og kaller ikke Anthropic uten tillegget", async () => {
    await expect(runNow(db, ai.client, siteId, userId)).rejects.toThrow(/ikke med i abonnementet/);
    expect(ai.client.create).not.toHaveBeenCalled();
    expect(await db.select().from(aiRuns)).toHaveLength(0);
  });
});

describe("forslag", () => {
  beforeEach(() => setBilling(siteId, ACTIVE_ADDON));

  it("lagrer gyldige forslag, forkaster det som peker utenfor nettstedet, og fjerner tankestrek", async () => {
    const home = await pageAt(siteId, "/");
    const otherHome = await pageAt(otherSiteId, "/");
    const section = (home.draft as { sections: { id: string; type: string }[] }).sections.find((s) => s.type === "hero")!;
    ai.setReply(() =>
      message({
        forslag: [
          suggestion({ side: home.id }),
          suggestion({ type: "tekst", rolle: "innhold", side: home.id, seksjon: section.id, felt: "overskrift", ny_verdi: "Rørlegger i Åmot og omegn" }),
          suggestion({ side: otherHome.id }),
          suggestion({ side: "finnes-ikke" }),
          suggestion({ type: "tekst", side: home.id, seksjon: section.id, felt: "bilde" }),
          suggestion({ type: "seo_beskrivelse", side: home.id, ny_verdi: "x".repeat(400) }),
          suggestion({ type: "sosialt_innlegg", rolle: "innhold", kanal: "", ny_verdi: "Uten kanal" }),
          suggestion({ type: "sosialt_innlegg", rolle: "innhold", kanal: "instagram", ny_verdi: "Vi er klare for vinteren. #rørlegger" }),
          { rolle: "seo", type: "noe-annet" },
        ],
      }),
    );
    const result = await runNow(db, ai.client, siteId, userId);
    expect(result.suggestions).toBe(3);
    const rows = await allSuggestions(siteId);
    expect(rows.map((r) => r.kind).sort()).toEqual(["seo_tittel", "sosialt_innlegg", "tekst"]);
    const title = rows.find((r) => r.kind === "seo_tittel")!;
    expect(title.proposal.value).toBe("Rørlegger i Åmot - rask hjelp");
    expect(title.pageId).toBe(home.id);
    expect(title.status).toBe("ny");

    const [run] = await db.select().from(aiRuns);
    expect(run).toMatchObject({ status: "ferdig", trigger: "manuell", suggestionCount: 3, inputTokens: 12_000, outputTokens: 3_000 });
    expect(run.costOre).toBe(costOre({ input_tokens: 12_000, output_tokens: 3_000 }, false));
    expect(run.error).toMatch(/6 forslag forkastet/);
  });

  it("bruker Opus 5.5 med strukturert svar, og ber om svar uten tankestrek", async () => {
    await runNow(db, ai.client, siteId, userId);
    const params = ai.created[0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.output_config?.effort).toBe("medium");
    expect(SYSTEM_PROMPT).toMatch(/aldri tankestrek/);
  });

  it("sender ingenting fra skjemaer, ordre eller kontaktopplysninger til AI-en", async () => {
    await db.update(sites).set({ kind: "nettbutikk" }).where(eq(sites.id, siteId));
    await db.insert(inquiries).values({ siteId, name: "Kari Hemmelig", email: "hemmelig-kunde@test.no", message: "Melding fra skjemaet XYZ" });
    await db.insert(orders).values({
      siteId,
      number: 1001,
      status: "paid",
      customerName: "Kari Hemmelig",
      customerEmail: "hemmelig-kunde@test.no",
      shipping: { code: "hent", name: "Hent selv", priceOre: 0 },
      subtotalOre: 39900,
      shippingOre: 0,
      totalOre: 39900,
      vatOre: 7980,
      paymentMethod: "vipps",
      accessToken: "a".repeat(48),
    });
    const [product] = await db.insert(products).values({ siteId, name: "Strikket lue", slug: "lue", description: "Varm lue i ull.", status: "active" }).returning();
    await db.insert(productVariants).values({ productId: product.id, priceOre: 39900, stock: 0 });

    await runNow(db, ai.client, siteId, userId);
    const sent = JSON.stringify(ai.created[0]);
    for (const marker of SECRET_MARKERS) expect(sent).not.toContain(marker);
    expect(sent).not.toMatch(/\/media\/|https?:\/\//);
    expect(sent).toContain("Strikket lue");
    expect(sent).toContain("Rørlegger Hansen");
    expect(sent).toContain("Åmot");
  });

  it("Godkjenn endrer bare kladden, og det publiserte nettstedet er uendret til kunden publiserer", async () => {
    const home = await pageAt(siteId, "/");
    await db.update(pages).set({ draft: { ...(home.draft as Json), seo: { title: "Gammel tittel" } } as never }).where(eq(pages.id, home.id));
    await publishPage(db, home.id, userId, { allowPlaceholders: true });
    ai.setReply(() => message({ forslag: [suggestion({ side: home.id, ny_verdi: "Rørlegger i Åmot" })] }));
    await runNow(db, ai.client, siteId, userId);
    const [row] = await allSuggestions(siteId);
    expect(row.before).toBe("Gammel tittel");

    // Ingenting er endret før Godkjenn.
    expect(((await pageAt(siteId, "/")).draft as { seo: { title: string } }).seo.title).toBe("Gammel tittel");

    const result = await approveSuggestion(db, siteId, row.id, userId);
    expect(result.pageId).toBe(home.id);
    const after = await pageAt(siteId, "/");
    expect((after.draft as { seo: { title: string } }).seo.title).toBe("Rørlegger i Åmot");
    const [live] = await db.select().from(pageVersions).where(eq(pageVersions.id, after.publishedVersionId!));
    expect(live.content.seo.title).toBe("Gammel tittel");
    expect((await allSuggestions(siteId))[0]).toMatchObject({ status: "godkjent", decidedBy: userId });

    await expect(approveSuggestion(db, siteId, row.id, userId)).rejects.toThrow(/allerede behandlet/);
  });

  it("overskriver ikke tekst kunden har endret etter at forslaget ble laget", async () => {
    const home = await pageAt(siteId, "/");
    ai.setReply(() => message({ forslag: [suggestion({ side: home.id })] }));
    await runNow(db, ai.client, siteId, userId);
    const [row] = await allSuggestions(siteId);
    await db.update(pages).set({ draft: { ...(home.draft as Json), seo: { title: "Kundens egen tittel" } } as never }).where(eq(pages.id, home.id));

    await expect(approveSuggestion(db, siteId, row.id, userId)).rejects.toThrow(/endret siden forslaget ble laget/);
    expect(((await pageAt(siteId, "/")).draft as { seo: { title: string } }).seo.title).toBe("Kundens egen tittel");
    expect((await allSuggestions(siteId))[0].status).toBe("utdatert");
  });

  it("Avvis endrer ingenting, og et forslag kan ikke behandles fra et annet nettsted", async () => {
    const home = await pageAt(siteId, "/");
    ai.setReply(() => message({ forslag: [suggestion({ side: home.id })] }));
    await runNow(db, ai.client, siteId, userId);
    const [row] = await allSuggestions(siteId);

    await expect(approveSuggestion(db, otherSiteId, row.id, userId)).rejects.toThrow(/Fant ikke forslaget/);
    await expect(rejectSuggestion(db, otherSiteId, row.id, userId)).rejects.toThrow(/Fant ikke forslaget/);

    await rejectSuggestion(db, siteId, row.id, userId);
    expect((await pageAt(siteId, "/")).draft).toEqual(home.draft);
    expect((await allSuggestions(siteId))[0].status).toBe("avvist");
  });

  it("blogginnlegg blir en upublisert kladd under /blogg", async () => {
    ai.setReply(() =>
      message({
        forslag: [suggestion({ rolle: "innhold", type: "blogginnlegg", tittel: "Slik unngår du frosne rør", ingress: "Fem enkle grep før kulda kommer.", ny_verdi: "Steng vannet.\n\nIsoler rørene." })],
      }),
    );
    await runNow(db, ai.client, siteId, userId);
    const [row] = await allSuggestions(siteId);
    const result = await approveSuggestion(db, siteId, row.id, userId);
    const [post] = await db.select().from(pages).where(eq(pages.id, result.pageId!));
    expect(post.path).toBe("/blogg/slik-unngar-du-frosne-ror");
    expect(post.publishedVersionId).toBeNull();
    expect(JSON.stringify(post.draft)).toContain("Isoler rørene.");
    expect(JSON.stringify(post.draft)).toContain("Fem enkle grep før kulda kommer.");
  });
});

describe("kostnadstak", () => {
  beforeEach(() => setBilling(siteId, ACTIVE_ADDON));

  it("stopper når månedens tak er nådd, uten å kalle Anthropic, og starter igjen neste måned", async () => {
    const now = new Date("2026-11-20T12:00:00Z");
    await db.insert(aiRuns).values([
      { siteId, trigger: "natt", status: "ferdig", model: "claude-opus-5-5", costOre: MONTHLY_CAP_ORE - 100, createdAt: new Date("2026-11-02T03:00:00Z") },
      { siteId, trigger: "natt", status: "ferdig", model: "claude-opus-5-5", costOre: 99_999, createdAt: new Date("2026-10-30T03:00:00Z") },
    ]);
    await expect(runNow(db, ai.client, siteId, userId, now)).rejects.toThrow(CAP_REACHED);
    expect(ai.client.create).not.toHaveBeenCalled();

    expect((await runNow(db, ai.client, siteId, userId, new Date("2026-12-01T08:00:00Z"))).suggestions).toBe(0);
    expect(ai.client.create).toHaveBeenCalledTimes(1);
  });

  it("regner kostnaden i øre, med halv pris i Batch API", () => {
    // 12 000 inn og 3 000 ut: 0,048 + 0,06 = 0,108 dollar, 124,2 øre rundet opp.
    expect(costOre({ input_tokens: 12_000, output_tokens: 3_000 }, false)).toBe(125);
    expect(costOre({ input_tokens: 12_000, output_tokens: 3_000 }, true)).toBe(63);
  });
});

describe("nattkjøringen", () => {
  it("sender én forespørsel per nettsted med tillegg og plass under taket, og henter svarene én gang", async () => {
    const third = (await createSiteFromPack(db, { name: "Tredje", packKey: "handverker", info: demoInfo, ownerId: userId })).id;
    await setBilling(siteId, ACTIVE_ADDON);
    await setBilling(otherSiteId, { ...ACTIVE_ADDON, status: "canceled" });
    await setBilling(third, ACTIVE_ADDON);
    await db.insert(aiRuns).values({ siteId: third, trigger: "manuell", status: "ferdig", model: "claude-opus-5-5", costOre: MONTHLY_CAP_ORE });

    const home = await pageAt(siteId, "/");
    ai.setReply(() => message({ forslag: [suggestion({ side: home.id })] }));
    expect(await startNightly(db, ai.client)).toEqual({ queued: 1, skipped: 1 });
    expect(await startNightly(db, ai.client)).toEqual({ queued: 0, skipped: 1 });
    const [batch] = [...ai.batches.values()];
    expect(batch.requests).toHaveLength(1);

    // Ikke ferdig ennå: ingenting skjer.
    expect(await collectBatches(db, ai.client)).toEqual({ finished: 0 });
    batch.status = "ended";
    expect(await collectBatches(db, ai.client)).toEqual({ finished: 1 });
    expect(await collectBatches(db, ai.client)).toEqual({ finished: 0 });

    const rows = await allSuggestions(siteId);
    expect(rows).toHaveLength(1);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.siteId, siteId));
    expect(run).toMatchObject({ status: "ferdig", trigger: "natt", costOre: costOre({ input_tokens: 12_000, output_tokens: 3_000 }, true) });
  });

  it("bakgrunnsjobbene krever nøkkelen", async () => {
    for (const route of [nightlyRoute, collectRoute]) {
      expect((await route(new Request("https://intern/api/cron/ai", { method: "POST", headers: { "x-cron-key": "feil" } }))).status).toBe(403);
    }
    const key = await cronKey(process.env.SESSION_SECRET!);
    const res = await collectRoute(new Request("https://intern/api/cron/ai", { method: "POST", headers: { "x-cron-key": key } }));
    expect(await res.json()).toEqual({ finished: 0 });
  });

  it("et svar som ikke kan leses, gir feilet kjøring og ingen forslag", async () => {
    await setBilling(siteId, ACTIVE_ADDON);
    ai.setReply(() => message("ikke json"));
    await expect(runNow(db, ai.client, siteId, userId)).rejects.toThrow(/klarte ikke/);
    expect((await db.select().from(aiRuns))[0]).toMatchObject({ status: "feilet" });
    expect(await allSuggestions(siteId)).toHaveLength(0);
  });
});

describe("tillegget i Stripe", () => {
  function fakeStripe() {
    const posted: { path: string; body: URLSearchParams }[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const price = (key: string) => {
      const s = PRICE_SPECS.find((p) => p.lookupKey === key)!;
      return { id: `price_${key}`, active: true, currency: "nok", unit_amount: s.amountOre, lookup_key: key, type: "recurring", recurring: { interval: s.interval, interval_count: 1 }, tax_behavior: "exclusive" };
    };
    const items = [{ id: "si_plan", price: price("nettgata_nettside_mnd"), current_period_end: 1796083200 }];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      if (method === "GET" && url.pathname === "/v1/prices") {
        const keys = [...url.searchParams.entries()].filter(([k]) => k.startsWith("lookup_keys")).map(([, v]) => v);
        return json({ object: "list", data: keys.map(price), has_more: false });
      }
      if (url.pathname === "/v1/tax_rates") return json({ object: "list", data: [{ id: "txr_mva", active: true, percentage: 25, inclusive: false, country: "NO" }], has_more: false });
      if (url.pathname === "/v1/subscriptions/sub_1") {
        if (method === "POST") {
          const body = new URLSearchParams(String(init?.body ?? ""));
          posted.push({ path: url.pathname, body });
          if (body.get("items[0][deleted]") === "true") items.splice(items.findIndex((i) => i.id === body.get("items[0][id]")), 1);
          else items.push({ id: "si_ai", price: price("nettgata_tillegg_ai_mnd"), current_period_end: 1796083200 });
        }
        return json({ id: "sub_1", status: "active", customer: "cus_1", metadata: { siteId }, cancel_at_period_end: false, cancel_at: null, items: { data: items } });
      }
      return json({ error: { message: "ukjent" } }, 404);
    });
    return { posted, client: createStripeClient("sk_test_123", { fetch }) };
  }

  it("legger til og fjerner AI-teamet på abonnementet som løper, med mva og forholdsmessig pris", async () => {
    await setBilling(siteId, { ...ACTIVE_ADDON, addon: false });
    const stripe = fakeStripe();
    const site = async () => (await db.select().from(sites).where(eq(sites.id, siteId)))[0];

    await addAiAddon(db, stripe.client, await site(), userId);
    const add = stripe.posted[0].body;
    expect(add.get("items[0][price]")).toBe("price_nettgata_tillegg_ai_mnd");
    expect(add.get("items[0][tax_rates][0]")).toBe("txr_mva");
    expect(add.get("proration_behavior")).toBe("create_prorations");
    expect(readBilling((await site()).billing).addon).toBe(true);
    expect(aiTeamActive((await site()).billing)).toBe(true);
    await expect(addAiAddon(db, stripe.client, await site(), userId)).rejects.toThrow(/allerede med/);

    await removeAiAddon(db, stripe.client, await site(), userId);
    expect(stripe.posted[1].body.get("items[0][id]")).toBe("si_ai");
    expect(readBilling((await site()).billing).addon).toBe(false);
  });

  it("krever et aktivt abonnement i Stripe", async () => {
    const stripe = fakeStripe();
    await setBilling(siteId, { manual: true });
    await expect(addAiAddon(db, stripe.client, { id: siteId, billing: { manual: true } }, userId)).rejects.toThrow(/utenom kortbetaling/);
    await expect(addAiAddon(db, stripe.client, { id: siteId, billing: {} }, userId)).rejects.toThrow(/aktivt abonnement/);
  });
});

describe("tekst og personvern", () => {
  it("avviste forslag slettes etter 90 dager, godkjente beholdes", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const base = { siteId, role: "seo", kind: "tips", title: "Tips", proposal: { value: "x" }, reason: "r", effect: "e", createdAt: old };
    await db.insert(aiSuggestions).values([
      { ...base, status: "avvist" },
      { ...base, status: "utdatert" },
      { ...base, status: "godkjent" },
      { ...base, status: "avvist", createdAt: new Date("2026-10-30T00:00:00Z") },
    ]);
    const result = await runRetention(db, new Date("2026-11-01T00:00:00Z"));
    expect(result.aiSuggestions).toBe(2);
    expect((await allSuggestions(siteId)).map((s) => s.status).sort()).toEqual(["avvist", "godkjent"]);
  });

  it("teksten kunden ser, har ingen tankestrek", () => {
    expect(cleanText("Rask hjelp – hele døgnet—også i helgen")).toBe("Rask hjelp - hele døgnet - også i helgen");
    const files = [
      "app/studio/nettsted/[siteId]/ai-teamet/page.tsx",
      "app/studio/nettsted/[siteId]/ai-teamet/suggestion-card.tsx",
      "app/studio/nettsted/[siteId]/ai-teamet/actions.ts",
      "app/studio/nettsted/[siteId]/abonnement/addon-toggle.tsx",
      "lib/ai/runs.ts",
      "lib/ai/suggestions.ts",
      "lib/billing/addon.ts",
    ];
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/[–—]/);
    expect(ADDON.includes).not.toMatch(/[–—]/);
    // Systemprompten nevner tegnene bare for å forby dem.
    expect(SYSTEM_PROMPT.replace("(– eller —)", "")).not.toMatch(/[–—]/);
  });
});

it("blogginnlegg fra createPost brukes uendret som grunnlag", async () => {
  // Godkjenning av blogginnlegg forutsetter at nye innlegg har seksjonene «ingress» og «tekst».
  const post = await createPost(db, siteId, { title: "Test" }, userId);
  const ids = (post.draft as { sections: { id: string }[] }).sections.map((s) => s.id);
  expect(ids).toEqual(["ingress", "tekst"]);
});
