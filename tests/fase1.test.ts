import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoInfo } from "@/db/demo";
import { pages, sites, users } from "@/db/schema";
import { isValidOrgnr, lookupOrgnr, tidyName } from "@/lib/brreg";
import { validatePageContent } from "@/lib/content/registry";
import { packs } from "@/lib/packs";
import { createPage, deletePage, isValidPagePath, movePage, publishAll, updateSiteSettings, updateSiteTheme } from "@/lib/pages";
import { getPublishedPage, PublishingError, saveDraft } from "@/lib/publishing";
import { hit, reset } from "@/lib/rate-limit";
import { buildRenderContext } from "@/lib/render";
import { readSiteInfo, siteInfoSchema } from "@/lib/site-info";
import { createSiteFromPack, isValidSlug, slugify } from "@/lib/sites";
import { buildTheme, getThemeDef } from "@/lib/themes";

let db: Db;
let userId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [user] = await db.insert(users).values({ email: "helene@test.no", passwordHash: "x", isPlatformAdmin: true }).returning();
  userId = user.id;
});

const newSite = (overrides: Partial<Parameters<typeof createSiteFromPack>[1]> = {}) =>
  createSiteFromPack(db, { name: "Rørlegger Hansen AS", packKey: "handverker", themeKey: "verksted", paletteKey: "stal", info: demoInfo, ownerId: userId, ...overrides });

/** Det kunden gjør i redigereren: bytter hver «Skriv ...»-tekst med ekte tekst. */
const fillIn = (value: unknown): unknown =>
  typeof value === "string"
    ? value.replace(/^Skriv (?!til\b|en melding\b)[\s\S]*/, "Ekte tekst fra bedriften.")
    : Array.isArray(value)
      ? value.map(fillIn)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillIn(v)]))
        : value;

