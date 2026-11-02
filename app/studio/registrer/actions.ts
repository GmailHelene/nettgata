"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { getDb } from "@/db";
import { getEmailProvider } from "@/lib/email/send";
import { clientIp, clientKey, hit, reset, rules } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import {
  AccountError,
  confirmEmail,
  emailHash,
  normalizeEmail,
  registerAccount,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  type AccountDeps,
} from "@/lib/selvbetjening/konto";
import { verifyTurnstile } from "@/lib/selvbetjening/turnstile";
import { createSession, getCurrentUser } from "@/lib/session";
import { platformUrl } from "@/lib/site-url";

/** Svaret til skjemaene. `field` peker på feltet med feil, så skjemaet kan koble meldingen til det. */
export type AccountState = { ok: boolean; message: string; field?: AccountError["field"]; email?: string } | null;

const TOO_MANY = "For mange forsøk. Vent en time og prøv igjen.";
const BOT_CHECK = "Sjekken av at du er et menneske gikk ikke gjennom. Last inn siden på nytt og prøv igjen.";
const SENT_MESSAGE =
  "Sjekk e-posten din. Er adressen ny hos Nettgata, har du fått en lenke for å bekrefte den. Har du konto fra før, har du fått en e-post om det. Finner du ingenting, se i søppelpost.";
const RESENT_MESSAGE = "Er adressen registrert og ikke bekreftet ennå, er en ny lenke på vei. Den virker i 48 timer.";
const RESET_SENT_MESSAGE = "Har adressen en konto hos Nettgata, får du en e-post med lenke for å lage nytt passord. Lenken virker i én time.";

/** Lenkene i e-postene går alltid til plattformens hovedadresse, aldri til vertsnavnet i forespørselen. */
async function deps(): Promise<AccountDeps> {
  return { db: await getDb(), provider: getEmailProvider(), baseUrl: platformUrl() };
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function ipKey(prefix: string) {
  return `${prefix}:${await clientKey(await headers(), getSecret())}`;
}

function toState(err: unknown, email?: string): AccountState {
  unstable_rethrow(err);
  if (err instanceof AccountError) return { ok: false, message: err.message, field: err.field, email };
  console.error("Konto feilet", err instanceof Error ? err.name : "ukjent");
  return { ok: false, message: "Noe gikk galt. Prøv igjen om litt.", email };
}

/**
 * Registrering. Svaret er det samme om adressen finnes eller ikke. Roboter som fyller ut honningkrukka,
 * får samme svar som alle andre, uten at noe lagres eller sendes.
 */
export async function registerAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const email = normalizeEmail(text(formData, "email"));
  try {
    if (text(formData, "nettsted")) return { ok: true, message: SENT_MESSAGE, email };
    const d = await deps();
    const h = await headers();
    if (!(await hit(d.db, await ipKey("signup-ip"), rules.signupPerIp))) return { ok: false, message: TOO_MANY, email };
    if (email && !(await hit(d.db, `signup-email:${await emailHash(email)}`, rules.signupPerEmail))) return { ok: false, message: TOO_MANY, email };
    if (!(await verifyTurnstile(text(formData, "cf-turnstile-response"), clientIp(h)))) return { ok: false, message: BOT_CHECK, email };
    await registerAccount(d, {
      email,
      password: text(formData, "password"),
      name: text(formData, "name"),
      acceptedTerms: formData.get("terms") === "ja",
    });
    return { ok: true, message: SENT_MESSAGE, email };
  } catch (err) {
    return toState(err, email);
  }
}

/** «Send lenken på nytt» etter registreringen. Samme svar for alle adresser. */
export async function resendVerificationAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const email = normalizeEmail(text(formData, "email"));
  try {
    const d = await deps();
    if (!(await hit(d.db, await ipKey("verify-resend-ip"), rules.verifyResendPerIp))) return { ok: false, message: TOO_MANY, email };
    if (!(await hit(d.db, `verify-resend:${await emailHash(email)}`, rules.verifyResendPerEmail))) return { ok: false, message: TOO_MANY, email };
    await resendVerification(d, email);
    return { ok: true, message: RESENT_MESSAGE, email };
  } catch (err) {
    return toState(err, email);
  }
}

/** Samme som over, for den som er logget inn med en konto som ikke er bekreftet. */
export async function resendOwnVerificationAction(): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/logg-inn");
  if (user.emailVerified) return { ok: true, message: "E-posten er allerede bekreftet." };
  try {
    const d = await deps();
    if (!(await hit(d.db, `verify-resend:${await emailHash(user.email)}`, rules.verifyResendPerEmail))) return { ok: false, message: TOO_MANY };
    await resendVerification(d, user.email);
    return { ok: true, message: `En ny lenke er sendt til ${user.email}. Den virker i 48 timer.` };
  } catch (err) {
    return toState(err);
  }
}

/**
 * Bekrefter e-posten. Siden med lenken viser bare en knapp, så programmer som åpner lenker i e-post for å sjekke
 * dem, ikke bruker opp lenken. Logger inn og sender videre til veiviseren for nytt nettsted.
 */
export async function confirmEmailAction(token: string): Promise<AccountState> {
  let userId: string;
  try {
    const d = await deps();
    if (!(await hit(d.db, await ipKey("verify-link-ip"), rules.verifyLinkPerIp))) return { ok: false, message: TOO_MANY };
    userId = (await confirmEmail(d, String(token))).id;
  } catch (err) {
    return toState(err);
  }
  // Ny økt etter bekreftelsen. En eldre økt i samme nettleser byttes ut.
  await createSession(userId);
  redirect("/studio/nytt?velkommen=1");
}

/** «Glemt passord». Samme svar for alle adresser. */
export async function requestResetAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const email = normalizeEmail(text(formData, "email"));
  try {
    if (text(formData, "nettsted")) return { ok: true, message: RESET_SENT_MESSAGE, email };
    const d = await deps();
    const h = await headers();
    if (!(await hit(d.db, await ipKey("reset-ip"), rules.resetPerIp))) return { ok: false, message: TOO_MANY, email };
    if (!(await hit(d.db, `reset-email:${await emailHash(email)}`, rules.resetPerEmail))) return { ok: false, message: TOO_MANY, email };
    if (!(await verifyTurnstile(text(formData, "cf-turnstile-response"), clientIp(h)))) return { ok: false, message: BOT_CHECK, email };
    await requestPasswordReset(d, email);
    return { ok: true, message: RESET_SENT_MESSAGE, email };
  } catch (err) {
    return toState(err, email);
  }
}

/** Lagrer nytt passord. Alle gamle økter slutter å virke, og brukeren logger inn på nytt (med tofaktor, hvis den er på). */
export async function resetPasswordAction(token: string, _prev: AccountState, formData: FormData): Promise<AccountState> {
  try {
    const d = await deps();
    if (!(await hit(d.db, await ipKey("reset-submit-ip"), rules.resetSubmitPerIp))) return { ok: false, message: "For mange forsøk. Vent 15 minutter og prøv igjen." };
    const password = text(formData, "password");
    if (password !== text(formData, "confirm")) return { ok: false, message: "Passordene er ikke like. Skriv det samme passordet to ganger.", field: "password" };
    const user = await resetPassword(d, String(token), password);
    // Innloggingen var kanskje sperret etter for mange feil. Med nytt passord starter den på nytt.
    await reset(d.db, `login-email:${user.email}`);
  } catch (err) {
    return toState(err);
  }
  redirect("/studio/logg-inn?passord=byttet");
}
