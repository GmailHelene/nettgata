import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, discountCodes } from "@/db/schema";
import { addDays, formatOsloDay, osloDate, parseOsloDate } from "@/lib/oslo-time";
import { ShopError } from "./catalog";
import { formatNok } from "./money";

export type Discount = typeof discountCodes.$inferSelect;
export const discountKinds = ["percent", "amount", "free_shipping"] as const;
export type DiscountKind = (typeof discountKinds)[number];

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

const dateField = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Ugyldig dato");

/** Skjemaet i studioet. Datoene er kalenderdatoer i norsk tid; koden gjelder hele sluttdagen. */
export const discountInputSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeCode)
      .pipe(z.string().regex(/^[A-Z0-9ÆØÅ_-]{3,30}$/, "Koden må ha 3-30 tegn: bokstaver, tall, bindestrek eller understrek")),
    kind: z.enum(discountKinds),
    value: z.number().int().min(0).max(100_000_000),
    minSubtotalOre: z.number().int().min(0).max(100_000_000).nullable().default(null),
    startDate: dateField.default(""),
    endDate: dateField.default(""),
    usageLimit: z.number().int().min(1, "Bruksgrensen må være minst 1").max(1_000_000).nullable().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "percent" && (d.value < 1 || d.value > 100)) ctx.addIssue({ code: "custom", message: "Prosenten må være mellom 1 og 100" });
    if (d.kind === "amount" && d.value < 100) ctx.addIssue({ code: "custom", message: "Beløpet må være minst 1 kr" });
    if (d.startDate && d.endDate && d.endDate < d.startDate) ctx.addIssue({ code: "custom", message: "Sluttdatoen kan ikke være før startdatoen" });
  });
export type DiscountInput = z.input<typeof discountInputSchema>;

/** Fra databaseraden tilbake til skjemaet. Sluttidspunktet er midnatt etter siste gyldige dag. */
export function discountToInput(d: Discount): DiscountInput {
  return {
    code: d.code,
    kind: d.kind,
    value: d.value,
    minSubtotalOre: d.minSubtotalOre,
    startDate: d.startsAt ? osloDate(d.startsAt) : "",
    endDate: d.endsAt ? osloDate(new Date(d.endsAt.getTime() - 1)) : "",
    usageLimit: d.usageLimit,
    active: d.active,
  };
}

export async function saveDiscount(db: Db, siteId: string, discountId: string | null, input: DiscountInput, userId: string) {
  const parsed = discountInputSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const d = parsed.data;
  const startsAt = d.startDate ? parseOsloDate(d.startDate) : null;
  const endsAt = d.endDate ? parseOsloDate(addDays(d.endDate, 1)) : null;
  if ((d.startDate && !startsAt) || (d.endDate && !endsAt)) throw new ShopError("Ugyldig dato");

  const conditions = [eq(discountCodes.siteId, siteId), eq(discountCodes.code, d.code)];
  if (discountId) conditions.push(ne(discountCodes.id, discountId));
  const [taken] = await db.select({ id: discountCodes.id }).from(discountCodes).where(and(...conditions)).limit(1);
  if (taken) throw new ShopError(`Koden ${d.code} finnes allerede`);

  const values = {
    code: d.code,
    kind: d.kind,
    value: d.kind === "free_shipping" ? 0 : d.value,
    minSubtotalOre: d.minSubtotalOre || null,
    startsAt,
    endsAt,
    usageLimit: d.usageLimit,
    active: d.active,
  };
  if (discountId) {
    const updated = await db
      .update(discountCodes)
      .set(values)
      .where(and(eq(discountCodes.id, discountId), eq(discountCodes.siteId, siteId)))
      .returning({ id: discountCodes.id });
    if (updated.length === 0) throw new ShopError("Fant ikke rabattkoden");
    await db.insert(auditLog).values({ siteId, userId, action: "discount.updated", detail: { discountId, code: d.code } });
    return discountId;
  }
  const [created] = await db.insert(discountCodes).values({ siteId, ...values }).returning({ id: discountCodes.id });
  await db.insert(auditLog).values({ siteId, userId, action: "discount.created", detail: { discountId: created.id, code: d.code } });
  return created.id;
}

