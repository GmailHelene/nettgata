import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, sites } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { shopSettingsSchema, type ShopSettings } from "@/lib/shop/settings";
import { PaymentError } from "./common";
import { decryptPaymentSecret, encryptPaymentSecret } from "./crypto";
import { klarnaClient, type KlarnaCredentials } from "./klarna";
import { paymentEnvironments, providerNames, readStoredProvider, type OnlineProvider, type PaymentEnvironment, type StoredProvider } from "./state";
import { vippsClient, type VippsCredentials } from "./vipps";

// ---------- Skjemaene i studioet ----------

/** Nøkler limes ofte inn med mellomrom eller linjeskift i endene. Inni er bare synlige tegn lov (de sendes i HTTP-hoder). */
const keyField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Lim inn ${label}`)
    .max(500, `${label} er for lang`)
    .regex(/^[\x21-\x7e]+$/, `${label} kan ikke ha mellomrom eller spesialtegn. Sjekk at hele nøkkelen er limt inn.`);

const environmentField = z.enum(paymentEnvironments, { error: "Velg test eller produksjon" });

export const vippsKeysSchema = z.object({
  environment: environmentField,
  clientId: keyField("client_id"),
  clientSecret: keyField("client_secret"),
  subscriptionKey: keyField("abonnementsnøkkelen (Ocp-Apim-Subscription-Key)"),
  msn: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, "Salgsstednummeret (MSN) består bare av tall, vanligvis seks"),
});

export const klarnaKeysSchema = z
  .object({
    environment: environmentField,
    username: keyField("brukernavnet"),
    password: keyField("passordet"),
  })
  .superRefine((k, ctx) => {
    // Nyere Klarna-nøkler sier selv hvilket miljø de hører til. Da kan vi stoppe den vanligste feilen før testen.
    if (k.environment === "production" && /^klarna_test_/i.test(k.password)) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Dette er en testnøkkel fra Klarna. Velg test, eller lim inn nøkkelen for produksjon." });
    }
    if (k.environment === "test" && /^klarna_live_/i.test(k.password)) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Dette er en produksjonsnøkkel fra Klarna. Velg produksjon, eller lim inn testnøkkelen." });
    }
  });

export type VippsKeysInput = z.input<typeof vippsKeysSchema>;
export type KlarnaKeysInput = z.input<typeof klarnaKeysSchema>;

/** Krypteringen er bundet til butikk, løsning og miljø. */
const encryptionContext = (siteId: string, provider: OnlineProvider, environment: PaymentEnvironment) =>
  `nettgata-betaling:${siteId}:${provider}:${environment}`;

/** Oppsettet for én løsning, eller et tomt objekt. Tåler at feltet mangler eller har feil form. */
const providersObject = sql`(case when jsonb_typeof(${sites.shop} -> 'paymentProviders') = 'object' then ${sites.shop} -> 'paymentProviders' else '{}'::jsonb end)`;

// ---------- Lagring ----------

/**
 * Lagrer nøklene kryptert under sites.shop.paymentProviders. Alt skjer i én SQL-setning som bare rører denne løsningen,
 * så butikkinnstillinger som lagres samtidig, ikke går tapt. Nye nøkler må testes før løsningen vises i kassen.
 */
export async function savePaymentKeys(db: Db, siteId: string, provider: OnlineProvider, input: unknown, userId: string | null): Promise<StoredProvider> {
  let plain: string;
  let environment: PaymentEnvironment;
  let hint: string;
  if (provider === "vipps") {
    const parsed = vippsKeysSchema.safeParse(input);
    if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
    const { environment: env, ...keys } = parsed.data;
    plain = JSON.stringify(keys satisfies VippsCredentials);
    environment = env;
    hint = keys.clientId.slice(-4);
  } else {
    const parsed = klarnaKeysSchema.safeParse(input);
    if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
    const { environment: env, ...keys } = parsed.data;
    plain = JSON.stringify(keys satisfies KlarnaCredentials);
    environment = env;
    hint = keys.username.slice(-4);
  }

  const stored: StoredProvider = {
    environment,
    secret: await encryptPaymentSecret(plain, encryptionContext(siteId, provider, environment)),
    hint,
    savedAt: new Date().toISOString(),
    testedAt: null,
    lastError: null,
  };
  const updated = await db
    .update(sites)
    .set({
      shop: sql`${sites.shop} || jsonb_build_object('paymentProviders', ${providersObject} || jsonb_build_object(${provider}::text, ${JSON.stringify(stored)}::jsonb))`,
    })
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")))
    .returning({ id: sites.id });
  if (updated.length === 0) throw new ShopError("Fant ikke nettbutikken");
  await db.insert(auditLog).values({ siteId, userId, action: "payment.keys_saved", detail: { provider, environment, hint } });
  return stored;
}

export async function removePaymentKeys(db: Db, siteId: string, provider: OnlineProvider, userId: string | null) {
  await db
    .update(sites)
    .set({ shop: sql`${sites.shop} || jsonb_build_object('paymentProviders', ${providersObject} - ${provider}::text)` })
    .where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: "payment.keys_removed", detail: { provider } });
}

/**
 * Lagrer butikkinnstillingene (frakt, betalingsmåter, vilkår) uten å røre betalingsnøklene eller Fiken-koblingen.
 * Brukes av «Lagre butikkinnstillinger» i studioet, som ellers ville skrevet over hele sites.shop.
 */
export async function updateShopSettings(db: Db, siteId: string, settings: ShopSettings) {
  // Skjemaet tar bare med feltene som hører hjemme her. Det avledede feltet online lagres aldri,
  // det regnes ut fra nøklene hver gang innstillingene leses.
  const data = shopSettingsSchema.parse(settings);
  await db
    .update(sites)
    .set({
      shop: sql`${JSON.stringify(data)}::jsonb || (case when jsonb_typeof(${sites.shop} -> 'paymentProviders') = 'object' then jsonb_build_object('paymentProviders', ${sites.shop} -> 'paymentProviders') else '{}'::jsonb end) || (case when jsonb_typeof(${sites.shop} -> 'fiken') = 'object' then jsonb_build_object('fiken', ${sites.shop} -> 'fiken') else '{}'::jsonb end)`,
    })
    .where(eq(sites.id, siteId));
}

// ---------- Lesing ----------

export type ProviderAccess =
  | { provider: "vipps"; environment: PaymentEnvironment; credentials: VippsCredentials }
  | { provider: "klarna"; environment: PaymentEnvironment; credentials: KlarnaCredentials };

/**
 * Dekrypterer nøklene rett før et kall til Vipps eller Klarna. Bare på serveren, og resultatet skal aldri logges,
 * lagres eller sendes videre. Returnerer null hvis nøklene mangler eller ikke kan leses (for eksempel etter at
 * SESSION_SECRET er byttet). Da må eieren legge dem inn på nytt.
 */
export async function loadCredentials(site: { id: string; shop: unknown }, provider: OnlineProvider): Promise<ProviderAccess | null> {
  const stored = readStoredProvider(site.shop, provider);
  if (!stored) return null;
  try {
    const plain = JSON.parse(await decryptPaymentSecret(stored.secret, encryptionContext(site.id, provider, stored.environment)));
    if (provider === "vipps") {
      const keys = vippsKeysSchema.omit({ environment: true }).parse(plain);
      return { provider, environment: stored.environment, credentials: keys };
    }
    const keys = z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(plain);
    return { provider, environment: stored.environment, credentials: keys };
  } catch {
    console.error(`Betalingsnøklene for ${providerNames[provider]} kunne ikke leses for nettsted ${site.id}. De må legges inn på nytt.`);
    return null;
  }
}

/** Det studioet får vite: om løsningen er koblet til, miljø og de fire siste tegnene. Aldri selve nøklene. */
export type ProviderView = {
  environment: PaymentEnvironment;
  hint: string;
  savedAt: string;
  testedAt: string | null;
  lastError: string | null;
  ready: boolean;
};

export function paymentSetupView(shop: unknown): Record<OnlineProvider, ProviderView | null> {
  const view = (provider: OnlineProvider): ProviderView | null => {
    const stored = readStoredProvider(shop, provider);
    if (!stored) return null;
    return {
      environment: stored.environment,
      hint: stored.hint,
      savedAt: stored.savedAt,
      testedAt: stored.testedAt,
      lastError: stored.lastError,
      ready: stored.testedAt !== null,
    };
  };
  return { vipps: view("vipps"), klarna: view("klarna") };
}

// ---------- Test av tilkoblingen ----------

/**
 * Prøver nøklene mot Vipps eller Klarna uten å opprette noe. Resultatet lagres på løsningen, men bare hvis
 * nøklene ikke er byttet mens testen pågikk. Først når testen har lyktes, vises løsningen i kassen.
 */
export async function testPaymentConnection(db: Db, siteId: string, provider: OnlineProvider, userId: string | null): Promise<{ ok: boolean; message: string }> {
  const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const stored = site ? readStoredProvider(site.shop, provider) : null;
  if (!site || !stored) throw new ShopError(`${providerNames[provider]} er ikke koblet til. Lim inn nøklene først.`);
  const access = await loadCredentials(site, provider);

  let ok = false;
  let message: string;
  if (!access) {
    message = "Nøklene kunne ikke leses. Lim dem inn på nytt.";
  } else {
    try {
      if (access.provider === "vipps") await vippsClient(access.environment, access.credentials).testConnection();
      else await klarnaClient(access.environment, access.credentials).testConnection();
      ok = true;
      message = `Tilkoblingen til ${providerNames[provider]} virker.`;
    } catch (err) {
      if (!(err instanceof PaymentError)) throw err;
      message = err.message;
    }
  }

  const result = { testedAt: ok ? new Date().toISOString() : null, lastError: ok ? null : message };
  await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, ${`{paymentProviders,${provider}}`}::text[], (${sites.shop} -> 'paymentProviders' -> ${provider}::text) || ${JSON.stringify(result)}::jsonb)` })
    .where(and(eq(sites.id, siteId), sql`${sites.shop} -> 'paymentProviders' -> ${provider}::text ->> 'secret' = ${stored.secret}`));
  await db.insert(auditLog).values({ siteId, userId, action: "payment.keys_tested", detail: { provider, environment: stored.environment, ok } });
  return { ok, message };
}
