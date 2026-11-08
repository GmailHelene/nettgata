import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { aiRuns, aiSuggestions, auditLog, pages, sites } from "@/db/schema";
import { sectionTypes } from "@/lib/content/types";
import { osloDate, osloMidnight } from "@/lib/oslo-time";
import { aiTeamActive, weeklyAiActive } from "./access";
import type { AiClient } from "./client";
import type { EmailProvider } from "@/lib/email/send";
import { notifyWeeklySuggestions } from "@/lib/rapport/ai-epost";
import { AI_MODEL, costOre, MONTHLY_CAP_ORE, RUN_ESTIMATE_ORE, WEEKLY_CAP_ORE, WEEKLY_MIN_GAP_MS, WEEKLY_RUN_ESTIMATE_ORE, type AiTier } from "./config";
import { buildSiteContext, editableTextFields } from "./context";
import { messageParams, outputSchema, type PromptInput } from "./prompt";
import { previousTitles, validateSuggestions } from "./suggestions";

/** En nattkjøring som ikke er ferdig etter så lang tid, regnes som feilet. Anthropic lover svar innen 24 timer. */
const BATCH_GIVE_UP_MS = 26 * 3_600_000;

export class AiRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRunError";
  }
}

/** Første dag i måneden, midnatt norsk tid. Taket gjelder kalendermåneden. */
export function osloMonthStart(now: Date): Date {
  const [year, month] = osloDate(now).split("-").map(Number);
  return osloMidnight(year, month, 1);
}

export const CAP_REACHED = "AI-teamet har brukt det som er satt av for denne måneden, og tar en pause til den 1. i neste måned.";

/** Brukt denne måneden i øre. Kjøringer som venter, regnes med en antatt pris, så taket holder også da. */
export async function spentThisMonth(db: Db, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({
      done: sql<number>`coalesce(sum(${aiRuns.costOre}), 0)::int`,
      waiting: sql<number>`count(*) filter (where ${aiRuns.status} = 'venter' and ${aiRuns.trigger} <> 'uke')::int`,
      waitingWeekly: sql<number>`count(*) filter (where ${aiRuns.status} = 'venter' and ${aiRuns.trigger} = 'uke')::int`,
    })
    .from(aiRuns)
    .where(and(eq(aiRuns.siteId, siteId), gte(aiRuns.createdAt, osloMonthStart(now))));
  return Number(row.done) + Number(row.waiting) * RUN_ESTIMATE_ORE + Number(row.waitingWeekly) * WEEKLY_RUN_ESTIMATE_ORE;
}

/** Taket og antatt pris for én kjøring i hvert nivå. Den ukentlige rapporten har sitt eget, lavere tak. */
export const TIER_LIMITS: Record<AiTier, { capOre: number; estimateOre: number }> = {
  daglig: { capOre: MONTHLY_CAP_ORE, estimateOre: RUN_ESTIMATE_ORE },
  ukentlig: { capOre: WEEKLY_CAP_ORE, estimateOre: WEEKLY_RUN_ESTIMATE_ORE },
};

export async function underCap(db: Db, siteId: string, now = new Date(), tier: AiTier = "daglig"): Promise<boolean> {
  const { capOre, estimateOre } = TIER_LIMITS[tier];
  return (await spentThisMonth(db, siteId, now)) + estimateOre <= capOre;
}

/** «uke» for den ukentlige rapporten, ellers det daglige tillegget (natt og manuell). */
const tierOf = (trigger: string): AiTier => (trigger === "uke" ? "ukentlig" : "daglig");

const editableFields = Object.fromEntries(sectionTypes.map((t) => [t, editableTextFields(t)]));

const todayLabel = (now: Date) =>
  new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" }).format(now);

async function promptInput(db: Db, siteId: string, now: Date): Promise<PromptInput> {
  return { context: await buildSiteContext(db, siteId), previousTitles: await previousTitles(db, siteId, now), today: todayLabel(now), editableFields };
}

/** Lagrer forslagene fra ett svar og avslutter kjøringen med tokens og kostnad. */
async function finishRun(db: Db, runId: string, siteId: string, message: Anthropic.Message, batch: boolean, tier: AiTier = "daglig") {
  const usage = message.usage;
  const cost = costOre(usage, batch);
  const tokens = { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costOre: cost, finishedAt: new Date() };

  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    const error = message.stop_reason === "refusal" ? "Modellen avslo forespørselen" : "Svaret ble for langt og ble kuttet";
    await db.update(aiRuns).set({ ...tokens, status: "feilet", error }).where(eq(aiRuns.id, runId));
    return { suggestions: 0, error, first: false };
  }

  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let raw: unknown[] = [];
  try {
    const parsed = outputSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error("feil form");
    raw = parsed.data.forslag;
  } catch {
    await db.update(aiRuns).set({ ...tokens, status: "feilet", error: "Svaret kunne ikke leses" }).where(eq(aiRuns.id, runId));
    return { suggestions: 0, error: "Svaret kunne ikke leses", first: false };
  }

  const sitePages = await db.select({ id: pages.id, draft: pages.draft }).from(pages).where(eq(pages.siteId, siteId));
  const { accepted, rejected } = validateSuggestions(raw, sitePages, siteId, runId, tier);
  if (accepted.length) await db.insert(aiSuggestions).values(accepted);
  // Bare den som avslutter kjøringen, får first = true. Da sendes e-posten om nye forslag bare én gang.
  const closed = await db
    .update(aiRuns)
    .set({ ...tokens, status: "ferdig", suggestionCount: accepted.length, error: rejected ? `${rejected} forslag forkastet` : null })
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "venter")))
    .returning({ id: aiRuns.id });
  return { suggestions: accepted.length, error: null, first: closed.length > 0 };
}

