import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { memberships, sites, users } from "@/db/schema";
import { getSecret } from "@/lib/secret";

const COOKIE = "sesjon";
const AUDIENCE = "studio";
const MAX_AGE = 60 * 60 * 24 * 14;

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
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

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE, algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const db = await getDb();
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, isPlatformAdmin: users.isPlatformAdmin })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/studio/logg-inn");
  return user;
}

/**
 * Tilgangssjekk som må kjøres i hver Server Action og side som rører et nettsted.
 * Plattformadmin (Helene) har tilgang til alt.
 */
export async function requireSiteAccess(siteId: string) {
  const user = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect("/studio");
  if (user.isPlatformAdmin) return { user, site, role: "owner" as const };
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, site.orgId), eq(memberships.userId, user.id)))
    .limit(1);
  if (!membership) redirect("/studio");
  return { user, site, role: membership.role };
}
