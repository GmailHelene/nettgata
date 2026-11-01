import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, sites } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { FikenError, getCompany, listBankAccounts, listCompanies, listIncomeAccounts } from "./client";
import { decryptFikenToken, encryptFikenToken } from "./crypto";
import {
  companySlugPattern,
  fikenMethodNames,
  fikenMethods,
  fikenSettingsSchema,
  readStoredFiken,
  storedFikenSchema,
  type FikenAccount,
  type FikenCompanyOption,
  type FikenSettings,
  type StoredFiken,
} from "./state";

/** Nøkler limes ofte inn med mellomrom eller linjeskift i endene. Inni er bare synlige tegn lov, fordi nøkkelen sendes i et HTTP-hode. */
const tokenField = z
  .string()
  .trim()
  .min(10, "Lim inn hele API-nøkkelen fra Fiken")
  .max(500, "API-nøkkelen er for lang. Sjekk at bare nøkkelen er limt inn.")
  .regex(/^[\x21-\x7e]+$/, "API-nøkkelen kan ikke ha mellomrom eller linjeskift inni seg. Sjekk at hele nøkkelen er limt inn.");

const connectSchema = z.object({
  token: tokenField,
  companySlug: z.string().regex(companySlugPattern, "Velg et selskap fra listen").optional(),
});

/**
 * Forslag når butikken kobler til: Vipps og Klarna til en bankkonto i Fiken som heter det samme, ellers driftskontoen.
 * Faktura og betaling ved henting er av til eieren slår dem på, fordi de ofte allerede er ført i Fiken eller i et kassesystem.
 */
function defaultSettings(bank: FikenAccount[], income: FikenAccount[]): FikenSettings {
  const main = bank.find((b) => b.code.startsWith("1920"))?.code ?? bank[0]?.code;
  const named = (word: string) => bank.find((b) => b.name.toLowerCase().includes(word))?.code ?? main;
  const incomeOr = (wanted: string, fallback: string) => (income.length === 0 || income.some((a) => a.code === wanted) ? wanted : fallback);
  const incomeAccount = incomeOr("3000", income[0]?.code ?? "3000");
  return fikenSettingsSchema.parse({
    paymentAccounts: main ? { vipps: named("vipps"), klarna: named("klarna") } : {},
    incomeAccount,
    zeroVatIncomeAccount: incomeOr("3100", incomeAccount),
  });
}

/** Ved ny nøkkel til samme selskap beholdes valgene, men bare kontoer som fortsatt finnes. */
function keepValid(settings: FikenSettings, bank: FikenAccount[], income: FikenAccount[]): FikenSettings {
  const defaults = defaultSettings(bank, income);
  const fallback = bank.find((b) => b.code.startsWith("1920"))?.code ?? bank[0]?.code;
  const paymentAccounts: FikenSettings["paymentAccounts"] = {};
  for (const m of fikenMethods) {
    const code = settings.paymentAccounts[m];
    if (!code) continue;
    const valid = bank.some((b) => b.code === code) ? code : fallback;
    if (valid) paymentAccounts[m] = valid;
  }
  const incomeOk = (code: string) => income.length === 0 || income.some((a) => a.code === code);
  return {
    paymentAccounts,
    incomeAccount: incomeOk(settings.incomeAccount) ? settings.incomeAccount : defaults.incomeAccount,
    zeroVatIncomeAccount: incomeOk(settings.zeroVatIncomeAccount) ? settings.zeroVatIncomeAccount : defaults.zeroVatIncomeAccount,
  };
}

export type ConnectResult = { status: "choose"; companies: FikenCompanyOption[] } | { status: "connected"; company: FikenCompanyOption };

/**
 * Sjekker nøkkelen mot Fiken og lagrer den kryptert sammen med selskapet. Har brukeren flere selskaper og
 * ikke valgt ett, lagres ingenting, og listen sendes tilbake så eieren kan velge.
 */
