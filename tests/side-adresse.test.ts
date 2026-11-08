import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoTheme } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { organizations, pages, sites, users } from "@/db/schema";
import { pageContentSchema } from "@/lib/content/types";
import { changePagePath, createPage, updateSiteSettings } from "@/lib/pages";
import { publishPage } from "@/lib/publishing";

let db: Db;
let siteId: string;
let userId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
  const [site] = await db
    .insert(sites)
    .values({ orgId: org.id, name: "Frisør", slug: "frisor", kind: "nettside", industryPack: "frisor", theme: demoTheme, redirects: [{ from: "/gammel-om", to: "/om" }] })
    .returning();
  siteId = site.id;
});

describe("ny adresse for en side", () => {
  it("flytter en publisert side og sender den gamle adressen videre, uten dobbelt hopp", async () => {
    const page = await createPage(db, siteId, { title: "Om", path: "/om" }, userId);
    await publishPage(db, page.id, userId, { allowPlaceholders: true });
    const r = await changePagePath(db, siteId, page.id, "/Om-Oss", userId);
    expect(r).toEqual({ from: "/om", to: "/om-oss", redirected: true });
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    expect(site.redirects).toEqual([
      { from: "/gammel-om", to: "/om-oss" },
      { from: "/om", to: "/om-oss" },
    ]);
  });

  it("legger ikke inn videresending for en side som aldri er publisert", async () => {
    const page = await createPage(db, siteId, { title: "Kladd", path: "/kladd" }, userId);
    expect((await changePagePath(db, siteId, page.id, "/ny-kladd", userId)).redirected).toBe(false);
    const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(row.path).toBe("/ny-kladd");
  });

  it("stopper forsiden, opptatte og ugyldige adresser", async () => {
    const home = await createPage(db, siteId, { title: "Hjem", path: "/hjem" }, userId);
    await db.update(pages).set({ path: "/" }).where(eq(pages.id, home.id));
    await expect(changePagePath(db, siteId, home.id, "/start", userId)).rejects.toThrow(/Forsiden/);
    const a = await createPage(db, siteId, { title: "A", path: "/a" }, userId);
    await createPage(db, siteId, { title: "B", path: "/b" }, userId);
    await expect(changePagePath(db, siteId, a.id, "/b", userId)).rejects.toThrow(/finnes allerede/);
    await expect(changePagePath(db, siteId, a.id, "/studio/x", userId)).rejects.toThrow(/små bokstaver/);
  });

  it("bytter det gamle navnet i Google-titlene når nettstedet får nytt navn", async () => {
    const page = await createPage(db, siteId, { title: "Kontakt", path: "/kontakt" }, userId);
    const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    await db.update(pages).set({ draft: { ...row.draft, seo: { title: "Kontakt Frisør" } } }).where(eq(pages.id, page.id));
    await updateSiteSettings(db, siteId, { name: "Klipp og Krøll", info: {} }, userId);
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.draft.seo.title).toBe("Kontakt Klipp og Krøll");
  });

  it("«Ikke vis i Google» er et gyldig valg på siden", () => {
    expect(pageContentSchema.parse({ seo: { noindex: true }, sections: [] }).seo.noindex).toBe(true);
  });
});
