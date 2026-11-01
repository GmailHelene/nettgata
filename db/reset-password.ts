import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { createPgliteDb } from "./pglite";
import { runScript } from "./run-script";
import { auditLog, users } from "./schema";

/**
 * Brukes av scripts/nytt-passord.ps1. Viser admin-brukerne, og setter nytt passord når
 * RESET_EMAIL og RESET_PASSWORD er satt. Uten DATABASE_URL brukes den lokale databasen.
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  let db: Db;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url)) as unknown as Db;
  } else {
    db = await createPgliteDb(".data/pglite");
  }

  const email = process.env.RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_PASSWORD ?? "";
  if (!email) {
    const admins = await db.select({ email: users.email }).from(users).where(eq(users.isPlatformAdmin, true));
    console.log(admins.length ? `Du logger inn i studioet med: ${admins.map((a) => a.email).join(", ")}` : "Fant ingen admin-bruker.");
    return;
  }
  if (password.length < 12) throw new Error("Passordet må ha minst 12 tegn. Ingenting er endret.");
  const [user] = await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 12) })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error(`Fant ingen bruker med e-posten ${email}. Ingenting er endret.`);
  await db.insert(auditLog).values({ siteId: null, userId: user.id, action: "user.password_reset", detail: { via: "skript" } });
  console.log(`Nytt passord er satt for ${email}.`);
}

runScript(main);