export async function connectFiken(db: Db, siteId: string, input: unknown, userId: string | null): Promise<ConnectResult> {
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const { token, companySlug } = parsed.data;

  const companies = await listCompanies(token);
  if (companies.length === 0) throw new ShopError("Nøkkelen virker, men brukeren har ikke tilgang til noen selskaper i Fiken.");
  const slug = companySlug ?? (companies.length === 1 ? companies[0].slug : null);
  if (!slug) return { status: "choose", companies };
  const company = companies.find((c) => c.slug === slug);
  if (!company) throw new ShopError("Fant ikke selskapet. Velg et av selskapene i listen.");
  const bankAccounts = (await listBankAccounts(token, company.slug)).slice(0, 100);
  const incomeAccounts = (await listIncomeAccounts(token, company.slug)).slice(0, 300);

  const [site] = await db
    .select({ shop: sites.shop })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")))
    .limit(1);
  if (!site) throw new ShopError("Fant ikke nettbutikken");
  const previous = readStoredFiken(site.shop);
  const now = new Date().toISOString();
  const stored = storedFikenSchema.parse({
    secret: await encryptFikenToken(token, siteId),
    companySlug: company.slug,
    companyName: company.name,
    organizationNumber: company.organizationNumber,
    vatRegistered: company.vatRegistered,
    testCompany: company.testCompany,
    bankAccounts,
    incomeAccounts,
    settings: previous?.companySlug === company.slug ? keepValid(previous.settings, bankAccounts, incomeAccounts) : defaultSettings(bankAccounts, incomeAccounts),
    savedAt: now,
    testedAt: now,
    lastError: null,
  } satisfies StoredFiken);

  // Én SQL-setning som bare rører Fiken-feltet, så butikkinnstillinger og betalingsnøkler som lagres samtidig, ikke går tapt.
  const updated = await db
    .update(sites)
    .set({ shop: sql`${sites.shop} || jsonb_build_object('fiken', ${JSON.stringify(stored)}::jsonb)` })
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")))
    .returning({ id: sites.id });
  if (updated.length === 0) throw new ShopError("Fant ikke nettbutikken");
  await db.insert(auditLog).values({ siteId, userId, action: "fiken.connected", detail: { companySlug: company.slug, testCompany: company.testCompany } });
  return { status: "connected", company };
}

/**
 * Dekrypterer nøkkelen rett før et kall til Fiken. Bare på serveren, og resultatet skal aldri logges, lagres eller
 * sendes videre. Null hvis nøkkelen mangler eller ikke kan leses (for eksempel etter at SESSION_SECRET er byttet).
 */
export async function loadFikenToken(site: { id: string; shop: unknown }): Promise<string | null> {
  const stored = readStoredFiken(site.shop);
  if (!stored) return null;
  try {
    return await decryptFikenToken(stored.secret, site.id);
  } catch {
    console.error(`Fiken-nøkkelen kunne ikke leses for nettsted ${site.id}. Butikken må koble til på nytt.`);
    return null;
  }
}

/** Oppdaterer feltene i Fiken-oppsettet, men bare hvis nøkkelen ikke er byttet i mellomtiden. */
async function patchStored(db: Db, siteId: string, secret: string, patch: Partial<StoredFiken>) {
  await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{fiken}', (${sites.shop} -> 'fiken') || ${JSON.stringify(patch)}::jsonb)` })
    .where(and(eq(sites.id, siteId), sql`${sites.shop} -> 'fiken' ->> 'secret' = ${secret}`));
}

/** Når Fiken avviser nøkkelen eller tilgangen under en sending, vises feilen i studioet til eieren tester på nytt. */
export async function markFikenProblem(db: Db, siteId: string, secret: string, message: string) {
  await patchStored(db, siteId, secret, { testedAt: null, lastError: message });
}

