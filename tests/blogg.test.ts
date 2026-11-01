import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { pages, sites, users } from "@/db/schema";
import { SectionPreview } from "@/components/sections";
import { validatePageContent } from "@/lib/content/registry";
import { createPost } from "@/lib/pages";
import { publishPage, saveDraft } from "@/lib/publishing";
import { buildRenderContext } from "@/lib/render";
import { createSiteFromPack } from "@/lib/sites";
import { buildTheme } from "@/lib/themes";

let db: Db;
let userId: string;
let siteId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  siteId = (await createSiteFromPack(db, { name: "Kafeen", packKey: "kafe", info: demoInfo, ownerId: userId })).id;
});

describe("blogg", () => {
  it("lager bloggsiden første gang, og innlegg utenfor menyen med egne adresser", async () => {
    const first = await createPost(db, siteId, { title: "Ny meny til jul" }, userId);
    const again = await createPost(db, siteId, { title: "Ny meny til jul" }, userId);
    expect(first.path).toBe("/blogg/ny-meny-til-jul");
    expect(again.path).toBe("/blogg/ny-meny-til-jul-2");
    // Lange titler kuttes ved et ordskille, ikke midt i et ord, og vanlige ord som «da» blir stående.
    const long = await createPost(db, siteId, { title: "Slik lager du den beste julegrøten i hele Modum, med mandel og rømme" }, userId);
    expect(long.path).toBe("/blogg/slik-lager-du-den-beste-julegroten-i-hele-modum-med-mandel");
    expect((await createPost(db, siteId, { title: "Da vi åpnet" }, userId)).path).toBe("/blogg/da-vi-apnet");
    expect(first.showInMenu).toBe(false);
    const blog = await db.select().from(pages).where(eq(pages.path, "/blogg"));
    expect(blog).toHaveLength(1);
    expect(blog[0].showInMenu).toBe(true);
    for (const page of [blog[0], first]) expect(validatePageContent(page.draft).ok).toBe(true);
  });

  it("viser bare publiserte innlegg på nettstedet, men alle i forhåndsvisningen", async () => {
    const published = await createPost(db, siteId, { title: "Åpent i romjula" }, userId);
    await createPost(db, siteId, { title: "Hemmelig kladd" }, userId);
    // Malteksten i et nytt innlegg stopper publisering til innlegget faktisk er skrevet.
    await expect(publishPage(db, published.id, userId)).rejects.toThrow(/fylles inn før publisering: Toppseksjon, Tekst/);
    const sections = [
      { id: "ingress", type: "hero", variant: "standard", props: { overskrift: published.title, undertekst: "Kafeen holder åpent alle dager mellom jul og nyttår." } },
      { id: "tekst", type: "tekst", variant: "standard", props: { brodtekst: "Vafler og kaffe hele romjula, som vanlig." } },
    ];
    await saveDraft(db, published.id, { title: published.title, content: { seo: { title: published.title }, sections } }, userId);
    await publishPage(db, published.id, userId);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));

    const live = await buildRenderContext(db, site, "/blogg", false, "", { posts: true });
    expect(live.posts?.map((p) => p.title)).toEqual(["Åpent i romjula"]);
    expect(live.posts?.[0].excerpt).toMatch(/mellom jul og nyttår/);

    const preview = await buildRenderContext(db, site, "/blogg", true);
    expect(preview.posts?.map((p) => p.title).sort()).toEqual(["Hemmelig kladd", "Åpent i romjula"]);

    // Uten bloggseksjon på siden hentes ingenting.
    expect((await buildRenderContext(db, site, "/", false)).posts).toBeUndefined();
  });

  it("tegner oversikten med lenke, norsk dato og smakebit", async () => {
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    const ctx = await buildRenderContext(db, site, "/blogg", true);
    ctx.posts = [{ path: "/blogg/jul", title: "Ny meny til jul", excerpt: "Ribbe og pinnekjøtt.", image: null, date: "2026-11-01T10:00:00.000Z" }];
    const html = renderToStaticMarkup(
      createElement(SectionPreview, {
        section: { id: "b", type: "blogg", variant: "liste", props: { overskrift: "Blogg", antall: "3" } },
        theme: buildTheme("bistro")!,
        ctx,
      }),
    );
    expect(html).toContain('href="/blogg/jul"');
    expect(html).toContain("1. november 2026");
    expect(html).toContain("Ribbe og pinnekjøtt.");
  });
});
