import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { auditLog, sites } from "@/db/schema";
import { ShopError } from "@/lib/shop/catalog";
import { formatNok } from "@/lib/shop/money";
import { BringError, fetchQuotes, type BringCredentials } from "./client";
import { decryptBringSecret, encryptBringSecret } from "./crypto";
import { bringProductIds, bringProducts, type BringProductId } from "./products";
import {
  bringEnvironments,
  bringShippingSchema,
  readBringAccount,
  readBringShipping,
  type BringEnvironment,
  type BringShipping,
  type StoredBringAccount,
} from "./state";

// ---------- Skjemaene i studioet ----------

export const bringKeysSchema = z.object({
  environment: z.enum(bringEnvironments, { error: "Velg test eller produksjon" }),
  uid: z
    .string()
    .trim()
    .max(120, "E-postadressen er for lang")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Skriv e-postadressen du logger inn i Mybring med"),
  // Nøkler limes ofte inn med mellomrom i endene. Inni er bare synlige tegn lov, fordi de sendes i HTTP-hoder.
  apiKey: z
    .string()
    .trim()
    .min(1, "Lim inn API-nøkkelen fra Mybring")
    .max(200, "API-nøkkelen er for lang")
    .regex(/^[\x21-\x7e]+$/, "API-nøkkelen kan ikke ha mellomrom eller spesialtegn. Sjekk at hele nøkkelen er limt inn."),
  customerNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,35}$/, "Kundenummeret hos Bring består av tall og bokstaver, uten mellomrom"),
});
export type BringKeysInput = z.input<typeof bringKeysSchema>;

/** Krypteringen er bundet til butikk og miljø. */
const encryptionContext = (siteId: string, environment: BringEnvironment) => `nettgata-bring:${siteId}:${environment}`;

/** Oppsettet under sites.shop.bring, eller et tomt objekt. Tåler at feltet mangler eller har feil form. */
const bringObject = sql`(case when jsonb_typeof(${sites.shop} -> 'bring') = 'object' then ${sites.shop} -> 'bring' else '{}'::jsonb end)`;

/** Bare første tegn og domenet vises: k…@ullstua.no. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}…@${domain}`.slice(0, 80);
}

/** Feltene som hører til kontoen. «Fjern» tar bort disse og lar fraktvalgene stå. */
const accountKeys = ["environment", "secret", "hint", "customerNumber", "savedAt", "testedAt", "lastError"];

async function nettbutikk(db: Db, siteId: string) {
  const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk"))).limit(1);
  if (!site) throw new ShopError("Fant ikke nettbutikken");
  return site;
}

// ---------- Lagring ----------

/**
 * Lagrer Mybring-brukeren og API-nøkkelen kryptert under sites.shop.bring, i én SQL-setning som bare rører Bring-oppsettet.
 * Nye nøkler må testes før Bring vises i kassen.
 */
export async function saveBringKeys(db: Db, siteId: string, input: unknown, userId: string | null): Promise<StoredBringAccount> {
  const parsed = bringKeysSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  const { environment, uid, apiKey, customerNumber } = parsed.data;
  await nettbutikk(db, siteId);
  const account: StoredBringAccount = {
    environment,
    secret: await encryptBringSecret(JSON.stringify({ uid, apiKey } satisfies BringCredentials), encryptionContext(siteId, environment)),
    hint: maskEmail(uid),
    customerNumber,
    savedAt: new Date().toISOString(),
    testedAt: null,
    lastError: null,
  };
  await db
    .update(sites)
    .set({ shop: sql`${sites.shop} || jsonb_build_object('bring', ${bringObject} || ${JSON.stringify(account)}::jsonb)` })
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")));
  await db.insert(auditLog).values({ siteId, userId, action: "bring.keys_saved", detail: { environment, customerNumber } });
  return account;
}

export async function removeBringKeys(db: Db, siteId: string, userId: string | null) {
  await db
    .update(sites)
    .set({ shop: sql`${sites.shop} || jsonb_build_object('bring', ${bringObject} - ${`{${accountKeys.join(",")}}`}::text[])` })
    .where(eq(sites.id, siteId));
  await db.insert(auditLog).values({ siteId, userId, action: "bring.keys_removed" });
}

/** Lagrer fraktvalgene, avsenderadressen og pakkestørrelsen. Rører ikke nøklene. */
export async function saveBringShipping(db: Db, siteId: string, input: unknown, userId: string | null): Promise<BringShipping> {
  const parsed = bringShippingSchema.safeParse(input);
  if (!parsed.success) throw new ShopError(parsed.error.issues[0].message);
  await nettbutikk(db, siteId);
  await db
    .update(sites)
    .set({ shop: sql`${sites.shop} || jsonb_build_object('bring', ${bringObject} || ${JSON.stringify(parsed.data)}::jsonb)` })
    .where(and(eq(sites.id, siteId), eq(sites.kind, "nettbutikk")));
  await db.insert(auditLog).values({ siteId, userId, action: "bring.shipping_saved", detail: { products: parsed.data.products.map((p) => p.id) } });
  return parsed.data;
}

// ---------- Lesing ----------

export type BringAccess = { environment: BringEnvironment; customerNumber: string; credentials: BringCredentials; savedAt: string };

