import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { inquiries, sites, users, visitDays, visitHashes, visitPages, visitSources } from "@/db/schema";
import { createBackup } from "@/lib/backup";
import { runRetention } from "@/lib/retention";
import { getSecret } from "@/lib/secret";
import { createSiteFromPack } from "@/lib/sites";
import {
  deviceOf,
  inquiriesPerMonth,
  isBot,
  lastMonths,
  MAX_VIEWS_PER_VISITOR,
  mergeSources,
  parseHit,
  parsePeriod,
  recordVisit,
  sourceOf,
  visitorHash,
  visitStats,
  type VisitInput,
} from "@/lib/statistikk";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const secret = new TextEncoder().encode("test-hemmelighet-som-er-minst-32-tegn-lang");

describe("statistikk uten database", () => {
  it("kjenner igjen roboter og skript, men ikke vanlige nettlesere", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130.0 Safari/537.36")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(CHROME)).toBe(false);
    expect(isBot(IPHONE)).toBe(false);
  });

  it("skiller mobil fra datamaskin", () => {
    expect(deviceOf(IPHONE)).toBe("mobil");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("mobil");
    expect(deviceOf(CHROME)).toBe("datamaskin");
  });

  it("lagrer bare vertsnavnet til kilden, og besøk fra eget nettsted er ikke et nytt besøk", () => {
    expect(sourceOf("https://www.google.no/search?q=fris%C3%B8r+modum", "salong.no")).toBe("google.no");
    expect(sourceOf("https://l.facebook.com/l.php?u=https%3A%2F%2Fsalong.no", "salong.no")).toBe("l.facebook.com");
    expect(sourceOf("", "salong.no")).toBe("");
    expect(sourceOf("ikke en adresse", "salong.no")).toBe("");
    expect(sourceOf("https://salong.no/om-oss", "www.salong.no")).toBeNull();
    expect(sourceOf("https://www.salong.no/", "salong.no")).toBeNull();
  });

  it("slår sammen kilder med samme navn og sorterer etter antall", () => {
    const merged = mergeSources([
      { source: "google.no", count: 3 },
      { source: "google.com", count: 2 },
      { source: "", count: 4 },
      { source: "l.facebook.com", count: 1 },
      { source: "m.facebook.com", count: 1 },
      { source: "blogg.example.no", count: 1 },
    ]);
    expect(merged).toEqual([
      { label: "Google", count: 5 },
      { label: "Direkte eller ukjent", count: 4 },
      { label: "Facebook", count: 2 },
      { label: "blogg.example.no", count: 1 },
    ]);
  });

  it("leser meldingen fra nettleseren og fjerner spørring og fragment", () => {
    expect(parseHit(JSON.stringify({ p: "/Om-Oss/?token=hemmelig#topp", r: "https://google.no/", e: 1 }))).toEqual({
      path: "/om-oss",
      referrer: "https://google.no/",
      entry: true,
    });
    expect(parseHit(JSON.stringify({ p: "/bl%C3%A5b%C3%A6r" }))).toEqual({ path: "/blåbær", referrer: "", entry: false });
    expect(parseHit(JSON.stringify({ p: "https://annen.no/" }))).toBeNull();
    expect(parseHit(JSON.stringify({ p: "/" + "a".repeat(300) }))).toBeNull();
    expect(parseHit("{ikke json")).toBeNull();
    expect(parseHit("")).toBeNull();
  });

  it("koden for besøkende byttes hver dag og er ulik på hvert nettsted", async () => {
    const a = await visitorHash(secret, "2026-11-02", "site-a", "203.0.113.7", CHROME);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
    expect(await visitorHash(secret, "2026-11-02", "site-a", "203.0.113.7", CHROME)).toBe(a);
    expect(await visitorHash(secret, "2026-11-03", "site-a", "203.0.113.7", CHROME)).not.toBe(a);
    expect(await visitorHash(secret, "2026-11-02", "site-b", "203.0.113.7", CHROME)).not.toBe(a);
    expect(await visitorHash(secret, "2026-11-02", "site-a", "203.0.113.8", CHROME)).not.toBe(a);
  });

  it("godtar bare periodene i studioet", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod("90")).toBe(90);
    expect(parsePeriod("365")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
  });

  it("gir de siste månedene i norsk tid", () => {
    // 31. desember klokka 23:30 UTC er nyttårsdag i Norge.
    expect(lastMonths(3, new Date("2026-12-31T23:30:00Z"))).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("statistikk i databasen", () => {
  let db: Db;
  let siteId: string;
  let host: string;
  const now = new Date("2026-11-02T10:00:00Z");

  const visit = (input: Partial<VisitInput>, at = now) =>
    recordVisit(db, secret, { host, path: "/", referrer: "", entry: true, ip: "203.0.113.7", userAgent: CHROME, ...input }, at);

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
    const site = await createSiteFromPack(db, { name: "Salong Åsheim", packKey: "handverker", info: demoInfo, ownerId: user.id, publish: true });
    siteId = site.id;
    host = `${site.slug}.helene.cloud`;
  });

  it("teller visninger, besøkende per dag, mobil og sider", async () => {
    expect(await visit({ path: "/" })).toBe("telt");
    expect(await visit({ path: "/om-oss", entry: false, referrer: "" })).toBe("telt");
    expect(await visit({ path: "/", ip: "198.51.100.2", userAgent: IPHONE })).toBe("telt");

    const [day] = await db.select().from(visitDays).where(eq(visitDays.siteId, siteId));
    expect(day).toMatchObject({ day: "2026-11-02", views: 3, visitors: 2, mobileVisitors: 1 });
    const pageRows = await db.select().from(visitPages).where(eq(visitPages.siteId, siteId));
    expect(Object.fromEntries(pageRows.map((p) => [p.path, p.views]))).toEqual({ "/": 2, "/om-oss": 1 });
    // IP-adressen og nettleseren finnes ikke i klartekst noe sted.
    const hashes = await db.select().from(visitHashes);
    expect(hashes).toHaveLength(2);
    expect(JSON.stringify(hashes)).not.toMatch(/203\.0\.113|iPhone/);
  });

  it("teller kilden bare for første side i besøket, og ikke når besøkende kom fra eget nettsted", async () => {
    await visit({ referrer: "https://www.google.no/search?q=salong" });
    await visit({ path: "/priser", entry: false });
    await visit({ ip: "198.51.100.2", referrer: `https://${host}/priser` });
    await visit({ ip: "198.51.100.3", referrer: "" });
    const rows = await db.select().from(visitSources).where(eq(visitSources.siteId, siteId));
    expect(Object.fromEntries(rows.map((r) => [r.source, r.visits]))).toEqual({ "google.no": 1, "": 1 });
  });

  it("dagen følger norsk tid", async () => {
    await visit({}, new Date("2026-11-02T23:30:00Z"));
    const [day] = await db.select().from(visitDays);
    expect(day.day).toBe("2026-11-03");
  });

  it("teller ikke ukjente vertsnavn, upubliserte nettsteder eller adresser som sendes videre", async () => {
    expect(await visit({ host: "finnes-ikke.helene.cloud" })).toBe("ukjent-nettsted");
    expect(await visit({ host: "example.org" })).toBe("ukjent-nettsted");

    const [user] = await db.select().from(users).limit(1);
    const draft = await createSiteFromPack(db, { name: "Kladd AS", packKey: "handverker", info: demoInfo, ownerId: user.id });
    expect(await visit({ host: `${draft.slug}.helene.cloud` })).toBe("ikke-publisert");
    expect(await db.select().from(visitDays)).toHaveLength(0);
  });

  it("slutter å telle en besøkende som sender urimelig mange visninger", async () => {
    const hash = await visitorHash(secret, "2026-11-02", siteId, "203.0.113.7", CHROME);
    await db.insert(visitHashes).values({ siteId, day: "2026-11-02", hash, views: MAX_VIEWS_PER_VISITOR });
    expect(await visit({})).toBe("over-grensen");
    expect(await db.select().from(visitDays)).toHaveLength(0);
  });

  it("oppsummerer perioden med tomme dager, mest leste sider og sammenslåtte kilder", async () => {
    await visit({ path: "/", referrer: "https://www.google.no/" }, new Date("2026-10-30T10:00:00Z"));
    await visit({ path: "/priser", referrer: "https://google.com/" }, now);
    await visit({ path: "/priser", ip: "198.51.100.2", userAgent: IPHONE }, now);
    // Utenfor perioden på sju dager.
    await visit({ path: "/gammel" }, new Date("2026-10-20T10:00:00Z"));

    const stats = await visitStats(db, siteId, 7, now);
    expect(stats.from).toBe("2026-10-27");
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.find((d) => d.date === "2026-10-31")).toEqual({ date: "2026-10-31", views: 0, visitors: 0 });
    expect(stats.views).toBe(3);
    expect(stats.visitors).toBe(3);
    expect(stats.mobile).toBe(1);
    expect(stats.pages).toEqual([
      { label: "/priser", count: 2 },
      { label: "/", count: 1 },
    ]);
    expect(stats.sources).toEqual([
      { label: "Google", count: 2 },
      { label: "Direkte eller ukjent", count: 1 },
    ]);
  });

  it("teller henvendelser per måned i norsk tid", async () => {
    await db.insert(inquiries).values([
      { siteId, name: "A", message: "Hei", createdAt: new Date("2026-10-31T23:30:00Z") },
      { siteId, name: "B", message: "Hei", createdAt: new Date("2026-10-15T10:00:00Z") },
      { siteId, name: "C", message: "Hei", createdAt: new Date("2025-01-15T10:00:00Z") },
    ]);
    const months = await inquiriesPerMonth(db, siteId, 3, now);
    expect(months).toEqual([
      { month: "2026-09", count: 0 },
      { month: "2026-10", count: 1 },
      { month: "2026-11", count: 1 },
    ]);
  });

  it("sletter gårsdagens koder hver natt og gamle tall etter to år, og koden kommer aldri i sikkerhetskopien", async () => {
    await visit({}, new Date("2026-11-01T20:00:00Z"));
    await visit({}, new Date("2026-11-02T08:00:00Z"));
    await db.insert(visitDays).values({ siteId, day: "2024-10-01", views: 5, visitors: 4 });
    await db.insert(visitPages).values({ siteId, day: "2024-10-01", path: "/", views: 5 });

    const backup = await createBackup(db);
    expect(backup.tables.visit_hashes).toBeUndefined();
    expect(backup.tables.visit_days.length).toBeGreaterThan(0);

    // Nattjobben går 01:30 UTC, altså 02:30 norsk tid 2. november.
    const result = await runRetention(db, new Date("2026-11-02T01:30:00Z"));
    expect(result.visitHashes).toBe(1);
    expect((await db.select().from(visitHashes)).map((h) => h.day)).toEqual(["2026-11-02"]);
    expect((await db.select().from(visitDays)).map((d) => d.day).sort()).toEqual(["2026-11-01", "2026-11-02"]);
    expect(await db.select().from(visitPages).where(eq(visitPages.day, "2024-10-01"))).toHaveLength(0);
  });

  it("tallene slettes sammen med nettstedet", async () => {
    await visit({});
    await db.delete(sites).where(eq(sites.id, siteId));
    expect(await db.select().from(visitDays)).toHaveLength(0);
    expect(await db.select().from(visitHashes)).toHaveLength(0);
  });

  it("bruker samme hemmelighet som resten av appen", () => {
    expect(getSecret()).toEqual(secret);
  });
});