/**
 * «Lag nye forslag nå» i studioet. Kalles bare etter at tilgang, tillegg og døgngrense er sjekket (actions.ts),
 * men tillegget og kostnadstaket sjekkes her også, så funksjonen er trygg å kalle fra andre steder.
 */
export async function runNow(db: Db, client: AiClient, siteId: string, userId: string, now = new Date()) {
  const [site] = await db.select({ billing: sites.billing }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || !aiTeamActive(site.billing)) throw new AiRunError("AI-teamet er ikke med i abonnementet ditt.");
  if (!(await underCap(db, siteId, now))) throw new AiRunError(CAP_REACHED);

  const [run] = await db.insert(aiRuns).values({ siteId, trigger: "manuell", model: AI_MODEL }).returning({ id: aiRuns.id });
  await db.insert(auditLog).values({ siteId, userId, action: "ai.run_started", detail: { runId: run.id } });
  let message: Anthropic.Message;
  try {
    message = await client.create(messageParams(await promptInput(db, siteId, now)));
  } catch (err) {
    console.error("AI-teamet feilet", err);
    await db.update(aiRuns).set({ status: "feilet", error: err instanceof Error ? err.message.slice(0, 300) : "Ukjent feil", finishedAt: new Date() }).where(eq(aiRuns.id, run.id));
    throw new AiRunError("AI-teamet svarer ikke akkurat nå. Prøv igjen om litt.");
  }
  const result = await finishRun(db, run.id, siteId, message, false);
  if (result.error) throw new AiRunError("AI-teamet klarte ikke å lage forslag denne gangen. Prøv igjen senere.");
  return result;
}

/**
 * Nattkjøringen: én forespørsel per nettsted med aktivt tillegg, sendt samlet til Batch API (halv pris).
 * Svarene hentes av collectBatches hvert tiende minutt.
 */
export async function startNightly(db: Db, client: AiClient, now = new Date()) {
  const candidates = await db
    .select({ id: sites.id, billing: sites.billing })
    .from(sites)
    .where(sql`(${sites.billing}->>'addon')::boolean is true`);
  const dayStart = new Date(now.getTime() - 20 * 3_600_000);
  const queued: { runId: string; siteId: string; params: Anthropic.MessageCreateParamsNonStreaming }[] = [];
  let skipped = 0;

  for (const site of candidates) {
    if (!aiTeamActive(site.billing)) continue;
    const [recent] = await db
      .select({ id: aiRuns.id })
      .from(aiRuns)
      .where(and(eq(aiRuns.siteId, site.id), eq(aiRuns.trigger, "natt"), gte(aiRuns.createdAt, dayStart)))
      .limit(1);
    if (recent) continue;
    if (!(await underCap(db, site.id, now))) {
      skipped++;
      continue;
    }
    const params = messageParams(await promptInput(db, site.id, now));
    const [run] = await db.insert(aiRuns).values({ siteId: site.id, trigger: "natt", model: AI_MODEL, createdAt: now }).returning({ id: aiRuns.id });
    queued.push({ runId: run.id, siteId: site.id, params });
  }
  if (!queued.length) return { queued: 0, skipped };

  try {
    const batch = await client.createBatch(queued.map((q) => ({ custom_id: q.runId, params: q.params })));
    await db.update(aiRuns).set({ batchId: batch.id }).where(inArray(aiRuns.id, queued.map((q) => q.runId)));
  } catch (err) {
    console.error("Klarte ikke å sende nattkjøringen til Anthropic", err);
    await db
      .update(aiRuns)
      .set({ status: "feilet", error: "Batchen kunne ikke sendes", finishedAt: new Date() })
      .where(inArray(aiRuns.id, queued.map((q) => q.runId)));
    throw err;
  }
  return { queued: queued.length, skipped };
}

