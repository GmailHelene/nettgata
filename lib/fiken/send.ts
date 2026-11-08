import { and, asc, desc, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, creditNotes, orderLines, orders, sites } from "@/db/schema";
import { addDays, parseOsloDate } from "@/lib/oslo-time";
import { parsePaymentRef } from "@/lib/payments/common";
import { ShopError } from "@/lib/shop/catalog";
import { reportPresets } from "@/lib/shop/reports";
import { FikenError, createSale, findSalesByNumber } from "./client";
import { fikenAccessToken, markFikenProblem, requireCompany } from "./config";
import { saleFromOrder } from "./mapping";
import { fikenMethods, type FikenMethod } from "./state";

/**
 * Sender betalte og sendte ordre til Fiken som salg, én ordre om gangen.
 *
 * Ingen ordre sendes to ganger: før sending sjekkes revisjonsloggen etter «order.fiken_sent» for ordren, og den samme
 * handlingen logges med saleId etterpå. Svarte ikke Fiken (tidsavbrudd eller feil hos Fiken), vet vi ikke om salget ble
 * lagret. Da spør vi Fiken etter salgsnummeret før neste forsøk. To sendinger for samme butikk kan ikke gå samtidig.
 */

/** Fiken tillater ett kall om gangen og bremser over fire kall i sekundet. */
const PAUSE_MS = 250;
/** Så ett trykk ikke blir et kall som varer i minutter. Resten sendes ved neste trykk. */
const MAX_PER_RUN = 40;
const LOCK_MS = 5 * 60_000;

const sendStatuses = ["paid", "fulfilled"] as const;

export const fikenPeriodKeys = ["maned", "forrige-maned"] as const;
export type FikenPeriodKey = (typeof fikenPeriodKeys)[number];
export type FikenPeriod = { key: FikenPeriodKey; label: string; from: string; to: string };

const monthName = (date: string) => new Date(`${date.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("nb-NO", { timeZone: "UTC", month: "long" });

/** Denne og forrige måned, i norsk tid, som i salgs- og MVA-rapporten. Ordren hører til måneden den ble bestilt. */
export function fikenPeriods(now = new Date()): FikenPeriod[] {
  const presets = reportPresets(now);
  return fikenPeriodKeys.map((key) => {
    const p = presets.find((x) => x.key === key)!;
    return { key, label: key === "maned" ? `Denne måneden (${monthName(p.from)})` : p.label, from: p.from, to: p.to };
  });
}

export type FikenSendResult = {
  period: FikenPeriod;
  sent: { orderId: string; number: number; saleId: string | null }[];
  failed: { orderId: string; number: number; message: string }[];
  alreadySent: number;
  skipped: { method: number; test: number; zero: number };
  /** Ordre som skal sendes, men som ikke ble forsøkt i denne runden. */
  remaining: number;
  /** Hvorfor sendingen stoppet før den var ferdig, for eksempel at Fiken ikke godtar nøkkelen lenger. */
  stopped: string | null;
};

/** Sperre i sites.shop.fiken.lockUntil, satt i én SQL-setning, så bare én sending vinner. */
async function claimLock(db: Db, siteId: string, nowMs: number): Promise<number | null> {
  const until = nowMs + LOCK_MS;
  const claimed = await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{fiken,lockUntil}', to_jsonb(${until}::bigint))` })
    .where(
      and(
        eq(sites.id, siteId),
        sql`jsonb_typeof(${sites.shop} -> 'fiken') = 'object'`,
        sql`coalesce((${sites.shop} -> 'fiken' ->> 'lockUntil')::bigint, 0) < ${nowMs}::bigint`,
      ),
    )
    .returning({ id: sites.id });
  return claimed.length === 1 ? until : null;
}

async function releaseLock(db: Db, siteId: string, until: number) {
  await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{fiken,lockUntil}', '0'::jsonb)` })
    .where(and(eq(sites.id, siteId), sql`${sites.shop} -> 'fiken' ->> 'lockUntil' = ${String(until)}`));
}

const isFikenMethod = (method: string): method is FikenMethod => (fikenMethods as readonly string[]).includes(method);

