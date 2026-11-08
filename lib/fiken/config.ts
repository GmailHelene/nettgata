import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, sites } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { FikenError, getCompany, listBankAccounts, listCompanies, listIncomeAccounts } from "./client";
import { decryptFikenToken, encryptFikenToken } from "./crypto";
import { FikenAuthError, REFRESH_MARGIN_MS, fikenOAuthConfig, refreshFikenTokens, revokeFikenToken, type FikenTokens } from "./oauth";
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

/**
 * Forslag når butikken kobler til: betalinger på nett til en bankkonto i Fiken som heter det samme, ellers driftskontoen.
 * Faktura og betaling ved henting er av til eieren slår dem på, fordi de ofte allerede er ført i Fiken eller i et kassesystem.
 */
function defaultSettings(bank: FikenAccount[], income: FikenAccount[]): FikenSettings {
  const main = bank.find((b) => b.code.startsWith("1920"))?.code ?? bank[0]?.code;
  const named = (word: string) => bank.find((b) => b.name.toLowerCase().includes(word))?.code ?? main;
  const incomeOr = (wanted: string, fallback: string) => (income.length === 0 || income.some((a) => a.code === wanted) ? wanted : fallback);
  const incomeAccount = incomeOr("3000", income[0]?.code ?? "3000");
  return fikenSettingsSchema.parse({
    paymentAccounts: main ? { vipps: named("vipps"), stripe: named("stripe"), klarna: named("klarna"), kustom: named("kustom") } : {},
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

export const noCompaniesMessage = "Du har ikke tilgang til noen selskaper i Fiken. Sjekk at riktig bruker er logget inn i Fiken.";

type SealedTokens = { a: string; r: string };

/** Tilgangs- og fornyelsesnøkkelen krypteres sammen, bundet til nettstedet. */
async function sealTokens(tokens: FikenTokens, siteId: string): Promise<string> {
  return encryptFikenToken(JSON.stringify({ a: tokens.accessToken, r: tokens.refreshToken } satisfies SealedTokens), siteId);
}

/**
 * Dekrypterer nøklene. Bare på serveren, og resultatet skal aldri logges, lagres eller sendes videre.
 * Null hvis de ikke kan leses (for eksempel etter at SESSION_SECRET er byttet).
 */
export async function readFikenTokens(stored: Pick<StoredFiken, "secret">, siteId: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const parsed = JSON.parse(await decryptFikenToken(stored.secret, siteId)) as Partial<SealedTokens>;
    if (typeof parsed.a !== "string" || typeof parsed.r !== "string") return null;
    return { accessToken: parsed.a, refreshToken: parsed.r };
  } catch {
    console.error(`Fiken-nøklene kunne ikke leses for nettsted ${siteId}. Butikken må koble til på nytt.`);
    return null;
  }
}

/** Selskapsfeltene og kontoene, hentet fra Fiken når selskapet er valgt. */
async function companyFields(token: string, company: FikenCompanyOption, previous: StoredFiken | null) {
  const bankAccounts = (await listBankAccounts(token, company.slug)).slice(0, 100);
  const incomeAccounts = (await listIncomeAccounts(token, company.slug)).slice(0, 300);
  return {
    companySlug: company.slug,
    companyChoices: [],
    companyName: company.name,
    organizationNumber: company.organizationNumber,
    vatRegistered: company.vatRegistered,
    testCompany: company.testCompany,
    bankAccounts,
    incomeAccounts,
    // Kobler eieren til samme selskap igjen, beholdes valgene, men bare kontoer som fortsatt finnes.
    settings: previous?.companySlug === company.slug ? keepValid(previous.settings, bankAccounts, incomeAccounts) : defaultSettings(bankAccounts, incomeAccounts),
    testedAt: new Date().toISOString(),
    lastError: null,
  } satisfies Partial<StoredFiken>;
}

async function readSite(db: Db, siteId: string) {
  const [site] = await db
    .select({ id: sites.id, shop: sites.shop })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")))
    .limit(1);
  if (!site) throw new ShopError("Fant ikke nettbutikken");
  return site;
}

/**
 * Etter «Koble til Fiken»: lagrer nøklene kryptert og finner selskapet. Har brukeren ett selskap i Fiken, er butikken
 * koblet til med en gang. Har brukeren flere, lagres listen, og eieren velger i studioet (chooseFikenCompany).
 */
export async function completeFikenConnect(db: Db, siteId: string, tokens: FikenTokens, userId: string | null): Promise<ConnectResult> {
  const companies = await listCompanies(tokens.accessToken);
  if (companies.length === 0) throw new ShopError(noCompaniesMessage);
  const site = await readSite(db, siteId);
  const previous = readStoredFiken(site.shop);
  const only = companies.length === 1 ? companies[0] : null;
  const stored = storedFikenSchema.parse({
    auth: "oauth",
    connectionId: crypto.randomUUID(),
    secret: await sealTokens(tokens, siteId),
    expiresAt: tokens.expiresAt,
    companySlug: null,
    companyChoices: only ? [] : companies.slice(0, 100),
    settings: previous?.settings ?? {},
    savedAt: new Date().toISOString(),
    ...(only ? await companyFields(tokens.accessToken, only, previous) : {}),
  });

  // Én SQL-setning som bare rører Fiken-feltet, så butikkinnstillinger og betalingsnøkler som lagres samtidig, ikke går tapt.
  const updated = await db
    .update(sites)
    .set({ shop: sql`${sites.shop} || jsonb_build_object('fiken', ${JSON.stringify(stored)}::jsonb)` })
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")))
    .returning({ id: sites.id });
  if (updated.length === 0) throw new ShopError("Fant ikke nettbutikken");
  await db.insert(auditLog).values({
    siteId,
    userId,
    action: "fiken.connected",
    detail: only ? { companySlug: only.slug, testCompany: only.testCompany } : { companies: companies.length },
  });
  return only ? { status: "connected", company: only } : { status: "choose", companies };
}

/** Eieren har flere selskaper i Fiken og velger hvilket ordrene skal til. */
export async function chooseFikenCompany(db: Db, siteId: string, slug: unknown, userId: string | null): Promise<FikenCompanyOption> {
  if (typeof slug !== "string" || !companySlugPattern.test(slug)) throw new ShopError("Velg et selskap fra listen");
  const { token, stored } = await fikenAccessToken(db, siteId);
  // Listen hentes på nytt, så eieren bare kan velge et selskap brukeren faktisk har tilgang til nå.
  const company = (await listCompanies(token)).find((c) => c.slug === slug);
  if (!company) throw new ShopError("Fant ikke selskapet i Fiken. Velg et av selskapene i listen.");
  await patchStored(db, siteId, stored.connectionId, await companyFields(token, company, stored));
  await db.insert(auditLog).values({ siteId, userId, action: "fiken.company_chosen", detail: { companySlug: company.slug, testCompany: company.testCompany } });
  return company;
}

/** Oppdaterer feltene i Fiken-oppsettet, men bare hvis butikken ikke er koblet til på nytt i mellomtiden. */
async function patchStored(db: Db, siteId: string, connectionId: string, patch: Partial<StoredFiken>) {
  return db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{fiken}', (${sites.shop} -> 'fiken') || ${JSON.stringify(patch)}::jsonb)` })
    .where(and(eq(sites.id, siteId), sql`${sites.shop} -> 'fiken' ->> 'connectionId' = ${connectionId}`))
    .returning({ id: sites.id });
}

/** Når Fiken avviser tilgangen under en sending, vises feilen i studioet til eieren tester på nytt. */
export async function markFikenProblem(db: Db, siteId: string, connectionId: string, message: string) {
  await patchStored(db, siteId, connectionId, { testedAt: null, lastError: message });
}

export const reconnectMessage = "Fiken godtar ikke tilgangen lenger. Den kan være trukket tilbake i Fiken. Trykk «Koble til Fiken på nytt».";

/** Fornyelsen feilet for godt: koblingen står som frakoblet, og studioet ber eieren koble til på nytt. */
async function markReconnect(db: Db, siteId: string, connectionId: string) {
  const changed = await patchStored(db, siteId, connectionId, { needsReconnect: true, testedAt: null, lastError: reconnectMessage });
  if (changed.length > 0) await db.insert(auditLog).values({ siteId, userId: null, action: "fiken.needs_reconnect" });
}

/**
 * Gyldig tilgangsnøkkel for butikken. Går den ut innen fem minutter, fornyes den først, og de nye nøklene lagres kryptert.
 * Fornyer to forespørsler samtidig, vinner den første, og den andre bruker nøklene den første lagret.
 */
export async function fikenAccessToken(db: Db, siteId: string, now = Date.now()): Promise<{ token: string; stored: StoredFiken }> {
  const site = await readSite(db, siteId);
  const stored = readStoredFiken(site.shop);
  if (!stored) throw new ShopError("Fiken er ikke koblet til. Trykk «Koble til Fiken» først.");
  if (stored.needsReconnect) throw new ShopError(reconnectMessage);
  const tokens = await readFikenTokens(stored, siteId);
  if (!tokens) {
    await markReconnect(db, siteId, stored.connectionId);
    throw new ShopError(reconnectMessage);
  }
  if (stored.expiresAt - REFRESH_MARGIN_MS > now) return { token: tokens.accessToken, stored };

  const config = fikenOAuthConfig();
  if (!config) throw new ShopError("Fiken-appen er ikke satt opp på plattformen ennå.");
  let fresh: FikenTokens;
  try {
    fresh = await refreshFikenTokens(config, tokens.refreshToken, now);
  } catch (err) {
    if (!(err instanceof FikenAuthError)) throw err;
    if (err.revoked) {
      await markReconnect(db, siteId, stored.connectionId);
      throw new ShopError(reconnectMessage);
    }
    throw new ShopError(err.message);
  }
  const secret = await sealTokens(fresh, siteId);
  const saved = await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{fiken}', (${sites.shop} -> 'fiken') || ${JSON.stringify({ secret, expiresAt: fresh.expiresAt })}::jsonb)` })
    .where(
      and(
        eq(sites.id, siteId),
        sql`${sites.shop} -> 'fiken' ->> 'connectionId' = ${stored.connectionId}`,
        sql`${sites.shop} -> 'fiken' ->> 'secret' = ${stored.secret}`,
      ),
    )
    .returning({ id: sites.id });
  if (saved.length === 0) {
    // En annen forespørsel fornyet samtidig, eller butikken ble koblet fra. Da brukes det som ligger lagret nå.
    const again = readStoredFiken((await readSite(db, siteId)).shop);
    const theirs = again && again.connectionId === stored.connectionId && again.expiresAt - REFRESH_MARGIN_MS > now ? await readFikenTokens(again, siteId) : null;
    if (!again || !theirs) throw new ShopError("Fiken-koblingen ble endret samtidig. Prøv igjen.");
    return { token: theirs.accessToken, stored: again };
  }
  await db.insert(auditLog).values({ siteId, userId: null, action: "fiken.token_refreshed" });
  return { token: fresh.accessToken, stored: { ...stored, secret, expiresAt: fresh.expiresAt } };
}

/** Selskapet må være valgt før noe sendes eller testes. */
export function requireCompany(stored: StoredFiken): string {
  if (!stored.companySlug) throw new ShopError("Velg først hvilket selskap i Fiken ordrene skal til.");
  return stored.companySlug;
}

/** Prøver tilgangen og selskapet, og henter kontoene på nytt. Endrer ingenting i Fiken. */
export async function testFikenConnection(db: Db, siteId: string, userId: string | null): Promise<{ ok: boolean; message: string }> {
  const { token, stored } = await fikenAccessToken(db, siteId);
  const slug = requireCompany(stored);

  let ok = false;
  let message: string;
  let patch: Partial<StoredFiken>;
  try {
    const company = await getCompany(token, slug);
    const bankAccounts = (await listBankAccounts(token, slug)).slice(0, 100);
    const incomeAccounts = (await listIncomeAccounts(token, slug)).slice(0, 300);
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
  await patchStored(db, siteId, stored.connectionId, patch);
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
  if (!stored) throw new ShopError("Fiken er ikke koblet til. Trykk «Koble til Fiken» først.");
  requireCompany(stored);

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
 * Fjerner koblingen: trekker tilbake tilgangen hos Fiken og sletter nøklene hos oss. Svarer ikke Fiken, slettes
 * nøklene likevel, og eieren kan fjerne appen selv i Fiken (Rediger konto, Sikkerhet, Apper du har gitt tilgang til).
 * Loggen over sendte ordre blir liggende, så de aldri sendes på nytt om butikken kobler til igjen.
 */
export async function removeFiken(db: Db, siteId: string, userId: string | null): Promise<{ revoked: boolean }> {
  const [site] = await db.select({ shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const stored = site ? readStoredFiken(site.shop) : null;
  const tokens = stored ? await readFikenTokens(stored, siteId) : null;
  // Fiken trekker tilbake hele tilgangen (også fornyelsesnøkkelen) når tilgangsnøkkelen sendes hit.
  const revoked = tokens ? await revokeFikenToken(tokens.accessToken) : false;
  await db
    .update(sites)
    .set({ shop: sql`${sites.shop} - 'fiken'` })
    .where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: "fiken.disconnected", detail: { revoked } });
  return { revoked };
}
