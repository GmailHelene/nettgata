import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { sameKey } from "@/lib/cron";
import { getSecret } from "@/lib/secret";
import { passwordStamp } from "@/lib/session";

/**
 * Lenkene i e-postene om kontoen: bekreft e-post (48 timer) og nytt passord (1 time). Signert med SESSION_SECRET
 * (HS256, sjekket med crypto.subtle i konstant tid), og hver sort har sitt eget publikum, så en lenke aldri kan
 * brukes som noe annet. Ingenting lagres i databasen.
 *
 * Lenkene kan brukes én gang fordi de er bundet til tilstanden de endrer: bekreftelsen gjelder bare så lenge
 * e-posten ikke er bekreftet, og passordlenken har et avtrykk av passordhashen, som er byttet når den er brukt.
 */

export const VERIFY_HOURS = 48;
export const RESET_MINUTES = 60;

const VERIFY_AUDIENCE = "konto-bekreft";
const RESET_AUDIENCE = "konto-passord";

export async function createVerifyToken(user: { id: string; email: string }, now = new Date()): Promise<string> {
  return new SignJWT({ sub: user.id, em: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(VERIFY_AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + VERIFY_HOURS * 3600)
    .sign(getSecret());
}

export async function createResetToken(user: { id: string; passwordHash: string }, now = new Date()): Promise<string> {
  return new SignJWT({ sub: user.id, pw: await passwordStamp(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(RESET_AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + RESET_MINUTES * 60)
    .sign(getSecret());
}

async function read(token: string, audience: string, now: Date) {
  if (!token || token.length > 1000) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience, algorithms: ["HS256"], currentDate: now });
    return typeof payload.sub === "string" ? payload : null;
  } catch {
    return null;
  }
}

/** Brukeren bak en bekreftelseslenke, hvis lenken er gyldig og e-posten ikke er bekreftet ennå. */
export async function readVerifyToken(db: Db, token: string, now = new Date()) {
  const payload = await read(token, VERIFY_AUDIENCE, now);
  if (!payload || typeof payload.em !== "string") return null;
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub!)).limit(1);
  if (!user || user.emailVerifiedAt || !sameKey(user.email, payload.em)) return null;
  return user;
}

/** Brukeren bak en lenke for nytt passord, hvis lenken er gyldig og passordet ikke er byttet siden. */
export async function readResetToken(db: Db, token: string, now = new Date()) {
  const payload = await read(token, RESET_AUDIENCE, now);
  if (!payload || typeof payload.pw !== "string") return null;
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub!)).limit(1);
  if (!user || !sameKey(await passwordStamp(user.passwordHash), payload.pw)) return null;
  return user;
}
