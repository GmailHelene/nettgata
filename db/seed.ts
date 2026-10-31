import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { memberships, organizations, pages, sites, users } from "./schema";
import { demoFrontpage, demoTheme } from "./demo";
import { themeContrastProblems } from "@/lib/theme";
import { publishPage } from "@/lib/publishing";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Sett SEED_ADMIN_EMAIL og SEED_ADMIN_PASSWORD (minst 12 tegn) i .env.local");
  }
  const problems = themeContrastProblems(demoTheme);
  if (problems.length) throw new Error(problems.join("\n"));

  const db = await getDb();
  const [existing] = await db.select().from(sites).where(eq(sites.slug, "demo")).limit(1);
  if (existing) {
    console.log("Demo-nettstedet finnes allerede, hopper over.");
    return;
  }

  const [admin] = await db
    .insert(users)
    .values({ email, name: "Helene", passwordHash: await bcrypt.hash(password, 12), isPlatformAdmin: true })
    .onConflictDoUpdate({ target: users.email, set: { isPlatformAdmin: true } })
    .returning();
  const [org] = await db.insert(organizations).values({ name: "Demo Rør AS" }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId: admin.id, role: "owner" });
  const [site] = await db
    .insert(sites)
    .values({ orgId: org.id, name: "Demo Rør AS", slug: "demo", industryPack: "handverker", theme: demoTheme })
    .returning();

  const [front] = await db
    .insert(pages)
    .values({ siteId: site.id, path: "/", title: "Forside", draft: demoFrontpage, sortOrder: 0 })
    .returning();
  await publishPage(db, front.id, admin.id);

  console.log(`Ferdig. Studio: http://localhost:3000/studio  Nettsted: http://demo.localhost:3000`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
  console.error(err);
  process.exit(1);
});