export function describeDiscount(d: Pick<Discount, "kind" | "value" | "minSubtotalOre">): string {
  const base = d.kind === "percent" ? `${d.value} % på varene` : d.kind === "amount" ? `${formatNok(d.value)} på varene` : "Fri frakt";
  return d.minSubtotalOre ? `${base} ved kjøp over ${formatNok(d.minSubtotalOre)}` : base;
}

export type DiscountStatus = "aktiv" | "planlagt" | "utlopt" | "brukt-opp" | "av";

export function discountStatus(d: Discount, now: Date): DiscountStatus {
  if (!d.active) return "av";
  if (d.endsAt && d.endsAt <= now) return "utlopt";
  if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return "brukt-opp";
  if (d.startsAt && d.startsAt > now) return "planlagt";
  return "aktiv";
}

export function discountAmount(d: Pick<Discount, "kind" | "value">, subtotalOre: number): number {
  if (d.kind === "percent") return Math.min(subtotalOre, Math.round((subtotalOre * d.value) / 100));
  if (d.kind === "amount") return Math.min(subtotalOre, d.value);
  return 0;
}

/** Kaster en feil med en melding kunden forstår hvis koden ikke kan brukes akkurat nå. */
export function assertUsable(d: Discount | undefined, subtotalOre: number, now: Date): asserts d is Discount {
  if (!d || !d.active) throw new ShopError("Rabattkoden er ikke gyldig");
  if (d.startsAt && d.startsAt > now) throw new ShopError(`Rabattkoden gjelder fra ${formatOsloDay(d.startsAt, now)}`);
  if (d.endsAt && d.endsAt <= now) throw new ShopError("Rabattkoden er utløpt");
  if (d.usageLimit !== null && d.usedCount >= d.usageLimit) throw new ShopError("Rabattkoden er brukt opp");
  if (d.minSubtotalOre && subtotalOre < d.minSubtotalOre) throw new ShopError(`Handle for minst ${formatNok(d.minSubtotalOre)} for å bruke koden`);
}

/**
 * Fordeler rabatten på linjene etter andel av varebeløpet, så MVA blir riktig når kurven har flere satser.
 * Øre som blir til overs etter avrunding, går til linjene med størst rest, så summen alltid stemmer.
 */
export function allocateDiscount(totals: number[], discountOre: number): number[] {
  const sum = totals.reduce((a, b) => a + b, 0);
  if (discountOre <= 0 || sum === 0) return totals.map(() => 0);
  const exact = totals.map((t) => (t * discountOre) / sum);
  const shares = exact.map(Math.floor);
  let left = discountOre - shares.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((e, i) => ({ rest: e - Math.floor(e), i })).sort((a, b) => b.rest - a.rest);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    shares[i]++;
    left--;
  }
  return shares;
}

export async function findDiscount(db: Db, siteId: string, code: string): Promise<Discount | undefined> {
  const normalized = normalizeCode(code);
  if (!normalized) return undefined;
  const [d] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.siteId, siteId), eq(discountCodes.code, normalized)))
    .limit(1);
  return d;
}

/** Teller én bruk bare hvis grensen ikke er nådd. Atomisk, så to samtidige kjøp ikke kan bruke siste plass begge to. */
export async function claimDiscount(db: Db, discountId: string): Promise<boolean> {
  const updated = await db
    .update(discountCodes)
    .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
    .where(and(eq(discountCodes.id, discountId), or(isNull(discountCodes.usageLimit), lt(discountCodes.usedCount, discountCodes.usageLimit))))
    .returning({ id: discountCodes.id });
  return updated.length === 1;
}

export async function releaseDiscount(db: Db, discountId: string) {
  await db
    .update(discountCodes)
    .set({ usedCount: sql`greatest(${discountCodes.usedCount} - 1, 0)` })
    .where(eq(discountCodes.id, discountId));
}
