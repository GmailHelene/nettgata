import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoFrontpage, demoTheme } from "@/db/demo";
import { domains, organizations, pages, sites, users } from "@/db/schema";
import { resolveSiteByHost } from "@/lib/hosts";
import { getPublishedPage, listVersions, publishPage, PublishingError, restoreVersion, saveDraft } from "@/lib/publishing";

let db: Db;
let userId: string;
let siteId: string;
let pageId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
  const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
  const [site] = await db
    .insert(sites)
    .values({ orgId: org.id, name: "Demo", slug: "demo", industryPack: "handverker", theme: demoTheme })
    .returning();
  const [page] = await db.insert(pages).values({ siteId: site.id, path: "/", title: "Forside", draft: demoFrontpage }).returning();
  userId = user.id;
  siteId = site.id;
  pageId = page.id;
});

const withHeading = (text: string) => ({
  ...demoFrontpage,
  sections: demoFrontpage.sections.map((s) => (s.id === "hero" ? { ...s, props: { ...s.props, overskrift: text } } : s)),
});
const heading = (content: { sections: { id: string; props: Record<string, unknown> }[] }) =>
  content.sections.find((s) => s.id === "hero")?.props.overskrift;

describe("publisering", () => {
  it("viser ingenting før siden er publisert", async () => {
    expect(await getPublishedPage(db, siteId, "/")).toBeNull();
  });

  it("kladd påvirker ikke live før publisering", async () => {
    await publishPage(db, pageId, userId);
    await saveDraft(db, pageId, { title: "Forside", content: withHeading("Ny overskrift") }, userId);
    const live = await getPublishedPage(db, siteId, "/");
    expect(heading(live!.content)).toBe(demoFrontpage.sections[0].props.overskrift);

    await publishPage(db, pageId, userId);
    const after = await getPublishedPage(db, siteId, "/");
    expect(heading(after!.content)).toBe("Ny overskrift");
    expect(after!.versionNumber).toBe(2);
  });

  it("gjenoppretter en eldre versjon som ny versjon og setter kladden lik den", async () => {
    const v1 = await publishPage(db, pageId, userId);
    await saveDraft(db, pageId, { title: "Forside", content: withHeading("Feil endring") }, userId);
    await publishPage(db, pageId, userId);

    const restored = await restoreVersion(db, pageId, v1.id, userId);
    expect(restored.number).toBe(3);
    const live = await getPublishedPage(db, siteId, "/");
    expect(heading(live!.content)).toBe(demoFrontpage.sections[0].props.overskrift);
    const [page] = await db.select().from(pages);
    expect(heading(page.draft)).toBe(demoFrontpage.sections[0].props.overskrift);
    expect((await listVersions(db, pageId)).map((v) => v.number)).toEqual([3, 2, 1]);
  });

  it("avviser ugyldig innhold og farlige lenker", async () => {
    const bad = {
      ...demoFrontpage,
      sections: [{ id: "h", type: "hero", variant: "standard", props: { overskrift: "Hei", knappLenke: "javascript:alert(1)" } }],
    };
    await expect(saveDraft(db, pageId, { title: "Forside", content: bad }, userId)).rejects.toBeInstanceOf(PublishingError);
    const missing = { ...demoFrontpage, sections: [{ id: "h", type: "hero", variant: "standard", props: {} }] };
    await expect(saveDraft(db, pageId, { title: "Forside", content: missing }, userId)).rejects.toThrow(/Overskrift/);
  });

  it("finner riktig side uansett store bokstaver og skråstrek", async () => {
    await db.insert(pages).values({ siteId, path: "/tjenester", title: "Tjenester", draft: demoFrontpage }).returning();
    const [p] = await db.select().from(pages).where((await import("drizzle-orm")).eq(pages.path, "/tjenester"));
    await publishPage(db, p.id, userId);
    expect(await getPublishedPage(db, siteId, "/Tjenester/")).not.toBeNull();
  });
});

describe("domeneoppslag", () => {
  it("finner nettsted på gratis underdomene", async () => {
    expect((await resolveSiteByHost(db, "Demo.helene.cloud:443"))?.id).toBe(siteId);
    expect(await resolveSiteByHost(db, "ukjent.helene.cloud")).toBeNull();
    expect(await resolveSiteByHost(db, "helene.cloud")).toBeNull();
  });

  it("finner nettsted på eget domene bare når domenet er aktivt", async () => {
    await db.insert(domains).values({ siteId, hostname: "demo-ror.no", status: "pending" });
    expect(await resolveSiteByHost(db, "demo-ror.no")).toBeNull();
    const { eq } = await import("drizzle-orm");
    await db.update(domains).set({ status: "active" }).where(eq(domains.hostname, "demo-ror.no"));
    expect((await resolveSiteByHost(db, "DEMO-ROR.NO"))?.id).toBe(siteId);
  });
});