export async function sendOrdersToFiken(
  db: Db,
  siteId: string,
  periodKey: FikenPeriodKey,
  userId: string | null,
  opts: { now?: Date; pauseMs?: number; maxOrders?: number } = {},
): Promise<FikenSendResult> {
  const period = fikenPeriods(opts.now ?? new Date()).find((p) => p.key === periodKey);
  if (!period) throw new ShopError("Velg denne eller forrige måned");
  // Tilgangsnøkkelen fra OAuth2. Går den snart ut, fornyes den her, før sperren og før første kall.
  const { token, stored } = await fikenAccessToken(db, siteId);
  const companySlug = requireCompany(stored);
  const accounts = stored.settings.paymentAccounts;
  if (!fikenMethods.some((m) => accounts[m])) throw new ShopError("Velg minst én betalingsmåte under «Hvilke ordre som sendes», og lagre valgene.");

  const lock = await claimLock(db, siteId, Date.now());
  if (lock === null) throw new ShopError("Ordrene sendes til Fiken akkurat nå. Vent litt og last siden på nytt.");
  try {
    const result: FikenSendResult = { period, sent: [], failed: [], alreadySent: 0, skipped: { method: 0, test: 0, zero: 0 }, remaining: 0, stopped: null };
    const start = parseOsloDate(period.from)!;
    const end = parseOsloDate(addDays(period.to, 1))!;
    const candidates = await db
      .select()
      .from(orders)
      .where(and(eq(orders.siteId, siteId), inArray(orders.status, [...sendStatuses]), gte(orders.createdAt, start), lt(orders.createdAt, end)))
      .orderBy(asc(orders.number));

    const ids = candidates.map((o) => o.id);
    const history = ids.length
      ? await db
          .select({ action: auditLog.action, orderId: sql<string>`${auditLog.detail} ->> 'orderId'`, uncertain: sql<string | null>`${auditLog.detail} ->> 'uncertain'` })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.siteId, siteId),
              inArray(auditLog.action, ["order.fiken_sent", "order.fiken_failed"]),
              inArray(sql`${auditLog.detail} ->> 'orderId'`, ids),
            ),
          )
      : [];
    const sentIds = new Set(history.filter((h) => h.action === "order.fiken_sent").map((h) => h.orderId));
    const uncertainIds = new Set(history.filter((h) => h.action === "order.fiken_failed" && h.uncertain === "true").map((h) => h.orderId));

    const queue: (typeof candidates)[number][] = [];
    for (const o of candidates) {
      if (sentIds.has(o.id)) result.alreadySent++;
      // Testbetaling, eller betalt i testmiljøet hos Vipps eller Klarna: ingen ekte penger. Bare til et testselskap i Fiken.
      else if (o.paymentMethod === "test" || (parsePaymentRef(o.paymentRef)?.environment === "test" && !stored.testCompany)) result.skipped.test++;
      else if (!isFikenMethod(o.paymentMethod) || !accounts[o.paymentMethod]) result.skipped.method++;
      else if (o.totalOre <= 0) result.skipped.zero++;
      else queue.push(o);
    }
    const batch = queue.slice(0, opts.maxOrders ?? MAX_PER_RUN);
    result.remaining = queue.length - batch.length;

    const lines = batch.length
      ? await db
          .select({ orderId: orderLines.orderId, totalOre: orderLines.totalOre, vatRate: orderLines.vatRate })
          .from(orderLines)
          .where(inArray(orderLines.orderId, batch.map((o) => o.id)))
      : [];
    const linesByOrder = new Map<string, typeof lines>();
    for (const l of lines) linesByOrder.set(l.orderId, [...(linesByOrder.get(l.orderId) ?? []), l]);

    const pauseMs = opts.pauseMs ?? PAUSE_MS;
    let calls = 0;
    const pause = async () => {
      if (calls++ > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    };
    const logSent = (o: (typeof batch)[number], saleId: string | null, recovered: boolean) =>
      db.insert(auditLog).values({
        siteId,
        userId,
        action: "order.fiken_sent",
        detail: { orderId: o.id, number: o.number, saleId, companySlug: companySlug, amountOre: o.totalOre, ...(recovered && { recovered: true }) },
      });

    let networkFailures = 0;
    for (let i = 0; i < batch.length; i++) {
      const o = batch[i];
      try {
        const sale = saleFromOrder(o, linesByOrder.get(o.id) ?? [], {
          paymentAccount: accounts[o.paymentMethod as FikenMethod]!,
          incomeAccount: stored.settings.incomeAccount,
          zeroVatIncomeAccount: stored.settings.zeroVatIncomeAccount,
          vatRegistered: stored.vatRegistered,
        });
        if (uncertainIds.has(o.id)) {
          // Forrige forsøk fikk ikke svar. Finnes salget allerede i Fiken, er ordren sendt, og vi sender den ikke igjen.
          await pause();
          const found = await findSalesByNumber(token, companySlug, sale.saleNumber);
          const same = found.find((f) => f.date === sale.date && f.grossOre === o.totalOre);
          if (same) {
            await logSent(o, same.saleId, true);
            result.sent.push({ orderId: o.id, number: o.number, saleId: same.saleId });
            networkFailures = 0;
            continue;
          }
          if (found.length > 0) throw new ShopError(`Fiken har allerede et salg med nummer ${sale.saleNumber} som ikke stemmer med ordren. Sjekk salget i Fiken.`);
        }
        await pause();
        const { saleId } = await createSale(token, companySlug, sale);
        await logSent(o, saleId, false);
        result.sent.push({ orderId: o.id, number: o.number, saleId });
        networkFailures = 0;
      } catch (err) {
        // Nøkkel, tilgang, selskap eller for mange kall: resten vil feile likt, så vi stopper og prøver ikke flere.
        if (err instanceof FikenError && err.info.stop) {
          result.stopped = err.message;
          result.remaining += batch.length - i;
          if ([401, 403, 404].includes(err.info.status)) await markFikenProblem(db, siteId, stored.connectionId, err.message);
          break;
        }
        if (!(err instanceof ShopError)) console.error("Sending av ordre til Fiken feilet", err instanceof Error ? err.name : "ukjent feil");
        const message = err instanceof ShopError ? err.message : "Noe gikk galt med denne ordren. Prøv igjen.";
        const uncertain = err instanceof FikenError && err.info.uncertain;
        result.failed.push({ orderId: o.id, number: o.number, message });
        await db.insert(auditLog).values({
          siteId,
          userId,
          action: "order.fiken_failed",
          detail: { orderId: o.id, number: o.number, status: err instanceof FikenError ? err.info.status : null, uncertain },
        });
        // Får vi ikke kontakt to ganger på rad, er Fiken trolig nede. Da venter vi heller med resten.
        if (err instanceof FikenError && err.info.status === 0) {
          if (++networkFailures >= 2) {
            result.stopped = "Fikk ikke kontakt med Fiken. Prøv igjen om litt.";
            result.remaining += batch.length - i - 1;
            break;
          }
        } else networkFailures = 0;
      }
    }

    await db.insert(auditLog).values({
      siteId,
      userId,
      action: "fiken.batch",
      detail: {
        period: period.key,
        sent: result.sent.length,
        failed: result.failed.length,
        alreadySent: result.alreadySent,
        skipped: result.skipped,
        remaining: result.remaining,
        stopped: result.stopped !== null,
      },
    });
    return result;
  } finally {
    await releaseLock(db, siteId, lock);
  }
}

