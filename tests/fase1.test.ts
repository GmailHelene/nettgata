import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoInfo } from "@/db/demo";
import { pages, sites, users } from "@/db/schema";
import { isValidOrgnr, lookupOrgnr, tidyName } from "@/lib/brreg";
import { validatePageContent } from "@/lib/content/registry";
import { packs } from "@/lib/packs";
import { createPage, deletePage, isValidPagePath, movePage, publishAll, updateSiteSettings } from "@/lib/pages";
import { getPublishedPage, PublishingError } from "@/lib/publishing";
import { hit, reset } from "@/lib/rate-limit";
import { buildRenderContext } from "@/lib/render";
import { readSiteInfo, siteInfoSchema } from "@/lib/site-info";
import { createSiteFromPack, isValidSlug, slugify } from "@/lib/sites";
import { themeContrastProblems } from "@/lib/theme";

let db: Db;
let userId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [user] = await db.insert(users).values({ email: "helene@test.no", passwordHash: "x", isPlatformAdmin: true }).returning();
  userId = user.id;
});

const newSite = (overrides: Partial<Parameters<typeof createSiteFromPack>[1]> = {}) =>
  createSiteFromPack(db, { name: "Rørlegger Hansen AS", packKey: "handverker", designKey: "solid", info: demoInfo, ownerId: userId, ...overrides });

describe("bransjepakker", () => {
  it("alle designretninger holder WCAG-kontrast", () => {
    for (const pack of Object.values(packs)) {
      for (const design of pack.designs) expect(themeContrastProblems(design.theme), `${pack.key}/${design.key}`).toEqual([]);
    }
  });

  it("gjentar ikke stedsnavnet når det står i firmanavnet", () => {
    const [front] = packs.handverker.pages({ name: "Rør Modum AS", city: "Modum" });
    expect(front.content.seo.title).toBe("Rør Modum AS");
  });

  it("alt innhold i pakkene er gyldig og har forside", () => {
    for (const pack of Object.values(packs)) {
      const pagesInPack = pack.pages({ name: "Test AS", city: "Åmot" });
      expect(pagesInPack.some((p) => p.path === "/")).toBe(true);
      for (const p of pagesInPack) expect(validatePageContent(p.content).ok, `${pack.key}${p.path}`).toBe(true);
    }
  });
});

describe("nytt nettsted", () => {
  it("lager alle sidene som kladd uten å publisere", async () => {
    const site = await newSite();
    expect(site.slug).toBe("rorlegger-hansen");
    const rows = await db.select().from(pages).where(eq(pages.siteId, site.id));
    expect(rows.map((r) => r.path).sort()).toEqual(["/", "/kontakt", "/tjenester"]);
    expect(rows.every((r) => r.publishedVersionId === null)).toBe(true);
  });

  it("gir ledig adresse når navnet er tatt, og godtar ikke reserverte", async () => {
    await newSite();
    expect((await newSite()).slug).toBe("rorlegger-hansen-2");
    expect((await newSite({ slug: "studio" })).slug).not.toBe("studio");
    expect(isValidSlug("demo")).toBe(false);
    expect(slugify("Åsheim & Ødegård Maling AS")).toBe("asheim-odegard-maling");
  });

  it("publiser alle gjør nettstedet synlig, med meny fra sidene", async () => {
    const site = await newSite();
    expect(await publishAll(db, site.id, userId)).toBe(3);
    expect(await getPublishedPage(db, site.id, "/kontakt")).not.toBeNull();
    const ctx = await buildRenderContext(db, site, "/", false);
    expect(ctx.nav.map((n) => n.path)).toEqual(["/", "/tjenester", "/kontakt"]);
    expect(ctx.site.schemaType).toBe("HomeAndConstructionBusiness");
    expect(ctx.site.info.city).toBe("Åmot");
  });

  it("avviser ugyldig kontaktinfo", async () => {
    await expect(newSite({ info: { ...demoInfo, postalCode: "33" } })).rejects.toThrow(/Postnummer/);
  });
});

