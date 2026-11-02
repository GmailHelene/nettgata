import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoFrontpage, demoTheme } from "@/db/demo";
import { media, organizations, pages, sites, users } from "@/db/schema";
import { canPublish, PUBLISH_NEEDS_SUBSCRIPTION } from "@/lib/billing/state";
import { embeddedServices } from "@/lib/embeds";
import { buildIco, letterIconSvg, pngSize, saveFavicon, siteIcons, smallIconSrc } from "@/lib/favicon";
import { lagPersonvernerklaering } from "@/lib/legal/personvern";
import { deleteFileBySrc, deleteMedia, listFiles, MediaError, mediaUsage, saveFile } from "@/lib/media";
import { mediaFileKeyPattern } from "@/lib/media-types";
import { copyPath, duplicatePage } from "@/lib/pages";
import { assertCanPublish, PublishingError } from "@/lib/publishing";
import { browse, isRefinedQuery, parseBrowseQuery, resultSummary } from "@/lib/shop/browse";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { readSiteLayout } from "@/lib/site-layout";
import {
  assertFetchableUrl,
  assertSitemapFetchAllowed,
  collectOldPaths,
  fetchSitemapText,
  isPublicHost,
  parseSitemapXml,
  SITEMAP_LIMIT_MESSAGE,
  SitemapError,
  suggestRedirects,
} from "@/lib/sitemap-import";
import type { MediaStore, StoredObject } from "@/lib/storage";

