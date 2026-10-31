"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { qrSvg } from "@/lib/qr";
import { hit, reset, rules } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { beginTotpSetup, confirmTotpSetup, disableTotp, renewRecoveryCodes, resetTotpForUser, TwoFactorError } from "@/lib/two-factor";
import type { ActionState } from "./actions";

type CodesResult = { ok: true; codes: string[] } | { ok: false; message: string };

function failure(err: unknown): { ok: false; message: string } {
  unstable_rethrow(err);
  if (err instanceof TwoFactorError) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Noe gikk galt. Prøv igjen." };
}

/** Sperre mot gjetting, felles med innloggingen: fem forsøk per kvarter. */
async function guard(userId: string) {
  const db = await getDb();
  const key = `totp:${userId}`;
  if (!(await hit(db, key, rules.totpPerUser))) throw new TwoFactorError("For mange forsøk. Vent 15 minutter og prøv igjen.");
  return { db, done: () => reset(db, key) };
}

/** Steg 1: ny hemmelighet, som QR-kode og som tekst for den som vil skrive den inn selv. */
export async function startTwoFactorAction(): Promise<{ ok: true; secret: string; qr: string } | { ok: false; message: string }> {
  try {
    const user = await requireUser();
    const { secret, uri } = await beginTotpSetup(await getDb(), user.id);
    const svg = qrSvg(uri, "QR-kode for tofaktorinnlogging i Nettgata");
    return { ok: true, secret, qr: `data:image/svg+xml;base64,${btoa(svg)}` };
  } catch (err) {
    return failure(err);
  }
}

/** Steg 2: koden fra appen bekrefter oppsettet. Reservekodene vises bare i dette svaret. */
export async function confirmTwoFactorAction(code: string): Promise<CodesResult> {
  try {
    const user = await requireUser();
    const { db, done } = await guard(user.id);
    const codes = await confirmTotpSetup(db, user.id, code);
    await done();
    revalidatePath("/studio/konto");
    return { ok: true, codes };
  } catch (err) {
    return failure(err);
  }
}

export async function disableTwoFactorAction(code: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { db, done } = await guard(user.id);
    await disableTotp(db, user.id, code);
    await done();
    revalidatePath("/studio/konto");
    return { ok: true, message: "Tofaktorinnlogging er slått av." };
  } catch (err) {
    return failure(err);
  }
}

export async function renewRecoveryCodesAction(code: string): Promise<CodesResult> {
  try {
    const user = await requireUser();
    const { db, done } = await guard(user.id);
    const codes = await renewRecoveryCodes(db, user.id, code);
    await done();
    revalidatePath("/studio/konto");
    return { ok: true, codes };
  } catch (err) {
    return failure(err);
  }
}

/** Bare for plattformadmin: for kunder som har mistet både telefon og reservekoder. */
export async function resetTwoFactorAction(email: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (!user.isPlatformAdmin) return { ok: false, message: "Bare plattformadmin kan nullstille tofaktor for andre." };
    await resetTotpForUser(await getDb(), user.id, email);
    return { ok: true, message: `Tofaktor er nullstilt for ${email.trim().toLowerCase()}. Be kunden sette det opp på nytt.` };
  } catch (err) {
    return failure(err);
  }
}