describe("bransjepakker", () => {
  it("anbefaler bare temaer som finnes", () => {
    for (const pack of Object.values(packs)) {
      expect(pack.themes.length, pack.key).toBeGreaterThan(0);
      for (const key of pack.themes) expect(getThemeDef(key), `${pack.key}/${key}`).not.toBeNull();
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
      for (const p of pagesInPack) {
        // Pakkene er kladder. Det eneste som kan stoppe publisering, er eksempelbilder kunden skal bytte.
        expect(validatePageContent(p.content, "draft").ok, `${pack.key}${p.path}`).toBe(true);
        const published = validatePageContent(p.content);
        const blockers = published.ok ? [] : published.errors.filter((e) => !/eksempelbilde/i.test(e.message));
        expect(blockers, `${pack.key}${p.path}`).toEqual([]);
      }
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
    // Forsiden i håndverkerpakken har «Skriv ...»-tekst kunden skal bytte ut, så den stoppes. De to andre publiseres.
    const first = await publishAll(db, site.id, userId);
    expect(first.published).toBe(2);
    expect(first.failed.map((f) => f.title)).toEqual(["Forside"]);
    expect(first.failed[0].message).toMatch(/fylles inn/);
    expect(await getPublishedPage(db, site.id, "/")).toBeNull();

    // Når kunden har skrevet teksten, går alt igjennom.
    const [front] = await db.select().from(pages).where(and(eq(pages.siteId, site.id), eq(pages.path, "/")));
    await saveDraft(db, front.id, { title: front.title, content: fillIn(front.draft) }, userId);
    expect(await publishAll(db, site.id, userId)).toEqual({ published: 3, failed: [] });
    expect(await getPublishedPage(db, site.id, "/kontakt")).not.toBeNull();
    const ctx = await buildRenderContext(db, site, "/", false);
    expect(ctx.nav.map((n) => n.path)).toEqual(["/", "/tjenester", "/kontakt"]);
    expect(ctx.site.schemaType).toBe("HomeAndConstructionBusiness");
    expect(ctx.site.info.city).toBe("Åmot");
  });

  it("avviser ugyldig kontaktinfo", async () => {
    await expect(newSite({ info: { ...demoInfo, postalCode: "33" } })).rejects.toThrow(/Postnummer/);
    await expect(newSite({ info: { ...demoInfo, phone: "ring meg" } })).rejects.toThrow(/åtte siffer/);
    await expect(newSite({ info: { ...demoInfo, phone: "+47 32 78" } })).rejects.toThrow(/åtte siffer/);
    expect((await newSite({ info: { ...demoInfo, phone: "+47 (32) 78-00-00" } })).info).toMatchObject({ phone: "+47 (32) 78-00-00" });
  });

  it("leser gammel kontaktinfo selv om telefonen ikke følger dagens regel", () => {
    // Ellers ville et gammelt telefonformat visket ut adresse og åpningstider på nettstedet.
    const info = readSiteInfo({ ...demoInfo, phone: "32780000 (dagtid)" });
    expect(info.phone).toBe("32780000 (dagtid)");
    expect(info.city).toBe(demoInfo.city);
  });
});

describe("sider", () => {
  it("lager, flytter og sletter sider, men aldri forsiden", async () => {
    const site = await newSite();
    const page = await createPage(db, site.id, { title: "Om oss", path: "" }, userId);
    expect(page.path).toBe("/om-oss");
    // Norske bokstaver i tittelen gir en gyldig adresse, ikke en feilmelding.
    expect((await createPage(db, site.id, { title: "Våre tjenester på Åmot", path: "" }, userId)).path).toBe("/vare-tjenester-pa-amot");
    await expect(createPage(db, site.id, { title: "Om oss", path: "/om-oss" }, userId)).rejects.toThrow(/allerede/);
    await expect(createPage(db, site.id, { title: "X", path: "/studio" }, userId)).rejects.toBeInstanceOf(PublishingError);

    await movePage(db, site.id, page.id, -1);
    const ordered = await db.select().from(pages).where(eq(pages.siteId, site.id)).orderBy(pages.sortOrder);
    expect(ordered.map((p) => p.path)).toEqual(["/", "/tjenester", "/om-oss", "/kontakt", "/vare-tjenester-pa-amot"]);

    const [front] = ordered;
    await expect(deletePage(db, site.id, front.id, userId)).rejects.toThrow(/Forsiden/);
    await deletePage(db, site.id, page.id, userId);
    expect((await db.select().from(pages).where(eq(pages.siteId, site.id))).length).toBe(4);
  });

  it("validerer adresser", () => {
    expect(isValidPagePath("/priser")).toBe(true);
    expect(isValidPagePath("/bad/flislegging")).toBe(true);
    for (const bad of ["/", "/Store", "/a b", "/robots.txt", "/studio/x", "//x"]) expect(isValidPagePath(bad)).toBe(false);
  });
});

describe("innstillinger", () => {
  it("lagrer info, og avviser feil", async () => {
    const site = await newSite();
    await updateSiteSettings(db, site.id, { name: "Hansen Rør", info: { ...demoInfo, phone: "32 78 00 00" } }, userId);
    const [updated] = await db.select().from(sites).where(eq(sites.id, site.id));
    expect(updated.name).toBe("Hansen Rør");
    expect(readSiteInfo(updated.info).phone).toBe("32 78 00 00");
    await expect(updateSiteSettings(db, site.id, { name: "Hansen Rør", info: { ...demoInfo, phone: "123" } }, userId)).rejects.toThrow(/åtte siffer/);
    expect(updated.theme.preset).toEqual({ theme: "verksted", palette: "stal" });
    await expect(updateSiteSettings(db, site.id, { name: "H", info: {} }, userId)).rejects.toThrow(/Navnet/);
  });

  it("bytter tema uten å røre innholdet, og stopper temaer som bryter kontrastkravet", async () => {
    const site = await newSite();
    const before = await db.select({ draft: pages.draft }).from(pages).where(eq(pages.siteId, site.id));
    const atelier = buildTheme("atelier", "champagne")!;
    await updateSiteTheme(db, site.id, { ...atelier, header: "farget" }, userId);
    const [updated] = await db.select().from(sites).where(eq(sites.id, site.id));
    expect(updated.theme).toMatchObject({ background: "#1b1816", header: "farget", preset: { theme: "atelier", palette: "champagne" } });
    expect(await db.select({ draft: pages.draft }).from(pages).where(eq(pages.siteId, site.id))).toEqual(before);
    await expect(updateSiteTheme(db, site.id, { ...atelier, muted: "#3a3330" }, userId)).rejects.toThrow(/Dempet tekst/);
    await expect(updateSiteTheme(db, site.id, { ...atelier, buttons: "glitter" }, userId)).rejects.toThrow(/Ugyldig tema/);
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
