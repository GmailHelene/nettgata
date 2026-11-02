import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { alreadyRegisteredEmail, resetPasswordEmail, verifyEmail, welcomeEmail } from "@/lib/email/account";
import { deliver, type EmailProvider } from "@/lib/email/send";
import { TEKSTVERSJON } from "@/lib/legal/felles";
import { getSecret } from "@/lib/secret";
import { createResetToken, createVerifyToken, readResetToken, readVerifyToken } from "./tokens";

/**
 * Selvbetjent konto: registrering, bekreftelse av e-post og nytt passord. Svarene til skjemaene er de samme
 * enten adressen finnes eller ikke, så ingen kan finne ut hvem som har konto. Det som skiller, skjer bare i e-posten.
 */

export class AccountError extends Error {
  constructor(
    message: string,
    /** Feltet feilen gjelder, så skjemaet kan peke på det (aria-describedby). */
    readonly field?: "email" | "password" | "name" | "terms",
  ) {
    super(message);
  }
}

export const PASSWORD_MIN = 12;
const PASSWORD_MAX = 200;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function checkEmail(email: string) {
  if (!emailPattern.test(email) || email.length > 120) throw new AccountError("Skriv en gyldig e-postadresse, for eksempel navn@firma.no.", "email");
}

/** Samme regler som for brukere som kommer via invitasjon (lib/invitations.ts). */
export function checkPassword(password: string) {
  if (password.length < PASSWORD_MIN) throw new AccountError(`Passordet må ha minst ${PASSWORD_MIN} tegn.`, "password");
  if (password.length > PASSWORD_MAX) throw new AccountError("Passordet er for langt.", "password");
}

/**
 * Kort kode for adressen i grensene (lib/rate-limit.ts), så e-postadressen ikke lagres i klartekst der.
 * Hemmeligheten er salt, som for IP-adressene.
 */
export async function emailHash(email: string): Promise<string> {
  const data = new Uint8Array([...getSecret(), ...new TextEncoder().encode(`epost:${normalizeEmail(email)}`)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type AccountDeps = { db: Db; provider: EmailProvider; baseUrl: string; now?: Date };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

async function sendVerification(deps: AccountDeps, user: { id: string; email: string; name: string | null }) {
  const token = await createVerifyToken(user, deps.now);
  const mail = verifyEmail({ name: firstName(user.name || "der"), link: `${deps.baseUrl}/studio/bekreft/${token}` });
  await deliver(deps.db, deps.provider, { siteId: null, kind: "konto-bekreft" }, { to: { email: user.email }, fromName: "Nettgata", ...mail });
}

/**
 * Lager en ny konto som venter på bekreftelse, og sender lenken. Finnes adressen fra før, får eieren en e-post
 * om det i stedet, og ingenting endres. Kaster bare for feil i skjemaet, aldri for at adressen finnes.
 */
export async function registerAccount(deps: AccountDeps, input: { email: string; password: string; name: string; acceptedTerms: boolean }) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!name || name.length > 100) throw new AccountError("Skriv navnet ditt.", "name");
  checkEmail(email);
  checkPassword(input.password);
  if (!input.acceptedTerms) throw new AccountError("Du må godta vilkårene og databehandleravtalen for å lage konto.", "terms");

  // Hashen lages også når adressen finnes, så svartiden ikke avslører hvem som har konto.
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [existing] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    const mail = alreadyRegisteredEmail({ loginLink: `${deps.baseUrl}/studio/logg-inn`, resetLink: `${deps.baseUrl}/studio/glemt-passord` });
    await deliver(deps.db, deps.provider, { siteId: null, kind: "konto-finnes" }, { to: { email }, fromName: "Nettgata", ...mail });
    return;
  }

  const [user] = await deps.db
    .insert(users)
    .values({ email, name, passwordHash })
    .onConflictDoNothing()
    .returning({ id: users.id, email: users.email, name: users.name });
  // To registreringer med samme adresse samtidig: den andre gjør ingenting.
  if (!user) return;
  await deps.db.insert(auditLog).values({
    userId: user.id,
    action: "account.registered",
    // Hvilken versjon av vilkårene og databehandleravtalen som ble godtatt, og når (createdAt), er beviset om noen spør.
    detail: { vilkar: TEKSTVERSJON, databehandleravtale: TEKSTVERSJON },
  });
  await sendVerification(deps, user);
}

