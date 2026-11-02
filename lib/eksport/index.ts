import { SignJWT, jwtVerify } from "jose";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, inquiryImages, media, sites, users } from "@/db/schema";
import { deliver, type EmailProvider } from "@/lib/email/send";
import { emailParts } from "@/lib/email/templates";
import { osloDate } from "@/lib/oslo-time";
import type { RateLimitRule } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";
import { platformUrl, publicSiteUrl } from "@/lib/site-url";
import { originalKey } from "@/lib/media-types";
import { inquiryImageFileName } from "@/lib/henvendelser/bilder";
import type { MediaStore } from "@/lib/storage";
import { fileForPath, rewriteCss, rewriteHtml, SITE_DIR, type Asset } from "./html";
import { buildDataFile, dataFilesFor, exportedPaths, mediaFileName, readme, type DataFile } from "./innhold";
import { centralDirectory, concat, crc32, dosDateTime, localHeader, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, type ZipEntry } from "./zip";

/**
 * «Last ned alt»: hele nettstedet som én ZIP-fil (exit-garanti). Se også LES-MEG-teksten i innhold.ts.
 *
 * Et nettsted kan ha hundrevis av bilder, og en Worker har 128 MB minne og begrenset tid per forespørsel. ZIP-en
 * bygges derfor i bakgrunnen, i biter: hver kjøring legger så mange filer den rekker inn i én eller flere deler
 * i R2 (maks PART_BYTES hver), og husker hvor den kom. Første kjøring starter rett etter at eieren trykker, resten
 * tar bakgrunnsjobben hvert tiende minutt (custom-worker.ts -> /api/cron/eksport). Til slutt skrives katalogen.
 * Nedlastingen leser delene etter hverandre som én strøm, så hele filen er aldri i minnet.
 *
 * Tilstanden ligger som JSON i R2 (eksport/<siteId>.json), ikke i databasen, så det trengs ingen ny tabell.
 * Én eksport per nettsted om gangen. Ferdige filer slettes etter EXPORT_KEEP_DAYS.
 */

export const EXPORT_PREFIX = "eksport/";
export const EXPORT_KEEP_DAYS = 7;
/** Tre ZIP-filer per nettsted per døgn. Hver av dem leser alle bildene, så dette er nok og hindrer misbruk. */
export const exportRule: RateLimitRule = { limit: 3, windowSeconds: 24 * 60 * 60 };
/** Største del i R2. Holder minnebruken godt under grensen. */
export const PART_BYTES = 16 * 1024 * 1024;
/** Tid per kjøring før tilstanden lagres og resten tas neste gang. */
export const STEP_MS = 20_000;
/** En kjøring som har krasjet midt i, slipper taket etter så lang tid. */
const LEASE_MS = 2 * 60_000;
/** En eksport som ikke er ferdig etter to døgn, gis opp. */
const GIVE_UP_MS = 2 * 86_400_000;

type Site = typeof sites.$inferSelect;

export type ExportItem =
  | { t: "data"; name: DataFile }
  | { t: "original"; key: string; file: string }
  | { t: "page"; path: string }
  | { t: "static"; path: string }
  | { t: "sitemedia"; key: string }
  | { t: "readme" };

export type ExportJob = {
  version: 1;
  id: string;
  siteId: string;
  userId: string;
  status: "lager" | "ferdig" | "feilet";
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  error: string | null;
  /** Mappen alt ligger i inne i ZIP-en. */
  root: string;
  basePath: string;
  liveUrl: string;
  pages: string[];
  items: ExportItem[];
  cursor: number;
  /** Navnene som er lagt inn, så samme CSS eller bilde ikke kommer to ganger. */
  names: string[];
  entries: ZipEntry[];
  offset: number;
  parts: number;
  totalBytes: number | null;
  skipped: string[];
  lease: { id: string; until: string } | null;
};

export type ExportDeps = {
  db: Db;
  store: MediaStore;
  /** Henter en sti fra plattformen, for eksempel /vis/<slug>/om-oss eller /_next/static/css/a.css. */
  fetchPath: (path: string) => Promise<Response>;
  email?: EmailProvider;
  now?: () => Date;
};