function memoryStore(): MediaStore & { objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    async put(key, data, contentType) {
      objects.set(key, { body: data, contentType, size: data.byteLength });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

/** Et PNG-hode med bredde og høyde. Nok til at filtypen og størrelsen kan leses. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
const PDF = new TextEncoder().encode("%PDF-1.7\n");

let db: Db;
let userId: string;
let siteId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
  const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
  const [site] = await db
    .insert(sites)
    .values({ orgId: org.id, name: "Åsheim Bakeri", slug: "asheim", industryPack: "handverker", theme: demoTheme })
    .returning();
  userId = user.id;
  siteId = site.id;
});

describe("publisering sperret til abonnementet er betalt", () => {
  it("krever betalende abonnement eller fakturering utenom Stripe, men ikke for plattformadmin", () => {
    expect(canPublish({}, false)).toBe(false);
    expect(canPublish({ status: "canceled" }, false)).toBe(false);
    expect(canPublish({ status: "incomplete" }, false)).toBe(false);
    expect(canPublish({ status: "active" }, false)).toBe(true);
    expect(canPublish({ status: "past_due" }, false)).toBe(true);
    expect(canPublish({ manual: true }, false)).toBe(true);
    expect(canPublish({}, true)).toBe(true);
  });

  it("stopper på serveren, og slipper gjennom når abonnementet er betalt", async () => {
    await expect(assertCanPublish(db, siteId, { isPlatformAdmin: false })).rejects.toThrow(PUBLISH_NEEDS_SUBSCRIPTION);
    await expect(assertCanPublish(db, siteId, { isPlatformAdmin: false })).rejects.toBeInstanceOf(PublishingError);
    await expect(assertCanPublish(db, siteId, { isPlatformAdmin: true })).resolves.toBeUndefined();

    await db.update(sites).set({ billing: { status: "active" } }).where(eq(sites.id, siteId));
    await expect(assertCanPublish(db, siteId, { isPlatformAdmin: false })).resolves.toBeUndefined();
    await db.update(sites).set({ billing: { status: "canceled", manual: true } }).where(eq(sites.id, siteId));
    await expect(assertCanPublish(db, siteId, { isPlatformAdmin: false })).resolves.toBeUndefined();
  });
});

describe("søk i nettbutikken", () => {
  const product = (name: string, categoryId: string | null): CatalogProduct => ({
    id: name,
    name,
    slug: name.toLowerCase(),
    description: "",
    images: [],
    options: [],
    vatRate: 25,
    categoryId,
    variants: [{ id: `${name}-0`, optionValues: [], label: "", priceOre: 10000, beforePriceOre: null, stock: null }],
    fromPriceOre: 10000,
    inStock: true,
    createdAt: "2026-11-01T00:00:00.000Z",
  });
  const all = [product("Rundstykke", "brod"), product("Skolebolle", "kaker"), product("Kanelsnurr", null)];

  it("finner også på kategorinavnet", () => {
    const names = { brod: "Brød", kaker: "Kaker og søtt" };
    expect(browse(all, parseBrowseQuery({ sok: "brød" }), names).map((p) => p.name)).toEqual(["Rundstykke"]);
    expect(browse(all, parseBrowseQuery({ sok: "sott" }), names).map((p) => p.name)).toEqual(["Skolebolle"]);
    // Uten kategorinavn treffer bare navnet.
    expect(browse(all, parseBrowseQuery({ sok: "brød" }))).toEqual([]);
  });

  it("sier hvor mange treff, og merker søk og filter som noindex", () => {
    expect(resultSummary(2, "bolle")).toBe("2 treff på «bolle»");
    expect(resultSummary(0, "x")).toBe("Ingen treff på «x»");
    expect(resultSummary(1)).toBe("1 vare");
    expect(isRefinedQuery(parseBrowseQuery({ sok: "bolle" }))).toBe(true);
    expect(isRefinedQuery(parseBrowseQuery({ sorter: "nyeste" }))).toBe(true);
    expect(isRefinedQuery(parseBrowseQuery({ kategori: "brod" }))).toBe(false);
    expect(isRefinedQuery(parseBrowseQuery({}))).toBe(false);
  });
});

describe("dupliser side", () => {
  it("finner en ledig adresse med -kopi", () => {
    expect(copyPath("/om-oss", new Set(["/om-oss"]))).toBe("/om-oss-kopi");
    expect(copyPath("/om-oss", new Set(["/om-oss-kopi", "/om-oss-kopi-2"]))).toBe("/om-oss-kopi-3");
    expect(copyPath("/", new Set())).toBe("/forside-kopi");
    expect(copyPath("/blogg/tur", new Set())).toBe("/blogg/tur-kopi");
  });

  it("kopierer kladden med seksjonene, ikke publisert og ikke i menyen", async () => {
    const [page] = await db.insert(pages).values({ siteId, path: "/tjenester", title: "Tjenester", draft: demoFrontpage, showInMenu: true }).returning();
    const first = await duplicatePage(db, siteId, page.id, userId);
    const second = await duplicatePage(db, siteId, page.id, userId);
    expect(first.path).toBe("/tjenester-kopi");
    expect(second.path).toBe("/tjenester-kopi-2");
    expect(first.title).toBe("Tjenester (kopi)");
    expect(first.publishedVersionId).toBeNull();
    expect(first.showInMenu).toBe(false);
    expect(first.draft).toEqual(demoFrontpage);
  });

  it("kopierer ikke sider fra et annet nettsted", async () => {
    const [org] = await db.insert(organizations).values({ name: "Annen" }).returning();
    const [other] = await db.insert(sites).values({ orgId: org.id, name: "Annen", slug: "annen", industryPack: "handverker", theme: demoTheme }).returning();
    const [page] = await db.insert(pages).values({ siteId: other.id, path: "/", title: "Forside", draft: demoFrontpage }).returning();
    await expect(duplicatePage(db, siteId, page.id, userId)).rejects.toThrow("Fant ikke siden");
  });
});

describe("import av gamle adresser fra sitemap", () => {
  const urlset = (...locs: string[]) =>
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;

  it("leser sitemap og sitemap-indeks, med entiteter og CDATA", () => {
    expect(parseSitemapXml(urlset("https://gammel.no/om-oss/", "https://gammel.no/?page_id=12&amp;x=1"))).toEqual({
      kind: "urlset",
      locs: ["https://gammel.no/om-oss/", "https://gammel.no/?page_id=12&x=1"],
    });
    const index = `<sitemapindex><sitemap><loc><![CDATA[https://gammel.no/sider.xml]]></loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(index)).toEqual({ kind: "index", locs: ["https://gammel.no/sider.xml"] });
    expect(() => parseSitemapXml("<html>ikke en sitemap</html>")).toThrow(SitemapError);
  });

  it("henter bare fra offentlige adresser (SSRF)", () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.20.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "intranett", "db.internal", "printer.local", "[::1]"]) {
      expect(isPublicHost(host), host).toBe(false);
    }
    expect(isPublicHost("gammelside.no")).toBe(true);
    expect(isPublicHost("8.8.8.8")).toBe(true);
    // URL-tolkeren gjør om tall og heksadesimal til vanlig form, så de stoppes også.
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd", "ftp://gammel.no/", "https://a:b@gammel.no/", "https://gammel.no:8080/"]) {
      expect(() => assertFetchableUrl(url), url).toThrow(SitemapError);
    }
    expect(assertFetchableUrl("https://gammel.no/sitemap.xml").hostname).toBe("gammel.no");
  });

  it("følger ikke en videresending til en intern adresse, og stopper store svar", async () => {
    const redirectInside = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
    await expect(fetchSitemapText("https://gammel.no/sitemap.xml", { fetchImpl: redirectInside })).rejects.toThrow("offentlig");
    const huge = async () => new Response("x".repeat(2000), { status: 200 });
    await expect(fetchSitemapText("https://gammel.no/sitemap.xml", { fetchImpl: huge, maxBytes: 1000 })).rejects.toThrow("for stor");
    const lying = async () => new Response("x", { status: 200, headers: { "content-length": String(10 * 1024 * 1024) } });
    await expect(fetchSitemapText("https://gammel.no/sitemap.xml", { fetchImpl: lying })).rejects.toThrow("for stor");
    const broken = async () => new Response("nei", { status: 404 });
    await expect(fetchSitemapText("https://gammel.no/sitemap.xml", { fetchImpl: broken })).rejects.toThrow("404");
  });

  it("henting fra nettet er begrenset til ti per nettsted i timen, med en tydelig melding", async () => {
    const now = new Date("2026-11-02T10:00:00Z");
    for (let i = 0; i < 10; i++) await assertSitemapFetchAllowed(db, siteId, now);
    await expect(assertSitemapFetchAllowed(db, siteId, now)).rejects.toThrow(SITEMAP_LIMIT_MESSAGE);
    await expect(assertSitemapFetchAllowed(db, siteId, now)).rejects.toBeInstanceOf(SitemapError);
    // Et annet nettsted har sin egen grense, og etter en time er det åpent igjen.
    await assertSitemapFetchAllowed(db, "00000000-0000-0000-0000-000000000000", now);
    await assertSitemapFetchAllowed(db, siteId, new Date(now.getTime() + 61 * 60 * 1000));
  });

  it("følger en indeks ett nivå ned og hopper over indekser i indeksen", async () => {
    const files: Record<string, string> = {
      "https://gammel.no/sitemap.xml": `<sitemapindex><sitemap><loc>https://gammel.no/a.xml</loc></sitemap><sitemap><loc>https://gammel.no/b.xml</loc></sitemap><sitemap><loc>http://localhost/c.xml</loc></sitemap></sitemapindex>`,
      "https://gammel.no/a.xml": urlset("https://gammel.no/", "https://gammel.no/Om-Oss.html", "https://gammel.no/kontakt/"),
      "https://gammel.no/b.xml": `<sitemapindex><sitemap><loc>https://gammel.no/dypere.xml</loc></sitemap></sitemapindex>`,
    };
    const fetched: string[] = [];
    const fetchImpl = async (url: string) => {
      fetched.push(url);
      return files[url] ? new Response(files[url]) : new Response("", { status: 404 });
    };
    const result = await collectOldPaths({ url: "https://gammel.no/sitemap.xml" }, { fetchImpl });
    expect(result.paths).toEqual(["/om-oss.html", "/kontakt"]);
    expect(result.skippedSitemaps).toBe(2);
    expect(fetched).not.toContain("https://gammel.no/dypere.xml");
    expect(fetched).not.toContain("http://localhost/c.xml");
  });

  it("foreslår siden som ligner mest, og ingenting når ingen ligner", () => {
    const pagesHere = [
      { path: "/", title: "Forside" },
      { path: "/om-oss", title: "Om oss" },
      { path: "/tjenester", title: "Tjenester og priser" },
      { path: "/kontakt", title: "Kontakt" },
    ];
    expect(suggestRedirects(["/om-oss.html", "/vare-tjenester", "/tjeneste/?p=3", "/kontakt", "/xyz-2019"], pagesHere)).toEqual([
      { from: "/om-oss.html", suggestion: "/om-oss", exists: false },
      { from: "/vare-tjenester", suggestion: "/tjenester", exists: false },
      { from: "/tjeneste/?p=3", suggestion: "/tjenester", exists: false },
      { from: "/kontakt", suggestion: null, exists: true },
      { from: "/xyz-2019", suggestion: null, exists: false },
    ]);
  });
});

describe("PDF-filer i mediebiblioteket", () => {
  it("lister filene og sletter dem bare når de ikke er i bruk", async () => {
    const store = memoryStore();
    const file = await saveFile(db, store, { siteId, userId, bytes: PDF, name: "Meny høst.pdf" });
    expect(await listFiles(db, siteId)).toMatchObject([{ src: file.src, name: "Meny høst.pdf", size: PDF.byteLength }]);

    const draft = {
      sections: [{ id: "f", type: "filer", variant: "liste", props: { filer: [{ tittel: "Meny", fil: { src: file.src, name: "Meny høst.pdf" } }] } }],
    };
    await db.insert(pages).values({ siteId, path: "/meny", title: "Meny", draft: draft as never });
    const usage = await mediaUsage(db, siteId);
    expect(usage.get(file.src.slice("/media/".length))).toEqual([expect.objectContaining({ label: "Siden «Meny»" })]);
    await expect(deleteFileBySrc(db, store, { siteId, src: file.src, userId })).rejects.toThrow("Filen brukes fortsatt");

    await db.delete(pages).where(eq(pages.siteId, siteId));
    await deleteFileBySrc(db, store, { siteId, src: file.src, userId });
    expect(await listFiles(db, siteId)).toEqual([]);
    expect(store.objects.size).toBe(0);
  });

  it("sletter ikke filer fra et annet nettsted eller andre adresser", async () => {
    const store = memoryStore();
    await expect(deleteFileBySrc(db, store, { siteId, src: "/media/../../hemmelig", userId })).rejects.toBeInstanceOf(MediaError);
    await expect(deleteFileBySrc(db, store, { siteId, src: `/media/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`, userId })).rejects.toThrow("Fant ikke filen");
  });
});

describe("ikon i nettleserfanen", () => {
  it("leser størrelsen fra PNG-hodet og pakker PNG i ICO", () => {
    expect(pngSize(png(180, 180))).toEqual({ width: 180, height: 180 });
    expect(pngSize(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    const ico = buildIco([{ bytes: png(48, 48), size: 48 }]);
    const view = new DataView(ico.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 1]);
    expect(ico[6]).toBe(48);
    expect(view.getUint32(6 + 12, true)).toBe(22);
    expect(ico.slice(22, 26)).toEqual(png(48, 48).slice(0, 4));
  });

  it("lager bokstavikon i temafargene, med escaping", () => {
    const svg = letterIconSvg("Åsheim Bakeri", demoTheme);
    expect(svg).toContain(">Å</text>");
    expect(svg).toContain(`fill="${demoTheme.primary}"`);
    expect(letterIconSvg("<script>", demoTheme)).not.toContain("<script>");
    const icons = siteIcons({ name: "Åsheim Bakeri", theme: demoTheme, layout: {} }) as { icon: { url: string }[] };
    expect(icons.icon[0].url.startsWith("data:image/svg+xml,")).toBe(true);
  });

  it("lagrer 180 og 48 px, beholder resten av oppsettet og beskytter bildet mot sletting", async () => {
    const store = memoryStore();
    const logo = { src: `/media/${siteId}/${crypto.randomUUID()}.webp`, alt: "Logo" };
    await db.update(sites).set({ layout: { logo, footerText: "Velkommen" } }).where(eq(sites.id, siteId));
    await expect(saveFavicon(db, store, { siteId, userId, icon: png(64, 64), small: png(48, 48) })).rejects.toThrow("180 px");
    await expect(saveFavicon(db, store, { siteId, userId, icon: png(180, 180), small: png(32, 32) })).rejects.toThrow("48 px");

    const src = await saveFavicon(db, store, { siteId, userId, icon: png(180, 180), small: png(48, 48) });
    expect(store.objects.has(smallIconSrc(src).slice("/media/".length))).toBe(true);
    expect(mediaFileKeyPattern.test(smallIconSrc(src).slice("/media/".length))).toBe(true);
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    const layout = readSiteLayout(site.layout);
    expect(layout.favicon).toEqual({ src });
    expect(layout.logo).toEqual(logo);
    expect(layout.footerText).toBe("Velkommen");
    expect((siteIcons(site) as { apple: { url: string }[] }).apple[0].url).toBe(src);

    const [row] = await db.select().from(media).where(eq(media.siteId, siteId));
    await expect(deleteMedia(db, store, { siteId, mediaId: row.id, userId })).rejects.toThrow("Ikonet i nettleserfanen");
    await db.update(sites).set({ layout: { ...site.layout, favicon: null } }).where(eq(sites.id, siteId));
    await deleteMedia(db, store, { siteId, mediaId: row.id, userId });
    expect(store.objects.size).toBe(0);
  });
});

describe("personvern for kart og video", () => {
  const virksomhet = { navn: "Åsheim Bakeri", info: { email: "post@asheim.no" } } as never;
  const text = (content: { sections: { props: Record<string, unknown> }[] }) => JSON.stringify(content);

  it("ser bare på seksjoner som laster noe ved trykk", () => {
    const content = (sections: object[]) => ({ sections }) as never;
    expect(embeddedServices([content([{ id: "k", type: "kart", variant: "kart", props: {} }])])).toEqual({ kart: true, video: false });
    expect(embeddedServices([content([{ id: "k", type: "kart", variant: "lenker", props: {} }])])).toEqual({ kart: false, video: false });
    expect(embeddedServices([content([{ id: "k", type: "kart", variant: "kart", hidden: true, props: {} }])])).toEqual({ kart: false, video: false });
    expect(
      embeddedServices([content([{ id: "v", type: "video", variant: "standard", props: { lenke: "https://youtu.be/dQw4w9WgXcQ" } }])]),
    ).toEqual({ kart: false, video: true });
  });

  it("tar med avsnittet bare når kart eller video er i bruk", () => {
    expect(text(lagPersonvernerklaering({ virksomhet, type: "nettside" }))).not.toContain("Kart og video");
    const kart = text(lagPersonvernerklaering({ virksomhet, type: "nettside", innebygd: { kart: true } }));
    expect(kart).toContain("Kart og video");
    expect(kart).toContain("Kartet kommer fra Google Maps");
    expect(kart).not.toContain("youtube-nocookie");
    const begge = text(lagPersonvernerklaering({ virksomhet, type: "nettside", innebygd: { kart: true, video: true } }));
    expect(begge).toContain("youtube-nocookie.com");
    expect(begge).toContain("ekomloven § 3-15");
    expect(begge).not.toMatch(/[–—]/);
  });
});