/** «Send bekreftelsen på nytt». Gjør ingenting for adresser som ikke finnes eller alt er bekreftet. */
export async function resendVerification(deps: AccountDeps, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!emailPattern.test(email)) return;
  const [user] = await deps.db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.emailVerifiedAt)))
    .limit(1);
  if (user) await sendVerification(deps, user);
}

/**
 * Bekrefter e-posten fra lenken. Lenken virker én gang: etterpå er e-posten bekreftet, og samme lenke avvises.
 * Sender velkomst-e-posten. Gir tilbake brukeren, så handlingen kan logge inn.
 */
export async function confirmEmail(deps: AccountDeps, token: string) {
  const now = deps.now ?? new Date();
  const user = await readVerifyToken(deps.db, token, now);
  if (!user) throw new AccountError("Lenken virker ikke lenger. Den kan være brukt eller for gammel. Be om en ny nedenfor.");
  const [claimed] = await deps.db
    .update(users)
    .set({ emailVerifiedAt: now })
    .where(and(eq(users.id, user.id), isNull(users.emailVerifiedAt)))
    .returning({ id: users.id });
  if (!claimed) throw new AccountError("E-posten er allerede bekreftet. Logg inn for å fortsette.");
  await deps.db.insert(auditLog).values({ userId: user.id, action: "account.email_verified" });
  const mail = welcomeEmail({
    name: firstName(user.name || "der"),
    newSiteLink: `${deps.baseUrl}/studio/nytt`,
    helpLink: `${deps.baseUrl}/studio/hjelp`,
  });
  await deliver(deps.db, deps.provider, { siteId: null, kind: "konto-velkommen" }, { to: { email: user.email }, fromName: "Nettgata", ...mail });
  return { id: user.id };
}

/** «Glemt passord». Sender lenken bare når adressen finnes, men svaret til skjemaet er det samme. */
export async function requestPasswordReset(deps: AccountDeps, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!emailPattern.test(email)) return;
  const [user] = await deps.db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return;
  const token = await createResetToken(user, deps.now);
  const mail = resetPasswordEmail({ link: `${deps.baseUrl}/studio/nytt-passord/${token}` });
  await deliver(deps.db, deps.provider, { siteId: null, kind: "konto-passord" }, { to: { email }, fromName: "Nettgata", ...mail });
}

/**
 * Lagrer nytt passord fra lenken. Den nye hashen gjør at alle gamle økter slutter å virke (passwordStamp i
 * lib/session.ts), og at samme lenke ikke kan brukes igjen. Tofaktor beholdes: brukeren logger inn som vanlig etterpå.
 * Lenken kom til e-posten, så adressen regnes som bekreftet.
 */
export async function resetPassword(deps: AccountDeps, token: string, password: string) {
  const now = deps.now ?? new Date();
  const user = await readResetToken(deps.db, token, now);
  if (!user) throw new AccountError("Lenken virker ikke lenger. Den kan være brukt eller eldre enn én time. Be om en ny.");
  checkPassword(password);
  const [updated] = await deps.db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 12), emailVerifiedAt: user.emailVerifiedAt ?? now })
    // Bare hvis passordet ikke er byttet i mellomtiden, så to samtidige forsøk med samme lenke ikke begge går.
    .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
    .returning({ id: users.id, email: users.email });
  if (!updated) throw new AccountError("Lenken er allerede brukt. Be om en ny hvis du trenger det.");
  await deps.db.insert(auditLog).values({ userId: user.id, action: "account.password_reset" });
  return updated;
}