export const stateKey = (siteId: string) => `${EXPORT_PREFIX}${siteId}.json`;
const partKey = (job: Pick<ExportJob, "siteId" | "id">, n: number) => `${EXPORT_PREFIX}${job.siteId}/${job.id}/del-${String(n).padStart(5, "0")}.bin`;
const STATE_PATTERN = /^eksport\/([0-9a-f-]{36})\.json$/;

export class ExportError extends Error {}

async function toBytes(body: ReadableStream | Uint8Array): Promise<Uint8Array> {
  return body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
}

export async function readJob(store: MediaStore, siteId: string): Promise<ExportJob | null> {
  const obj = await store.get(stateKey(siteId));
  if (!obj) return null;
  try {
    const job = JSON.parse(new TextDecoder().decode(await toBytes(obj.body))) as ExportJob;
    return job.version === 1 && job.siteId === siteId ? job : null;
  } catch {
    return null;
  }
}

async function saveJob(store: MediaStore, job: ExportJob, now: Date) {
  job.updatedAt = now.toISOString();
  await store.put(stateKey(job.siteId), new TextEncoder().encode(JSON.stringify(job)), "application/json");
}

async function deleteParts(store: MediaStore, job: Pick<ExportJob, "siteId" | "id">) {
  for (const key of await store.list(`${EXPORT_PREFIX}${job.siteId}/${job.id}/`)) await store.delete(key);
}

/** Det studioet viser om eksporten. */
export type ExportView =
  | { status: "ingen" }
  | { status: "lager"; done: number; total: number; startedAt: string }
  | { status: "ferdig"; finishedAt: string; expiresAt: string; bytes: number }
  | { status: "feilet"; error: string };

export function exportView(job: ExportJob | null, now = new Date()): ExportView {
  if (!job) return { status: "ingen" };
  if (job.status === "lager") return { status: "lager", done: job.cursor, total: job.items.length, startedAt: job.createdAt };
  if (job.status === "feilet") return { status: "feilet", error: job.error ?? "Noe gikk galt" };
  if (!job.expiresAt || new Date(job.expiresAt) <= now) return { status: "ingen" };
  return { status: "ferdig", finishedAt: job.finishedAt ?? job.updatedAt, expiresAt: job.expiresAt, bytes: job.totalBytes ?? 0 };
}

/**
 * Starter en ny eksport. Tilgang (bare eieren) og grensen per døgn sjekkes av kalleren (export-actions.ts).
 * Pågår det en allerede, gis den tilbake i stedet. En gammel, ferdig fil slettes, så det bare finnes én.
 */
export async function startExport(db: Db, store: MediaStore, site: Site, userId: string, now = new Date()): Promise<ExportJob> {
  const existing = await readJob(store, site.id);
  if (existing?.status === "lager") return existing;
  if (existing) await deleteParts(store, existing);

  const [mediaRows, imageRows, paths, liveUrl] = await Promise.all([
    db.select().from(media).where(eq(media.siteId, site.id)).orderBy(asc(media.createdAt)),
    // Bilder fra kontaktskjemaet, bare de som hører til en henvendelse. Ligger privat i lageret og vises aldri på nettstedet.
    db
      .select({ id: inquiryImages.id, inquiryId: inquiryImages.inquiryId, key: inquiryImages.key })
      .from(inquiryImages)
      .where(and(eq(inquiryImages.siteId, site.id), isNotNull(inquiryImages.inquiryId)))
      .orderBy(asc(inquiryImages.createdAt), asc(inquiryImages.id)),
    exportedPaths(db, site),
    publicSiteUrl(db, site),
  ]);
  const files = dataFilesFor(site);
  const items: ExportItem[] = [
    ...files.map((name) => ({ t: "data" as const, name })),
    ...mediaRows.map((m) => ({ t: "original" as const, key: m.key, file: mediaFileName(m) })),
    ...imageRows.map((img) => ({ t: "original" as const, key: img.key, file: inquiryImageFileName(img) })),
    ...paths.map((path) => ({ t: "page" as const, path })),
    // Filene sidene trenger (CSS, fonter, bilder) legges til underveis, når sidene er lest. LES-MEG.txt flyttes sist.
    { t: "readme" as const },
  ];
  const job: ExportJob = {
    version: 1,
    id: crypto.randomUUID(),
    siteId: site.id,
    userId,
    status: "lager",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    finishedAt: null,
    expiresAt: null,
    error: null,
    root: `nettgata-${site.slug}-${osloDate(now)}`,
    basePath: `/vis/${site.slug}`,
    liveUrl,
    pages: paths,
    items,
    cursor: 0,
    names: [],
    entries: [],
    offset: 0,
    parts: 0,
    totalBytes: null,
    skipped: [],
    lease: null,
  };
  await saveJob(store, job, now);
  await db.insert(auditLog).values({ siteId: site.id, userId, action: "export.requested", detail: { jobId: job.id, files: items.length } });
  return job;
}

