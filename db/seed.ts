import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { pages, sites, users } from "./schema";
import { demoFrontpage, demoInfo } from "./demo";
import { createSiteFromPack } from "@/lib/sites";
import { publishPage } from "@/lib/publishing";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Sett SEED_ADMIN_EMAIL og SEED_ADMIN_PASSWORD (minst 12 tegn) i .env.local");
  }

  const db = await getDb();
  const [admin] = await db
    .insert(users)
    .values({ email, name: "Helene", passwordHash: await bcrypt.hash(password, 12), isPlatformAdmin: true })
    .onConflictDoUpdate({ target: users.email, set: { isPlatformAdmin: true } })
    .returning();

  const [existing] = await db.select().from(sites).where(eq(sites.slug, "demo")).limit(1);
  if (existing) {
    console.log("Demo-nettstedet finnes allerede, hopper over.");
    return;
  }

  const site = await createSiteFromPack(db, {
    name: "Demo Rør AS",
    packKey: "handverker",
    designKey: "solid",
    info: demoInfo,
    ownerId: admin.id,
    publish: true,
  });
  // «demo» er reservert for vanlige kunder, men seed-skriptet får bruke den.
  await db.update(sites).set({ slug: "demo" }).where(eq(sites.id, site.id));
  const [front] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.siteId, site.id), eq(pages.path, "/")))
    .limit(1);
  await db.update(pages).set({ draft: demoFrontpage }).where(eq(pages.id, front.id));
  await publishPage(db, front.id, admin.id);

  console.log("Ferdig. Studio: http://localhost:3000/studio  Nettsted: http://demo.localhost:3000");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