/** Svaret eieren ser etter en sending. ok er false når noe feilet eller sendingen stoppet. */
export function describeSendResult(r: FikenSendResult): { ok: boolean; message: string } {
  const month = r.period.key === "maned" ? "denne måneden" : "forrige måned";
  const summary: string[] = [];
  if (r.sent.length > 0) summary.push(`${r.sent.length} ordre er sendt til Fiken.`);
  else if (r.failed.length === 0 && !r.stopped) summary.push(`Ingen nye ordre å sende for ${month}.`);
  if (r.alreadySent > 0) summary.push(`${r.alreadySent} var sendt fra før.`);
  if (r.skipped.method > 0) summary.push(`${r.skipped.method} ble ikke sendt fordi betalingsmåten ikke er valgt.`);
  if (r.skipped.test > 0) summary.push(`${r.skipped.test} var testbetalinger og ble ikke sendt.`);
  if (r.skipped.zero > 0) summary.push(`${r.skipped.zero} var på 0 kr og ble ikke sendt.`);
  const lines = [summary.join(" ")];
  for (const f of r.failed) lines.push(`Ordre ${f.number}: ${f.message}`);
  if (r.stopped) lines.push(`Sendingen stoppet. ${r.stopped}`);
  if (r.remaining > 0) {
    lines.push(r.stopped ? `${r.remaining} ordre er ikke sendt ennå.` : `${r.remaining} ordre gjenstår. Trykk på knappen igjen for å sende resten.`);
  }
  return { ok: r.failed.length === 0 && !r.stopped, message: lines.filter(Boolean).join("\n") };
}

export type FikenOverview = {
  lastBatch: { at: string; sent: number; failed: number } | null;
  /**
   * Ordre som er sendt til Fiken og senere kansellert eller refundert, helt eller delvis. Én rad per kreditnota. Kreditnotaen fra Nettgata sendes ikke til Fiken:
   * kreditnota-kallene i Fiken API v2 krever en faktura laget i Fiken (invoiceId), og salget vi sender er «Annet salg».
   * Negative salg er ikke beskrevet i spesifikasjonen. Eieren fører derfor kreditnotaen selv i Fiken.
   */
  needsCredit: { number: number; status: string; saleId: string | null; creditNoteNumber: number | null }[];
};

export async function fikenOverview(db: Db, siteId: string, now = new Date()): Promise<FikenOverview> {
  const [last] = await db
    .select({ createdAt: auditLog.createdAt, detail: auditLog.detail })
    .from(auditLog)
    .where(and(eq(auditLog.siteId, siteId), eq(auditLog.action, "fiken.batch")))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  const since = new Date(now.getTime() - 92 * 86_400_000);
  const needsCredit = await db
    .select({
      number: orders.number,
      status: orders.status,
      saleId: sql<string | null>`${auditLog.detail} ->> 'saleId'`,
      creditNoteNumber: creditNotes.number,
    })
    .from(auditLog)
    .innerJoin(orders, sql`${orders.id}::text = ${auditLog.detail} ->> 'orderId'`)
    .leftJoin(creditNotes, and(eq(creditNotes.orderId, orders.id), eq(creditNotes.siteId, siteId)))
    .where(
      and(
        eq(auditLog.siteId, siteId),
        eq(auditLog.action, "order.fiken_sent"),
        eq(orders.siteId, siteId),
        or(inArray(orders.status, ["cancelled", "refunded"]), gt(orders.refundedOre, 0)),
        gte(orders.createdAt, since),
      ),
    )
    .orderBy(desc(orders.number))
    .limit(20);
  return {
    lastBatch: last ? { at: last.createdAt.toISOString(), sent: Number(last.detail?.sent ?? 0), failed: Number(last.detail?.failed ?? 0) } : null,
    needsCredit,
  };
}