type ZipFile = { name: string; data: Uint8Array };

/** Gjør én oppgave om til filer i ZIP-en. Sider kan legge til nye oppgaver (CSS og bilder) bak i køen. */
async function processItem(deps: ExportDeps, site: Site, job: ExportJob, item: ExportItem): Promise<ZipFile[]> {
  const queue = (assets: Asset[]) => {
    const known = new Set(job.items.slice(job.cursor).map((i) => (i.t === "static" ? `s:${i.path}` : i.t === "sitemedia" ? `m:${i.key}` : "")));
    for (const asset of assets) {
      const id = asset.kind === "static" ? `s:${asset.path}` : `m:${asset.key}`;
      const name = asset.kind === "static" ? `${SITE_DIR}${asset.path}` : `${SITE_DIR}/media/${asset.key}`;
      if (known.has(id) || job.names.includes(`${job.root}/${name}`)) continue;
      known.add(id);
      // Før LES-MEG, som alltid skal være sist.
      job.items.splice(job.items.length - 1, 0, asset.kind === "static" ? { t: "static", path: asset.path } : { t: "sitemedia", key: asset.key });
    }
  };

  switch (item.t) {
    case "data":
      return [{ name: item.name, data: await buildDataFile(deps.db, site, item.name) }];
    case "original": {
      const obj = await deps.store.get(item.key);
      return obj ? [{ name: item.file, data: await toBytes(obj.body) }] : [];
    }
    case "sitemedia": {
      const fallback = originalKey(item.key);
      const obj = (await deps.store.get(item.key)) ?? (fallback ? await deps.store.get(fallback) : null);
      return obj ? [{ name: `${SITE_DIR}/media/${item.key}`, data: await toBytes(obj.body) }] : [];
    }
    case "page": {
      const res = await deps.fetchPath(`${job.basePath}${item.path === "/" ? "" : item.path}`).catch(() => null);
      if (!res?.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) {
        job.skipped.push(item.path);
        return [];
      }
      const file = fileForPath(item.path);
      const { html, assets } = rewriteHtml(await res.text(), file, { basePath: job.basePath, pages: new Set(job.pages.filter((p) => !job.skipped.includes(p))), liveUrl: job.liveUrl });
      queue(assets);
      return [{ name: `${SITE_DIR}/${file}`, data: new TextEncoder().encode(html) }];
    }
    case "static": {
      const res = await deps.fetchPath(item.path).catch(() => null);
      if (!res?.ok) return [];
      if (item.path.endsWith(".css")) {
        const { css, assets } = rewriteCss(await res.text(), item.path);
        queue(assets);
        return [{ name: `${SITE_DIR}${item.path}`, data: new TextEncoder().encode(css) }];
      }
      return [{ name: `${SITE_DIR}${item.path}`, data: new Uint8Array(await res.arrayBuffer()) }];
    }
    case "readme":
      return [{ name: "LES-MEG.txt", data: readme({ site, createdAt: new Date(job.createdAt), files: dataFilesFor(site), pages: job.pages.length - job.skipped.length, skipped: job.skipped, inquiryImages: job.items.filter((i) => i.t === "original" && i.file.startsWith("henvendelser/")).length }) }];
  }
}

/**
 * Én kjøring på eksporten til et nettsted. Gjør så mye den rekker innen `budgetMs`, lagrer delene og tilstanden,
 * og avslutter ZIP-en når alt er med. Kan trygt kalles flere ganger: en kjøring som allerede pågår, får være i fred.
 */