/** Prøver nøkkelen og selskapet, og henter kontoene på nytt. Endrer ingenting i Fiken. */
export async function testFikenConnection(db: Db, siteId: string, userId: string | null): Promise<{ ok: boolean; message: string }> {
  const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const stored = site ? readStoredFiken(site.shop) : null;
  if (!site || !stored) throw new ShopError("Fiken er ikke koblet til. Lim inn API-nøkkelen først.");
  const token = await loadFikenToken(site);

  let ok = false;
  let message: string;
  let patch: Partial<StoredFiken>;
  if (!token) {
    message = "Nøkkelen kunne ikke leses. Koble til Fiken på nytt.";
    patch = { testedAt: null, lastError: message };
  } else {
    try {
      const company = await getCompany(token, stored.companySlug);
      const bankAccounts = (await listBankAccounts(token, stored.companySlug)).slice(0, 100);
      const incomeAccounts = (await listIncomeAccounts(token, stored.companySlug)).slice(0, 300);
      ok = true;
      message = "Tilkoblingen til Fiken virker.";
      patch = {
        companyName: company.name,
        organizationNumber: company.organizationNumber,
        vatRegistered: company.vatRegistered,
        testCompany: company.testCompany,
        bankAccounts,
        incomeAccounts,
        testedAt: new Date().toISOString(),
        lastError: null,
      };
    } catch (err) {
      if (!(err instanceof FikenError)) throw err;
      message = err.message;
      patch = { testedAt: null, lastError: message };
    }
  }
  await patchStored(db, siteId, stored.secret, patch);
  await db.insert(auditLog).values({ siteId, userId, action: "fiken.tested", detail: { ok } });
  return { ok, message };
}

/** Hvilke ordre som sendes, og til hvilke kontoer. Kontoene må finnes blant dem vi hentet fra Fiken. */
export async function saveFikenSettings(db: Db, siteId: string, input: unknown, userId: string | null): Promise<FikenSettings> {
  const parsed = fikenSettingsSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const settings = parsed.data;
  const [site] = await db.select({ shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const stored = site ? readStoredFiken(site.shop) : null;
  if (!stored) throw new ShopError("Fiken er ikke koblet til. Lim inn API-nøkkelen først.");

  for (const m of fikenMethods) {
    const code = settings.paymentAccounts[m];
    if (code && !stored.bankAccounts.some((b) => b.code === code)) {
      throw new ShopError(`Kontoen ${code} for ${fikenMethodNames[m]} finnes ikke blant bankkontoene i Fiken. Trykk Test tilkoblingen for å hente kontoene på nytt.`);
    }
  }
  for (const code of [settings.incomeAccount, settings.zeroVatIncomeAccount]) {
    if (stored.incomeAccounts.length > 0 && !stored.incomeAccounts.some((a) => a.code === code)) {
      throw new ShopError(`Inntektskontoen ${code} finnes ikke i kontoplanen i Fiken. Trykk Test tilkoblingen for å hente kontoene på nytt.`);
    }
  }

  await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{fiken,settings}', ${JSON.stringify(settings)}::jsonb)` })
    .where(and(eq(sites.id, siteId), sql`jsonb_typeof(${sites.shop} -> 'fiken') = 'object'`));
  await db.insert(auditLog).values({
    siteId,
    userId,
    action: "fiken.settings_saved",
    detail: { methods: fikenMethods.filter((m) => settings.paymentAccounts[m]) },
  });
  return settings;
}

/**
 * Fjerner koblingen fra Nettgata. Nøkkelen virker fortsatt i Fiken til eieren sletter den der.
 * Loggen over sendte ordre blir liggende, så de aldri sendes på nytt om butikken kobler til igjen.
 */
export async function removeFiken(db: Db, siteId: string, userId: string | null) {
  await db
    .update(sites)
    .set({ shop: sql`${sites.shop} - 'fiken'` })
    .where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: "fiken.disconnected" });
}
