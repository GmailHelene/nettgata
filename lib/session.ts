import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { memberships, sites, users } from "@/db/schema";
import { getSecret } from "@/lib/secret";
import { touchSite, touchUserSites } from "@/lib/selvbetjening/aktivitet";

const COOKIE = "sesjon";
const AUDIENCE = "studio";
const MAX_AGE = 60 * 60 * 24 * 14;

/**
 * Kort avtrykk av passordhashen, lagt i økten. Når passordet byttes (db/reset-password.ts eller ny invitasjon),
 * slutter alle gamle økter å virke, også en som er stjålet. Selve hashen havner aldri i informasjonskapselen.
 */
export async function passwordStamp(passwordHash: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nettgata-okt:${passwordHash}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string) {
  const db = await getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Fant ikke brukeren");
  const token = await new SignJWT({ sub: userId, pw: await passwordStamp(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  // Innlogging teller som aktivitet, så ubetalte nettsteder ikke slettes mens eieren fortsatt bruker kontoen.
  await touchUserSites(db, userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/studio",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete({ name: COOKIE, path: "/studio" });
}

/**
 * Mellomsteg ved tofaktor: passordet var riktig, men koden mangler. Egen informasjonskapsel med eget
 * publikum, så den aldri kan brukes som innlogget økt. Gjelder i fem minutter.
 */
const PENDING_COOKIE = "sesjon-kode";
const PENDING_AUDIENCE = "studio-tofaktor";
const PENDING_MAX_AGE = 5 * 60;

export async function createPendingSecondFactor(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PENDING_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MAX_AGE}s`)
    .sign(getSecret());
  (await cookies()).set(PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/studio",
    maxAge: PENDING_MAX_AGE,
  });
}

/** Brukeren som venter på andre steg, eller null hvis mellomsteget mangler eller er utløpt. */
export async function readPendingSecondFactor(): Promise<string | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: PENDING_AUDIENCE, algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function clearPendingSecondFactor() {
  (await cookies()).delete({ name: PENDING_COOKIE, path: "/studio" });
}

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const db = await getDb();
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isPlatformAdmin: users.isPlatformAdmin,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        totpEnabledAt: users.totpEnabledAt,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    if (!row || payload.pw !== (await passwordStamp(row.passwordHash))) return null;
    // Plattformadmin ser alle nettsteder og alle kunders data. I produksjon gjelder admintilgangen derfor bare med
    // tofaktor slått på. Uten er brukeren en vanlig bruker til tofaktor er satt opp under Konto.
    const adminNeeds2fa = row.isPlatformAdmin && !row.totpEnabledAt && process.env.NODE_ENV === "production";
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      isPlatformAdmin: row.isPlatformAdmin && !adminNeeds2fa,
      ...(adminNeeds2fa && { adminNeeds2fa: true as const }),
      emailVerified: Boolean(row.emailVerifiedAt),
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/logg-inn");
  return user;
}

type SiteAccess = { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; site: typeof sites.$inferSelect; role: "owner" | "editor" | "developer" };

/** Som requireSiteAccess, men returnerer null i stedet for å omdirigere. Til API-ruter. */
export async function checkSiteAccess(siteId: string): Promise<SiteAccess | null> {
  if (!/^[0-9a-f-]{36}$/.test(siteId)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return null;
  if (user.isPlatformAdmin) return { user, site, role: "owner" };
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, site.orgId), eq(memberships.userId, user.id)))
    .limit(1);
  if (!membership) return null;
  await touchSite(db, site);
  return { user, site, role: membership.role };
}

/**
 * Tilgangssjekk som må kjøres i hver Server Action og side som rører et nettsted.
 * Plattformadmin (Helene) har tilgang til alt.
 */
export async function requireSiteAccess(siteId: string): Promise<SiteAccess> {
  await requireUser();
  const access = await checkSiteAccess(siteId);
  if (!access) redirect("/studio");
  return access;
}