export async function runExportStep(deps: ExportDeps, siteId: string, budgetMs = STEP_MS): Promise<ExportJob | null> {
  const now = deps.now ?? (() => new Date());
  const started = Date.now();
  const { db, store } = deps;
  let job = await readJob(store, siteId);
  if (!job || job.status !== "lager") return job;
  if (job.lease && new Date(job.lease.until) > now()) return job;

  // Tar oppgaven. R2 har ikke lås, så vi leser tilbake og ser at det var vi som fikk den.
  const leaseId = crypto.randomUUID();
  job.lease = { id: leaseId, until: new Date(now().getTime() + LEASE_MS).toISOString() };
  await saveJob(store, job, now());
  job = await readJob(store, siteId);
  if (!job || job.lease?.id !== leaseId) return job;

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  try {
    if (!site) throw new ExportError("Nettstedet finnes ikke lenger");
    const dos = dosDateTime(new Date(job.createdAt));
    // Minst én fil per kjøring, så eksporten alltid kommer videre, også når tiden er knapp.
    let processed = 0;
    const timeLeft = () => processed === 0 || Date.now() - started < budgetMs;
    while (job.cursor < job.items.length && timeLeft()) {
      const chunks: Uint8Array[] = [];
      let partBytes = 0;
      while (job.cursor < job.items.length && partBytes < PART_BYTES && timeLeft()) {
        const item = job.items[job.cursor];
        for (const file of await processItem(deps, site, job, item)) {
          const name = `${job.root}/${file.name}`;
          if (job.names.includes(name)) continue;
          const entry = { name, crc: crc32(file.data), size: file.data.length, ...dos };
          const header = localHeader(entry);
          if (job.entries.length + 1 >= ZIP_MAX_ENTRIES || job.offset + header.length + file.data.length > ZIP_MAX_BYTES - 64 * 1024 * 1024) {
            throw new ExportError("Nettstedet har for mange eller for store filer til én ZIP-fil. Send oss en melding, så hjelper vi deg.");
          }
          job.entries.push({ ...entry, offset: job.offset });
          job.names.push(name);
          chunks.push(header, file.data);
          job.offset += header.length + file.data.length;
          partBytes += header.length + file.data.length;
        }
        job.cursor++;
        processed++;
      }
      if (chunks.length) {
        job.parts++;
        await store.put(partKey(job, job.parts), concat(chunks), "application/octet-stream");
      }
      job.lease = { id: leaseId, until: new Date(now().getTime() + LEASE_MS).toISOString() };
      await saveJob(store, job, now());
    }

    if (job.cursor >= job.items.length) {
      const directory = centralDirectory(job.entries, job.offset);
      job.parts++;
      await store.put(partKey(job, job.parts), directory, "application/octet-stream");
      const finished = now();
      job.status = "ferdig";
      job.finishedAt = finished.toISOString();
      job.expiresAt = new Date(finished.getTime() + EXPORT_KEEP_DAYS * 86_400_000).toISOString();
      job.totalBytes = job.offset + directory.length;
      job.lease = null;
      await saveJob(store, job, finished);
      if (deps.email) await notifyOwner(deps, site, job).catch((err) => console.error("E-post om eksporten feilet", err));
    } else {
      job.lease = null;
      await saveJob(store, job, now());
    }
  } catch (err) {
    console.error("Eksporten feilet", siteId, err);
    job.status = "feilet";
    job.error = err instanceof ExportError ? err.message : "Noe gikk galt da filen ble laget. Prøv igjen, eller send oss en melding.";
    job.lease = null;
    await saveJob(store, job, now());
    await deleteParts(store, job);
  }
  return job;
}

/** Bakgrunnsjobben: fortsetter alle eksporter som ikke er ferdige, og rydder bort gamle filer. */
export async function runPendingExports(deps: ExportDeps, budgetMs = STEP_MS * 2) {
  const now = deps.now ?? (() => new Date());
  const started = Date.now();
  const result = { advanced: 0, finished: 0, removed: 0 };
  const siteIds = (await deps.store.list(EXPORT_PREFIX)).map((k) => STATE_PATTERN.exec(k)?.[1]).filter((id): id is string => Boolean(id));
  for (const siteId of siteIds) {
    const job = await readJob(deps.store, siteId);
    if (!job) continue;
    const age = now().getTime() - new Date(job.createdAt).getTime();
    const expired =
      (job.status === "ferdig" && (!job.expiresAt || new Date(job.expiresAt) <= now())) ||
      (job.status === "feilet" && age > EXPORT_KEEP_DAYS * 86_400_000) ||
      (job.status === "lager" && age > GIVE_UP_MS);
    if (expired) {
      await deleteParts(deps.store, job);
      await deps.store.delete(stateKey(siteId));
      result.removed++;
      continue;
    }
    if (job.status !== "lager") continue;
    const left = budgetMs - (Date.now() - started);
    if (left < 2_000) continue;
    const after = await runExportStep(deps, siteId, Math.min(STEP_MS, left));
    result.advanced++;
    if (after?.status === "ferdig") result.finished++;
  }
  return result;
}