/** Har nettstedet minst én publisert side? Den ukentlige rapporten er bare for nettsteder som er ute. */
async function isPublished(db: Db, siteId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.siteId, siteId), isNotNull(pages.publishedVersionId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Den ukentlige AI-rapporten, med i grunnprisen. Kalles hver natt sammen med startNightly, men et nettsted får høyst
 * én kjøring per uke (WEEKLY_MIN_GAP_MS). Bare publiserte nettsteder uten tillegget, med betalt abonnement eller
 * «Fakturert utenom Stripe» (weeklyAiActive), og med plass under det ukentlige taket. Samme Batch API og samme
 * Godkjenn som tillegget, men færre forslag og lavere innsats.
 */
export async function startWeekly(db: Db, client: AiClient, now = new Date()) {
  const candidates = await db
    .select({ id: sites.id, billing: sites.billing })
    .from(sites)
    .where(sql`(${sites.billing}->>'addon')::boolean is not true`);
  const since = new Date(now.getTime() - WEEKLY_MIN_GAP_MS);
  const queued: { runId: string; params: Anthropic.MessageCreateParamsNonStreaming }[] = [];
  let skipped = 0;

  for (const site of candidates) {
    if (!weeklyAiActive(site.billing)) continue;
    const [recent] = await db
      .select({ id: aiRuns.id })
      .from(aiRuns)
      .where(and(eq(aiRuns.siteId, site.id), eq(aiRuns.trigger, "uke"), gte(aiRuns.createdAt, since)))
      .limit(1);
    if (recent || !(await isPublished(db, site.id))) continue;
    if (!(await underCap(db, site.id, now, "ukentlig"))) {
      skipped++;
      continue;
    }
    const params = messageParams(await promptInput(db, site.id, now), "ukentlig");
    const [run] = await db.insert(aiRuns).values({ siteId: site.id, trigger: "uke", model: AI_MODEL, createdAt: now }).returning({ id: aiRuns.id });
    queued.push({ runId: run.id, params });
  }
  if (!queued.length) return { queued: 0, skipped };

  try {
    const batch = await client.createBatch(queued.map((q) => ({ custom_id: q.runId, params: q.params })));
    await db.update(aiRuns).set({ batchId: batch.id }).where(inArray(aiRuns.id, queued.map((q) => q.runId)));
  } catch (err) {
    console.error("Klarte ikke å sende den ukentlige AI-rapporten til Anthropic", err);
    await db
      .update(aiRuns)
      .set({ status: "feilet", error: "Batchen kunne ikke sendes", finishedAt: new Date() })
      .where(inArray(aiRuns.id, queued.map((q) => q.runId)));
    throw err;
  }
  return { queued: queued.length, skipped };
}

/**
 * Henter svarene fra ferdige batcher. Trygg å kalle ofte: en kjøring behandles bare én gang.
 * Gir en ukentlig kjøring nye forslag, får eieren en kort e-post om det (når provider er med).
 */
export async function collectBatches(db: Db, client: AiClient, now = new Date(), provider?: EmailProvider) {
  const waiting = await db
    .selectDistinct({ batchId: aiRuns.batchId })
    .from(aiRuns)
    .where(and(eq(aiRuns.status, "venter"), isNotNull(aiRuns.batchId)));
  let finished = 0;

  for (const { batchId } of waiting) {
    if (!batchId || (await client.batchStatus(batchId)) !== "ended") continue;
    for await (const item of await client.batchResults(batchId)) {
      const [run] = await db
        .select({ id: aiRuns.id, siteId: aiRuns.siteId, trigger: aiRuns.trigger })
        .from(aiRuns)
        .where(and(eq(aiRuns.id, item.custom_id), eq(aiRuns.batchId, batchId), eq(aiRuns.status, "venter")))
        .limit(1);
      if (!run) continue;
      if (item.result.type === "succeeded") {
        const tier = tierOf(run.trigger);
        const result = await finishRun(db, run.id, run.siteId, item.result.message, true, tier);
        if (tier === "ukentlig" && result.suggestions > 0 && result.first && provider) {
          await notifyWeeklySuggestions(db, provider, run.siteId, result.suggestions).catch((err) => console.error("E-post om ukentlige forslag feilet", err));
        }
      } else {
        await db.update(aiRuns).set({ status: "feilet", error: `Batch: ${item.result.type}`, finishedAt: new Date() }).where(eq(aiRuns.id, run.id));
      }
      finished++;
    }
    // Kjøringer batchen ikke hadde svar på.
    await db
      .update(aiRuns)
      .set({ status: "feilet", error: "Mangler i svaret fra batchen", finishedAt: new Date() })
      .where(and(eq(aiRuns.batchId, batchId), eq(aiRuns.status, "venter")));
  }

  // Kjøringer som aldri ble sendt eller aldri ble ferdige, skal ikke holde av plass under taket for alltid.
  await db
    .update(aiRuns)
    .set({ status: "feilet", error: "Tidsavbrudd", finishedAt: new Date() })
    .where(and(eq(aiRuns.status, "venter"), lt(aiRuns.createdAt, new Date(now.getTime() - BATCH_GIVE_UP_MS))));
  return { finished };
}