/**
 * Dekrypterer nøklene rett før et kall til Bring. Bare på serveren, og resultatet skal aldri logges, lagres
 * eller sendes videre. Returnerer null hvis nøklene mangler eller ikke kan leses (for eksempel etter at
 * SESSION_SECRET er byttet). Da må eieren legge dem inn på nytt.
 */
export async function loadBringAccess(site: { id: string; shop: unknown }): Promise<BringAccess | null> {
  const stored = readBringAccount(site.shop);
  if (!stored) return null;
  try {
    const plain = JSON.parse(await decryptBringSecret(stored.secret, encryptionContext(site.id, stored.environment)));
    const credentials = z.object({ uid: z.string().min(1), apiKey: z.string().min(1) }).parse(plain);
    return { environment: stored.environment, customerNumber: stored.customerNumber, credentials, savedAt: stored.savedAt };
  } catch {
    console.error(`Bring-nøklene kunne ikke leses for nettsted ${site.id}. De må legges inn på nytt.`);
    return null;
  }
}

/** Det studioet får vite. Aldri nøklene, verken i klartekst eller kryptert. */
export type BringSetupView = {
  account: {
    environment: BringEnvironment;
    hint: string;
    customerNumber: string;
    savedAt: string;
    testedAt: string | null;
    lastError: string | null;
    ready: boolean;
  } | null;
  shipping: BringShipping | null;
};

export function bringSetupView(shop: unknown): BringSetupView {
  const stored = readBringAccount(shop);
  return {
    account: stored
      ? {
          environment: stored.environment,
          hint: stored.hint,
          customerNumber: stored.customerNumber,
          savedAt: stored.savedAt,
          testedAt: stored.testedAt,
          lastError: stored.lastError,
          ready: stored.testedAt !== null,
        }
      : null,
    shipping: readBringShipping(shop),
  };
}

// ---------- Test av tilkoblingen ----------

/** Forklaringer på feilkodene Bring gir per tjeneste, med det eieren kan gjøre med dem. */
function explainProductError(code: string, message: string): string {
  if (code === "CUSTOMER_NOT_FOUND" || code === "CUSTOMER_NOT_SPECIFIED") return "Bring fant ikke kundenummeret. Sjekk kundenummeret i Mybring.";
  if (code === "FORBIDDEN" || /financial/i.test(message)) {
    return "Mybring-brukeren mangler tilgang til priser for kundenummeret. Be den som administrerer Mybring hos dere om å gi brukeren økonomitilgang.";
  }
  return `Bring svarte: ${message || code}`;
}

/**
 * Spør Bring om prisen på en pakke på ett kilo, uten å bestille noe. Lykkes det for minst én tjeneste, virker
 * Mybring-brukeren, API-nøkkelen og kundenummeret. Resultatet lagres bare hvis nøklene ikke er byttet mens testen pågikk.
 */
export async function testBringConnection(db: Db, siteId: string, userId: string | null): Promise<{ ok: boolean; message: string }> {
  const [site] = await db.select({ id: sites.id, shop: sites.shop }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const stored = site ? readBringAccount(site.shop) : null;
  if (!site || !stored) throw new ShopError("Bring er ikke koblet til. Lim inn nøklene først.");
  const access = await loadBringAccess(site);
  const shipping = readBringShipping(site.shop);
  const products: BringProductId[] = shipping?.products.length ? shipping.products.map((p) => p.id) : [...bringProductIds];
  const from = shipping?.sender.postalCode ?? "0150";

  let ok = false;
  let message: string;
  if (!access) {
    message = "Nøklene kunne ikke leses. Lim dem inn på nytt.";
  } else {
    try {
      const quotes = await fetchQuotes(access.credentials, {
        fromPostalCode: from,
        toPostalCode: "0150",
        weightGrams: 1000,
        packageCm: shipping?.packageCm ?? null,
        products,
        customerNumber: access.customerNumber,
        atPostOffice: shipping?.atPostOffice ?? false,
      });
      const priced = products.filter((p) => quotes[p]?.priceOre !== null && quotes[p]?.priceOre !== undefined);
      if (priced.length) {
        ok = true;
        message = `Tilkoblingen til Bring virker. Eksempel: ${bringProducts[priced[0]].name}, ett kilo til Oslo, koster ${formatNok(quotes[priced[0]].priceOre!)}.`;
      } else {
        const failed = products.map((p) => quotes[p]?.error).find(Boolean);
        message = failed
          ? explainProductError(failed.code, failed.message)
          : "Bring svarte, men uten pris. Mybring-brukeren trenger økonomitilgang til kundenummeret for å få priser.";
      }
    } catch (err) {
      if (!(err instanceof BringError)) throw err;
      message = err.message;
    }
  }

  const result = { testedAt: ok ? new Date().toISOString() : null, lastError: ok ? null : message };
  await db
    .update(sites)
    .set({ shop: sql`jsonb_set(${sites.shop}, '{bring}', (${sites.shop} -> 'bring') || ${JSON.stringify(result)}::jsonb)` })
    .where(and(eq(sites.id, siteId), sql`${sites.shop} -> 'bring' ->> 'secret' = ${stored.secret}`));
  await db.insert(auditLog).values({ siteId, userId, action: "bring.keys_tested", detail: { environment: stored.environment, ok } });
  return { ok, message };
}
