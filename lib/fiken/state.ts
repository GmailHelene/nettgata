import { z } from "zod";

/**
 * Fiken-koblingen for nettbutikken: betalte ordre sendes til butikkens egen Fiken-konto som salg.
 * Oppsettet ligger i sites.shop.fiken. API-nøkkelen ligger kryptert i secret (lib/fiken/crypto.ts), resten er ikke hemmelig.
 *
 * Denne filen er ren og uten hemmeligheter, så studioets klientkomponenter kan bruke typene og navnene herfra.
 */

/** Betalingsmåtene som kan sendes. Testbetaling og det gamle «kort» sendes aldri. */
export const fikenMethods = ["vipps", "klarna", "faktura", "ved-henting"] as const;
export type FikenMethod = (typeof fikenMethods)[number];

export const fikenMethodNames: Record<FikenMethod, string> = {
  vipps: "Vipps",
  klarna: "Klarna",
  faktura: "Faktura",
  "ved-henting": "Betaling ved henting",
};

/** Kontonummer slik Fiken skriver dem: «3000», eller «1920:10001» for en bankkonto med egen reskontro. */
export const accountCodePattern = /^\d{4}(:\d{5})?$/;
const accountCode = z.string().regex(accountCodePattern, "Ugyldig kontonummer");
const incomeAccountCode = z.string().regex(/^3\d{3}$/, "Inntektskontoen må være en konto i 3000-serien");

const account = z.object({ code: accountCode, name: z.string().max(200) });
export type FikenAccount = z.infer<typeof account>;

/** Selskapets adresse i Fiken. Brukes i adressen til hvert API-kall, så bare tegn som ikke kan bryte adressen. */
export const companySlugPattern = /^[^\s/?#%\\]{1,100}$/;

export const fikenSettingsSchema = z.object({
  /** Kontoen i Fiken pengene kommer inn på, per betalingsmåte. Mangler betalingsmåten her, sendes ikke ordrene med den. */
  paymentAccounts: z
    .object({
      vipps: accountCode.optional(),
      klarna: accountCode.optional(),
      faktura: accountCode.optional(),
      "ved-henting": accountCode.optional(),
    })
    .prefault({}),
  /** Inntektskonto for salg med MVA (25, 15 og 12 %). */
  incomeAccount: incomeAccountCode.default("3000"),
  /** Inntektskonto for varer med 0 % MVA. */
  zeroVatIncomeAccount: incomeAccountCode.default("3100"),
});
export type FikenSettings = z.infer<typeof fikenSettingsSchema>;

export const storedFikenSchema = z.object({
  /** Kryptert API-nøkkel, formatet v1:iv:ciphertext. Dekrypteres bare på serveren rett før et kall. */
  secret: z.string().startsWith("v1:"),
  companySlug: z.string().regex(companySlugPattern),
  companyName: z.string().max(200),
  organizationNumber: z.string().max(20).nullable().default(null),
  /** Fra company.vatType i Fiken. Et selskap som ikke er MVA-registrert, fører alt salg uten MVA. */
  vatRegistered: z.boolean(),
  /** Testselskap i Fiken. Bare da sendes ordre som er betalt i testmiljøet til Vipps eller Klarna. */
  testCompany: z.boolean().default(false),
  bankAccounts: z.array(account).max(100).default([]),
  incomeAccounts: z.array(account).max(300).default([]),
  settings: fikenSettingsSchema.prefault({}),
  savedAt: z.string(),
  /** Når testen sist lyktes. Null betyr ikke testet, eller at siste test eller sending stoppet på tilgangen. */
  testedAt: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  /** Sperre mens ordre sendes (millisekunder siden 1970), så to sendinger aldri går samtidig. */
  lockUntil: z.number().optional(),
});
export type StoredFiken = z.infer<typeof storedFikenSchema>;

export function readStoredFiken(shop: unknown): StoredFiken | null {
  if (!shop || typeof shop !== "object") return null;
  const parsed = storedFikenSchema.safeParse((shop as { fiken?: unknown }).fiken);
  return parsed.success ? parsed.data : null;
}

/** Det studioet får vite. Aldri nøkkelen, heller ikke kryptert. */
export type FikenView = Omit<StoredFiken, "secret" | "lockUntil">;

/** Feltene plukkes ut ett for ett, så et nytt hemmelig felt aldri blir med av seg selv. */
export function fikenView(shop: unknown): FikenView | null {
  const s = readStoredFiken(shop);
  if (!s) return null;
  return {
    companySlug: s.companySlug,
    companyName: s.companyName,
    organizationNumber: s.organizationNumber,
    vatRegistered: s.vatRegistered,
    testCompany: s.testCompany,
    bankAccounts: s.bankAccounts,
    incomeAccounts: s.incomeAccounts,
    settings: s.settings,
    savedAt: s.savedAt,
    testedAt: s.testedAt,
    lastError: s.lastError,
  };
}

/** Et selskap brukeren har tilgang til i Fiken, slik det vises når eieren velger selskap. */
export type FikenCompanyOption = {
  slug: string;
  name: string;
  organizationNumber: string | null;
  vatRegistered: boolean;
  hasApiAccess: boolean;
  testCompany: boolean;
};
