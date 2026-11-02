import { SignJWT, jwtVerify } from "jose";
import { getSecret } from "@/lib/secret";

/*
 * Signerte nøkler i lenkene i e-postene. Ingenting av dem lagres, og de kan ikke lages uten SESSION_SECRET.
 * Bekreftelsen gjelder én bestemt påmelding (tidspunktet ligger i nøkkelen) og utløper etter 30 dager,
 * samme frist som ubekreftede påmeldinger slettes etter. Avmeldingen utløper aldri: den skal virke i gamle nyhetsbrev også.
 */

const CONFIRM = "nyhetsbrev-bekreft";
const UNSUBSCRIBE = "nyhetsbrev-avmeld";
export const CONFIRM_TTL_DAYS = 30;

export async function createConfirmToken(subscriberId: string, consentedAt: Date, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ s: subscriberId, c: consentedAt.getTime() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(CONFIRM)
    .setIssuedAt(iat)
    .setExpirationTime(iat + CONFIRM_TTL_DAYS * 86_400)
    .sign(getSecret());
}

export async function readConfirmToken(token: string, now = new Date()): Promise<{ subscriberId: string; consentedAt: number } | "utlopt" | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: CONFIRM, algorithms: ["HS256"], currentDate: now });
    return typeof payload.s === "string" && typeof payload.c === "number" ? { subscriberId: payload.s, consentedAt: payload.c } : null;
  } catch (err) {
    return (err as { code?: string }).code === "ERR_JWT_EXPIRED" ? "utlopt" : null;
  }
}

export async function createUnsubscribeToken(subscriberId: string): Promise<string> {
  return new SignJWT({ s: subscriberId }).setProtectedHeader({ alg: "HS256" }).setAudience(UNSUBSCRIBE).sign(getSecret());
}

export async function readUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: UNSUBSCRIBE, algorithms: ["HS256"] });
    return typeof payload.s === "string" ? payload.s : null;
  } catch {
    return null;
  }
}
