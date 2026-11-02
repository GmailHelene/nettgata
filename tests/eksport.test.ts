import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { auditLog, bookings, emailLog, inquiries, media, pages, pageVersions, sites, users } from "@/db/schema";
import { logProvider } from "@/lib/email/send";
import {
  createDownloadToken,
  EXPORT_KEEP_DAYS,
  exportStream,
  exportView,
  readJob,
  runExportStep,
  runPendingExports,
  startExport,
  stateKey,
  type ExportDeps,
  type ExportJob,
} from "@/lib/eksport";
import { fileForPath, rewriteCss, rewriteHtml } from "@/lib/eksport/html";
import { crc32, readZip } from "@/lib/eksport/zip";
import { createSiteFromPack } from "@/lib/sites";
import { setMediaStoreForTests, type MediaStore, type StoredObject } from "@/lib/storage";
import { checkSiteAccess, requireSiteAccess } from "@/lib/session";
import { requestExportAction } from "@/app/studio/nettsted/[siteId]/innstillinger/export-actions";
import { GET as download } from "@/app/studio/nettsted/[siteId]/last-ned/route";

// Studiohandlingen og nedlastingen sjekker hvem som er logget inn. Her bestemmer testen rollen.
vi.mock("@/lib/session", () => ({ requireSiteAccess: vi.fn(), checkSiteAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

function memoryStore(): MediaStore & { objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    async put(key, data, contentType) {
      objects.set(key, { body: data.slice(), contentType, size: data.byteLength });
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

let db: Db;
let store: ReturnType<typeof memoryStore>;
let site: typeof sites.$inferSelect;
let ownerId: string;
let imageKey: string;
let mediaId: string;
const IMAGE = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 69, 66, 80]);
const SMALL = new Uint8Array([9, 9, 9]);

/** Nettstedet slik plattformen svarer: HTML med Next.js-skript, CSS, bilder og lenker. /personvern svarer ikke. */
function fakeSite(slug: string, key: string) {
  const variant = key.replace(".webp", "-w640.webp");
  return vi.fn(async (path: string) => {
    const base = `/vis/${slug}`;
    if (path === base || path.startsWith(`${base}/`)) {
      const sitePath = path.slice(base.length) || "/";
      if (sitePath === "/personvern") return new Response("Feil", { status: 500 });
      const html = `<!DOCTYPE html><html lang="nb"><head><link rel="stylesheet" href="/_next/static/css/app.css"/><link rel="preload" as="script" href="/_next/static/chunks/main.js"/><script src="/_next/static/chunks/main.js" async=""></script></head><body><h1>${sitePath}</h1><a href="${base}">Hjem</a><a href="${base}/handlekurv">Kurv</a><img src="/media/${key}" srcSet="/media/${variant} 640w, /media/${key} 2000w" alt="Bilde"/><div style="background-image:url(&quot;/media/${key}&quot;)"></div><script>self.__next_f.push([1,"x"])</script></body></html>`;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/_next/static/css/app.css") return new Response("@font-face{src:url(../media/font.woff2)}body{color:red}", { headers: { "content-type": "text/css" } });
    if (path === "/_next/static/media/font.woff2") return new Response(new Uint8Array([7, 7, 7]));
    return new Response("Finnes ikke", { status: 404 });
  });
}

const deps = (extra: Partial<ExportDeps> = {}): ExportDeps => ({ db, store, fetchPath: fakeSite(site.slug, imageKey), email: logProvider, ...extra });

async function zipOf(job: ExportJob) {
  const bytes = new Uint8Array(await new Response(exportStream(store, job)).arrayBuffer());
  expect(bytes.length).toBe(job.totalBytes);
  const files = readZip(bytes);
  // Uten mappen alt ligger i, så testene blir lettere å lese.
  return new Map([...files].map(([name, data]) => [name.slice(job.root.length + 1), data]));
}
const text = (data: Uint8Array | undefined) => new TextDecoder().decode(data);

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  store = memoryStore();
  setMediaStoreForTests(store);
  const [owner] = await db.insert(users).values({ email: "eier@salong.no", passwordHash: "x" }).returning();
  ownerId = owner.id;
  const created = await createSiteFromPack(db, { name: "Salong Test", packKey: "frisor", themeKey: "atelier", info: demoInfo, ownerId });
  // Publiserer kladdene direkte. Publiseringsreglene (eksempelbilder og annet) testes i publishing.test.ts.
  for (const page of await db.select().from(pages).where(eq(pages.siteId, created.id))) {
    const [version] = await db.insert(pageVersions).values({ pageId: page.id, number: 1, title: page.title, content: page.draft, publishedBy: ownerId }).returning();
    await db.update(pages).set({ publishedVersionId: version.id }).where(eq(pages.id, page.id));
  }
  // Nettbutikk, med hemmeligheter som aldri skal havne i eksporten.
  [site] = await db
    .update(sites)
    .set({ kind: "nettbutikk", shop: { hemmeligTest: "hemmelig-nokkel-123" } as never, billing: { stripeCustomerId: "cus_hemmelig" } as never })
    .where(eq(sites.id, created.id))
    .returning();
  mediaId = crypto.randomUUID();
  imageKey = `${site.id}/${mediaId}.webp`;
  await db.insert(media).values({ id: mediaId, siteId: site.id, key: imageKey, contentType: "image/webp", size: IMAGE.length, alt: "Frisør som klipper" });
  await store.put(imageKey, IMAGE, "image/webp");
  await store.put(imageKey.replace(".webp", "-w640.webp"), SMALL, "image/webp");
  await db.insert(inquiries).values({ siteId: site.id, name: "Kari Nordmann", email: "kari@test.no", message: "Har dere ledig time?", answers: [{ label: "Antall personer", value: "3" }] });
  const start = new Date("2026-11-10T09:00:00Z");
  await db.insert(bookings).values({
    siteId: site.id,
    serviceName: "Klipp",
    staffName: "Lise",
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    blockedUntil: new Date(start.getTime() + 30 * 60_000),
    customerName: "Ola Hansen",
    customerEmail: "ola@test.no",
    cancelTokenHash: "hash-1",
  });
});

describe("statiske sider", () => {
  const options = { basePath: "/vis/salong", pages: new Set(["/", "/om-oss"]), liveUrl: "https://salong.no" };

  it("lagrer hver side som index.html i egen mappe", () => {
    expect(fileForPath("/")).toBe("index.html");
    expect(fileForPath("/om-oss")).toBe("om-oss/index.html");
    expect(fileForPath("/blogg/første-innlegg")).toBe("blogg/første-innlegg/index.html");
  });

  it("gjør lenker, CSS og bilder relative, fjerner skript og sender resten til det levende nettstedet", () => {
    const key = "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.webp";
    const html = `<head><link rel="stylesheet" href="/_next/static/css/a.css"><script src="/_next/static/chunks/x.js"></script></head><a href="/vis/salong/om-oss">Om</a><a href="/vis/salong">Hjem</a><a href="/vis/salong/handlekurv?a=1&amp;b=2">Kurv</a><a href="https://ekstern.no/">Ut</a><img src="/media/${key}" srcset="/media/${key} 2000w">`;
    const { html: out, assets } = rewriteHtml(html, "om-oss/index.html", options);
    expect(out).not.toMatch(/<script/);
    expect(out).toContain('href="../_next/static/css/a.css"');
    expect(out).toContain('href="../om-oss/index.html"');
    expect(out).toContain('href="../index.html"');
    expect(out).toContain('href="https://salong.no/handlekurv?a=1&amp;b=2"');
    expect(out).toContain('href="https://ekstern.no/"');
    expect(out).toContain(`src="../media/${key}"`);
    expect(out).toContain(`srcset="../media/${key} 2000w"`);
    expect(assets).toContainEqual({ kind: "static", path: "/_next/static/css/a.css" });
    expect(assets).toContainEqual({ kind: "media", key });
  });

  it("finner fontene i CSS-en og peker til dem relativt", () => {
    const { css, assets } = rewriteCss("a{src:url(../media/f.woff2)}b{background:url(data:image/png;base64,AA)}", "/_next/static/css/a.css");
    expect(css).toContain("url(../../../_next/static/media/f.woff2)");
    expect(css).toContain("data:image/png");
    expect(assets).toEqual([{ kind: "static", path: "/_next/static/media/f.woff2" }]);
  });
});

describe("Last ned alt", () => {
  it("lager en gyldig ZIP med sider, innhold, bilder, tabeller og LES-MEG, uten hemmeligheter", async () => {
    await startExport(db, store, site, ownerId);
    const job = (await runExportStep(deps(), site.id, 60_000))!;
    expect(job.status).toBe("ferdig");
    const files = await zipOf(job);

    // Sidene, som statisk HTML uten JavaScript, med CSS, font og bilder.
    const index = text(files.get("nettsted/index.html"));
    expect(index).toContain("<h1>/</h1>");
    expect(index).not.toMatch(/<script|main\.js/);
    expect(index).toContain('href="_next/static/css/app.css"');
    expect(text(files.get("nettsted/_next/static/css/app.css"))).toContain("url(../../../_next/static/media/font.woff2)");
    expect(files.get("nettsted/_next/static/media/font.woff2")).toEqual(new Uint8Array([7, 7, 7]));
    expect(files.get(`nettsted/media/${imageKey}`)).toEqual(IMAGE);
    expect(files.get(`nettsted/media/${imageKey.replace(".webp", "-w640.webp")}`)).toEqual(SMALL);
    expect([...files.keys()].filter((n) => n.endsWith("index.html")).length).toBe(job.pages.length - 1);

    // Originalene og innholdet.
    expect(files.get(`bilder/${mediaId}.webp`)).toEqual(IMAGE);
    const siteJson = JSON.parse(text(files.get("innhold/nettsted.json")));
    expect(siteJson.navn).toBe("Salong Test");
    const pagesJson = JSON.parse(text(files.get("innhold/sider.json")));
    expect(pagesJson.length).toBeGreaterThan(1);
    expect(pagesJson[0].publisert.innhold.sections.length).toBeGreaterThan(0);
    expect(JSON.parse(text(files.get("innhold/bilder-og-filer.json")))[0]).toMatchObject({ fil: `bilder/${mediaId}.webp`, beskrivelse: "Frisør som klipper" });

    // Tabellene, i norsk Excel-format.
    const inquiriesCsv = text(files.get("tabeller/henvendelser.csv"));
    // BOM først, så Excel leser æøå riktig. TextDecoder fjerner den, så den sjekkes i bytene.
    expect([...files.get("tabeller/henvendelser.csv")!.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(inquiriesCsv).toContain("Kari Nordmann");
    expect(inquiriesCsv).toContain("Antall personer: 3");
    expect(text(files.get("tabeller/bookinger.csv"))).toContain("Ola Hansen;ola@test.no");
    for (const name of ["varer.csv", "ordre.csv", "ordrelinjer.csv", "kunder.csv", "nyhetsbrev-abonnenter.csv"]) expect(files.has(`tabeller/${name}`), name).toBe(true);

    // LES-MEG sist, med personvern og sidene som ikke svarte.
    expect([...files.keys()].at(-1)).toBe("LES-MEG.txt");
    const readmeText = text(files.get("LES-MEG.txt"));
    expect(readmeText).toContain("personopplysninger");
    expect(readmeText).toContain("/personvern");

    // Betalingsnøkler og abonnementet hos Stripe er aldri med.
    for (const [name, data] of files) {
      expect(text(data), name).not.toContain("hemmelig-nokkel-123");
      expect(text(data), name).not.toContain("cus_hemmelig");
    }
  });

  it("bygges i biter over flere kjøringer og blir lik en ZIP laget i én kjøring", async () => {
    await startExport(db, store, site, ownerId);
    let job: ExportJob | null = null;
    let runs = 0;
    while (job?.status !== "ferdig" && runs < 500) {
      job = await runExportStep(deps(), site.id, 0);
      runs++;
    }
    expect(job!.status).toBe("ferdig");
    expect(runs).toBeGreaterThan(5);
    expect(job!.parts).toBeGreaterThan(3);
    expect(job!.parts).toBeLessThanOrEqual(runs + 1);
    const files = await zipOf(job!);
    expect(files.has("nettsted/index.html")).toBe(true);
    expect(files.has("LES-MEG.txt")).toBe(true);
    expect(new Set(job!.names).size).toBe(job!.names.length);
    expect(crc32(files.get(`bilder/${mediaId}.webp`)!)).toBe(crc32(IMAGE));
  });

  it("lar en kjøring som pågår være i fred", async () => {
    await startExport(db, store, site, ownerId);
    const job = (await readJob(store, site.id))!;
    job.lease = { id: "annen", until: new Date(Date.now() + 60_000).toISOString() };
    await store.put(stateKey(site.id), new TextEncoder().encode(JSON.stringify(job)), "application/json");
    const after = await runExportStep(deps(), site.id, 60_000);
    expect(after!.cursor).toBe(0);
    expect(after!.status).toBe("lager");
  });

  it("sender e-post til eieren og logger i revisjonsloggen", async () => {
    await startExport(db, store, site, ownerId);
    await runExportStep(deps(), site.id, 60_000);
    const [mail] = await db.select().from(emailLog).where(eq(emailLog.siteId, site.id));
    expect(mail).toMatchObject({ kind: "eksport", recipient: "eier@salong.no" });
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.siteId, site.id), eq(auditLog.action, "export.requested")));
    expect(audit).toHaveLength(1);
  });

  it("starter ikke en ny mens en pågår, og sletter den gamle filen når en ny lages", async () => {
    const first = await startExport(db, store, site, ownerId);
    expect((await startExport(db, store, site, ownerId)).id).toBe(first.id);
    await runExportStep(deps(), site.id, 60_000);
    const oldParts = await store.list(`eksport/${site.id}/${first.id}/`);
    expect(oldParts.length).toBeGreaterThan(0);
    const second = await startExport(db, store, site, ownerId);
    expect(second.id).not.toBe(first.id);
    expect(await store.list(`eksport/${site.id}/${first.id}/`)).toEqual([]);
  });

  it("rydder bort filer eldre enn sju dager", async () => {
    await startExport(db, store, site, ownerId);
    const job = (await runExportStep(deps(), site.id, 60_000))!;
    expect(exportView(job).status).toBe("ferdig");
    const later = new Date(Date.now() + (EXPORT_KEEP_DAYS + 1) * 86_400_000);
    expect(exportView(job, later).status).toBe("ingen");
    const result = await runPendingExports(deps({ now: () => later }));
    expect(result.removed).toBe(1);
    expect([...store.objects.keys()].filter((k) => k.startsWith("eksport/"))).toEqual([]);
  });
});

describe("tilgang til Last ned alt", () => {
  const actAs = (role: "owner" | "editor" | "developer") => {
    const access = { user: { id: ownerId, email: "eier@salong.no", name: null, isPlatformAdmin: false, emailVerified: true }, site, role };
    vi.mocked(requireSiteAccess).mockResolvedValue(access);
    vi.mocked(checkSiteAccess).mockResolvedValue(access);
  };

  it("bare eieren kan lage filen", async () => {
    for (const role of ["editor", "developer"] as const) {
      actAs(role);
      expect(await requestExportAction(site.id)).toEqual({ ok: false, message: "Bare eieren av nettstedet kan laste ned alt." });
    }
    expect(await readJob(store, site.id)).toBeNull();
    actAs("owner");
    expect(await requestExportAction(site.id)).toMatchObject({ ok: true });
    expect((await readJob(store, site.id))?.status).toBe("lager");
  });

  it("tre filer per døgn", async () => {
    actAs("owner");
    for (let i = 0; i < 3; i++) expect((await requestExportAction(site.id))?.ok).toBe(true);
    expect(await requestExportAction(site.id)).toEqual({ ok: false, message: "Du har laget tre ZIP-filer det siste døgnet. Prøv igjen i morgen." });
  });

  it("nedlastingen krever eier og gyldig lenke for akkurat denne filen", async () => {
    await startExport(db, store, site, ownerId);
    const job = (await runExportStep(deps(), site.id, 60_000))!;
    const token = await createDownloadToken(job);
    const get = (t: string) => download(new Request(`http://localhost:3000/studio/nettsted/${site.id}/last-ned?t=${encodeURIComponent(t)}`), { params: Promise.resolve({ siteId: site.id }) });

    actAs("editor");
    expect((await get(token)).status).toBe(403);

    actAs("owner");
    expect((await get("tull")).status).toBe(410);
    expect((await get(await createDownloadToken({ ...job, id: crypto.randomUUID() }))).status).toBe(410);
    expect((await get(await createDownloadToken({ ...job, siteId: crypto.randomUUID() }))).status).toBe(410);

    const res = await get(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain(".zip");
    const files = readZip(new Uint8Array(await res.arrayBuffer()));
    expect([...files.keys()].some((n) => n.endsWith("LES-MEG.txt"))).toBe(true);
    const downloads = await db.select().from(auditLog).where(and(eq(auditLog.siteId, site.id), eq(auditLog.action, "export.downloaded")));
    expect(downloads).toHaveLength(1);
  });
});