const AUDIENCE = "eksport";

/** Signert lenke til nedlastingen. Gjelder til filen slettes, og bare for eieren av nettstedet (sjekkes i ruten). */
export async function createDownloadToken(job: Pick<ExportJob, "id" | "siteId" | "expiresAt">): Promise<string> {
  const exp = Math.floor(new Date(job.expiresAt ?? Date.now()).getTime() / 1000);
  return new SignJWT({ site: job.siteId }).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCE).setSubject(job.id).setIssuedAt().setExpirationTime(exp).sign(getSecret());
}

export async function verifyDownloadToken(token: string): Promise<{ jobId: string; siteId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE, algorithms: ["HS256"] });
    return typeof payload.sub === "string" && typeof payload.site === "string" ? { jobId: payload.sub, siteId: payload.site } : null;
  } catch {
    return null;
  }
}

export function downloadPath(siteId: string, token: string): string {
  return `/studio/nettsted/${siteId}/last-ned?t=${encodeURIComponent(token)}`;
}

export function downloadFileName(job: Pick<ExportJob, "root">): string {
  return `${job.root}.zip`;
}

/** ZIP-filen som én strøm: delene leses fra R2 én etter én. */
export function exportStream(store: MediaStore, job: ExportJob): ReadableStream<Uint8Array> {
  let part = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (reader) {
          const { done, value } = await reader.read();
          if (!done) {
            controller.enqueue(value);
            return;
          }
          reader = null;
        }
        part++;
        if (part > job.parts) {
          controller.close();
          return;
        }
        const obj = await store.get(partKey(job, part));
        if (!obj) {
          controller.error(new Error(`Mangler del ${part} av eksporten`));
          return;
        }
        if (obj.body instanceof Uint8Array) {
          controller.enqueue(obj.body);
          return;
        }
        reader = (obj.body as ReadableStream<Uint8Array>).getReader();
      }
    },
  });
}

async function notifyOwner(deps: ExportDeps, site: Site, job: ExportJob) {
  const [user] = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, job.userId)).limit(1);
  if (!user || !deps.email) return;
  const link = `${platformUrl()}${downloadPath(site.id, await createDownloadToken(job))}`;
  const until = new Date(job.expiresAt!).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long" });
  const { esc, button, paragraph, layout, platformFooter } = emailParts;
  const subject = `ZIP-filen med alt fra ${site.name} er klar`;
  const html = layout({
    subject,
    preheader: `Last ned før ${until}.`,
    brand: "Nettgata",
    heading: "Filen er klar",
    body: [
      paragraph(`Du ba om en kopi av alt fra ${esc(site.name)}. Den er klar til nedlasting.`),
      button(link, "Last ned ZIP-filen"),
      paragraph(`Lenken virker til ${esc(until)}, og du må være logget inn som eier av nettstedet.`),
      paragraph("Filen har personopplysninger om kundene dine. Lagre den trygt, og slett den når du ikke trenger den lenger."),
    ].join(""),
    footer: platformFooter("Du får denne e-posten fordi du trykket «Last ned alt» i studioet."),
  });
  const text = [
    `Du ba om en kopi av alt fra ${site.name}. Den er klar til nedlasting:`,
    link,
    "",
    `Lenken virker til ${until}, og du må være logget inn som eier av nettstedet.`,
    "Filen har personopplysninger om kundene dine. Lagre den trygt, og slett den når du ikke trenger den lenger.",
  ].join("\n");
  await deliver(deps.db, deps.email, { siteId: site.id, kind: "eksport" }, { to: { email: user.email }, fromName: "Nettgata", subject, html, text, tags: ["eksport"] });
}