describe("sider", () => {
  it("lager, flytter og sletter sider, men aldri forsiden", async () => {
    const site = await newSite();
    const page = await createPage(db, site.id, { title: "Om oss", path: "" }, userId);
    expect(page.path).toBe("/om-oss");
    await expect(createPage(db, site.id, { title: "Om oss", path: "/om-oss" }, userId)).rejects.toThrow(/allerede/);
    await expect(createPage(db, site.id, { title: "X", path: "/studio" }, userId)).rejects.toBeInstanceOf(PublishingError);

    await movePage(db, site.id, page.id, -1);
    const ordered = await db.select().from(pages).where(eq(pages.siteId, site.id)).orderBy(pages.sortOrder);
    expect(ordered.map((p) => p.path)).toEqual(["/", "/tjenester", "/om-oss", "/kontakt"]);

    const [front] = ordered;
    await expect(deletePage(db, site.id, front.id, userId)).rejects.toThrow(/Forsiden/);
    await deletePage(db, site.id, page.id, userId);
    expect((await db.select().from(pages).where(eq(pages.siteId, site.id))).length).toBe(3);
  });

  it("validerer adresser", () => {
    expect(isValidPagePath("/priser")).toBe(true);
    expect(isValidPagePath("/bad/flislegging")).toBe(true);
    for (const bad of ["/", "/Store", "/a b", "/robots.txt", "/studio/x", "//x"]) expect(isValidPagePath(bad)).toBe(false);
  });
});

describe("innstillinger", () => {
  it("lagrer info og designretning, og avviser feil", async () => {
    const site = await newSite();
    await updateSiteSettings(db, site.id, { name: "Hansen Rør", info: { ...demoInfo, phone: "123" }, designKey: "kontrast" }, userId);
    const [updated] = await db.select().from(sites).where(eq(sites.id, site.id));
    expect(updated.name).toBe("Hansen Rør");
    expect(readSiteInfo(updated.info).phone).toBe("123");
    expect(updated.theme.background).toBe("#15191d");
    await expect(updateSiteSettings(db, site.id, { name: "H", info: {}, designKey: "solid" }, userId)).rejects.toThrow(/Navnet/);
  });

  it("fyller inn standardverdier og normaliserer org.nr.", () => {
    expect(readSiteInfo(null).openingHours).toEqual([]);
    expect(siteInfoSchema.parse({ orgnr: "927 889 404" }).orgnr).toBe("927889404");
    expect(siteInfoSchema.safeParse({ email: "ikke-epost" }).success).toBe(false);
  });
});

describe("rate limiting", () => {
  it("stopper etter grensen og slipper til igjen etter vinduet", async () => {
    const rule = { limit: 2, windowSeconds: 60 };
    const t0 = new Date("2026-11-01T10:00:00Z");
    expect(await hit(db, "k", rule, t0)).toBe(true);
    expect(await hit(db, "k", rule, t0)).toBe(true);
    expect(await hit(db, "k", rule, t0)).toBe(false);
    expect(await hit(db, "k", rule, new Date(t0.getTime() + 61_000))).toBe(true);
    await reset(db, "k");
    expect(await hit(db, "k", rule, t0)).toBe(true);
  });
});

describe("Brønnøysundregistrene", () => {
  it("sjekker kontrollsiffer", () => {
    expect(isValidOrgnr("974760673")).toBe(true);
    expect(isValidOrgnr("927889404")).toBe(true);
    expect(isValidOrgnr("974760674")).toBe(false);
    expect(isValidOrgnr("12345678")).toBe(false);
  });

  it("rydder navn fra registeret", () => {
    expect(tidyName("RØRLEGGER HANSEN AS")).toBe("Rørlegger Hansen AS");
    expect(tidyName("ÅSHEIM-GRØNBERG ENK")).toBe("Åsheim-Grønberg ENK");
    expect(tidyName("REGISTERENHETEN I BRØNNØYSUND")).toBe("Registerenheten i Brønnøysund");
    expect(tidyName("I TRE OG STEIN AS")).toBe("I Tre og Stein AS");
  });

  it("henter navn og adresse, og tåler feil fra registeret", async () => {
    const ok = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          navn: "RØRLEGGER HANSEN AS",
          forretningsadresse: { adresse: ["Storgata 1"], postnummer: "3340", poststed: "ÅMOT" },
          naeringskode1: { kode: "43.221", beskrivelse: "Rørleggerarbeid" },
        }),
      ),
    );
    expect(await lookupOrgnr("974 760 673", ok)).toMatchObject({ name: "Rørlegger Hansen AS", city: "Åmot", postalCode: "3340" });
    expect(await lookupOrgnr("974760673", vi.fn().mockResolvedValue(new Response("", { status: 404 })))).toBeNull();
    expect(await lookupOrgnr("974760673", vi.fn().mockRejectedValue(new Error("nett nede")))).toBeNull();
    const deleted = vi.fn().mockResolvedValue(new Response(JSON.stringify({ navn: "X", slettedato: "2020-01-01" })));
    expect(await lookupOrgnr("974760673", deleted)).toBeNull();
    const never = vi.fn();
    expect(await lookupOrgnr("123", never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});
