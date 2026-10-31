import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, users } from "@/db/schema";
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  hashRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from "@/lib/totp";

export class TwoFactorError extends Error {}

export type TwoFactorStatus = { enabled: boolean; recoveryLeft: number };

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      email: users.email,
      totpSecret: users.totpSecret,
      totpEnabledAt: users.totpEnabledAt,
      totpLastStep: users.totpLastStep,
      totpRecovery: users.totpRecovery,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new TwoFactorError("Fant ikke brukeren");
  return user;
}

const log = (db: Db, userId: string, action: string, detail: Record<string, unknown> = {}) =>
  db.insert(auditLog).values({ siteId: null, userId, action, detail });

export async function twoFactorStatus(db: Db, userId: string): Promise<TwoFactorStatus> {
  const user = await loadUser(db, userId);
  return { enabled: user.totpEnabledAt !== null, recoveryLeft: user.totpRecovery.length };
}

/** Lager en ny hemmelighet. Den gjelder ikke før brukeren har bekreftet med en kode fra appen. */
export async function beginTotpSetup(db: Db, userId: string): Promise<{ secret: string; uri: string }> {
  const user = await loadUser(db, userId);
  if (user.totpEnabledAt) throw new TwoFactorError("Tofaktorinnlogging er allerede slått på");
  const secret = newTotpSecret();
  await db
    .update(users)
    .set({ totpSecret: await encryptSecret(secret), totpLastStep: null })
    .where(eq(users.id, userId));
  const base32 = base32Encode(secret);
  return { secret: base32, uri: otpauthUri(base32, user.email) };
}

/** Slår på tofaktor når koden fra appen stemmer. Returnerer reservekodene i klartekst, bare denne ene gangen. */
export async function confirmTotpSetup(db: Db, userId: string, code: string, now = Date.now()): Promise<string[]> {
  const user = await loadUser(db, userId);
  if (!user.totpSecret || user.totpEnabledAt) throw new TwoFactorError("Start oppsettet på nytt");
  const step = await verifyTotp(await decryptSecret(user.totpSecret), code, now, null);
  if (step === null) {
    throw new TwoFactorError("Koden stemmer ikke. Skriv inn koden som vises i appen nå, og sjekk at klokken på telefonen er riktig.");
  }
  const codes = newRecoveryCodes();
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(now), totpLastStep: step, totpRecovery: await Promise.all(codes.map(hashRecoveryCode)) })
    .where(eq(users.id, userId));
  await log(db, userId, "user.2fa_enabled");
  return codes;
}

/**
 * Sjekker andre steg ved innlogging: en kode fra appen eller en reservekode. Begge kan brukes bare én gang,
 * også om to forsøk kommer samtidig, fordi oppdateringen bare treffer hvis koden fortsatt er ubrukt.
 */
export async function verifySecondFactor(db: Db, userId: string, input: string, now = Date.now()): Promise<"app" | "reservekode" | null> {
  const user = await loadUser(db, userId);
  if (!user.totpEnabledAt || !user.totpSecret) return null;
  const clean = input.trim();

  if (/^\d{3}\s?\d{3}$/.test(clean)) {
    const step = await verifyTotp(await decryptSecret(user.totpSecret), clean, now, user.totpLastStep);
    if (step === null) return null;
    const claimed = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
      .returning({ id: users.id });
    return claimed.length ? "app" : null;
  }

  const hash = await hashRecoveryCode(clean);
  if (!user.totpRecovery.includes(hash)) return null;
  // «jsonb - tekst» tar verdien ut av lista, «jsonb ? tekst» sjekker at den fortsatt er der.
  const claimed = await db
    .update(users)
    .set({ totpRecovery: sql`${users.totpRecovery} - ${hash}::text` })
    .where(and(eq(users.id, userId), sql`${users.totpRecovery} ? ${hash}::text`))
    .returning({ id: users.id });
  if (!claimed.length) return null;
  await log(db, userId, "user.2fa_recovery_used", { left: user.totpRecovery.length - 1 });
  return "reservekode";
}

const clearedTotp = { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: [] as string[] };

/** Slår av tofaktor. Krever en gyldig kode, så en åpen økt på en lånt maskin ikke er nok. */
export async function disableTotp(db: Db, userId: string, code: string, now = Date.now()) {
  if (!(await verifySecondFactor(db, userId, code, now))) throw new TwoFactorError("Koden stemmer ikke");
  await db.update(users).set(clearedTotp).where(eq(users.id, userId));
  await log(db, userId, "user.2fa_disabled");
}

/** Nye reservekoder, for eksempel når de gamle er brukt opp. De gamle slutter å virke. */
export async function renewRecoveryCodes(db: Db, userId: string, code: string, now = Date.now()): Promise<string[]> {
  if (!(await verifySecondFactor(db, userId, code, now))) throw new TwoFactorError("Koden stemmer ikke");
  const codes = newRecoveryCodes();
  await db
    .update(users)
    .set({ totpRecovery: await Promise.all(codes.map(hashRecoveryCode)) })
    .where(eq(users.id, userId));
  await log(db, userId, "user.2fa_recovery_renewed");
  return codes;
}

/** For plattformadmin: nullstiller tofaktor for en bruker som har mistet både telefon og reservekoder. */
export async function resetTotpForUser(db: Db, adminUserId: string, email: string) {
  const [target] = await db
    .update(users)
    .set(clearedTotp)
    .where(eq(users.email, email.trim().toLowerCase()))
    .returning({ id: users.id });
  if (!target) throw new TwoFactorError("Fant ingen bruker med den e-postadressen");
  await log(db, target.id, "user.2fa_reset", { by: adminUserId });
}
