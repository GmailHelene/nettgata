import { SignJWT, jwtVerify } from "jose";
import { getSecret } from "@/lib/secret";

const AUDIENCE = "preview";

/** Hemmelig lenke til kladden. Kan deles med andre og utløper etter 7 dager. */
export async function createPreviewToken(pageId: string, ttl = "7d"): Promise<string> {
  return new SignJWT({ pageId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getSecret());
}

export async function verifyPreviewToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE, algorithms: ["HS256"] });
    return typeof payload.pageId === "string" ? payload.pageId : null;
  } catch {
    return null;
  }
}
