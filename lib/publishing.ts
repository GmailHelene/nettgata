import { and, desc, eq, gt, max, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, pageVersions, pages } from "@/db/schema";
import { validatePageContent } from "@/lib/content/registry";
import { missingMedia } from "@/lib/media";
import type { PageContent } from "@/lib/content/types";

export class PublishingError extends Error {}

/** Normaliserer stier slik at "/Om-oss/" og "/om-oss" blir samme side. */
export function normalizePath(path: string): string {
  const cleaned = "/" + path.split("/").filter(Boolean).join("/").toLowerCase();
  return cleaned;
}

export async function getPublishedPage(db: Db, siteId: string, path: string) {
  const [row] = await db
    .select({ page: pages, version: pageVersions })
    .from(pages)
    .innerJoin(pageVersions, eq(pages.publishedVersionId, pageVersions.id))
    .where(and(eq(pages.siteId, siteId), eq(pages.path, normalizePath(path))))
    .limit(1);
  if (!row) return null;
  return { pageId: row.page.id, title: row.version.title, content: row.version.content, versionNumber: row.version.number };
}

/** Stopper publisering av en side med bilder som er slettet fra bildebiblioteket. */
async function assertMediaExists(db: Db, siteId: string, content: unknown) {
  const missing = await missingMedia(db, siteId, content);
  if (missing.length) {
    throw new PublishingError(
      missing.length === 1
        ? "Siden bruker et bilde som er slettet fra bildebiblioteket. Velg et nytt bilde der det mangler."
        : `Siden bruker ${missing.length} bilder som er slettet fra bildebiblioteket. Velg nye bilder der de mangler.`,
    );
  }
}

/** Redigereren lagrer automatisk hvert par sekunder. Loggen får én linje per side og bruker per kvarter. */
const DRAFT_LOG_INTERVAL_MS = 15 * 60_000;

/**
 * Lagrer kladden. Den kan være uferdig (et felt som mangler, et eksempelbilde), men aldri ugyldig.
 * Alt som mangler, stoppes av publishPage.
 */
export async function saveDraft(db: Db, pageId: string, input: { title: string; content: unknown }, userId: string) {
  const title = input.title.trim();
  if (!title || title.length > 120) throw new PublishingError("Sidetittel må være mellom 1 og 120 tegn");
  const result = validatePageContent(input.content, "draft");
  if (!result.ok) throw new PublishingError(result.errors.map((e) => e.message).join("\n"));

  const [updated] = await db
    .update(pages)
    .set({ title, draft: result.content, draftUpdatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning({ siteId: pages.siteId });
  if (!updated) throw new PublishingError("Fant ikke siden");
  const [recent] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.siteId, updated.siteId),
        eq(auditLog.userId, userId),
        eq(auditLog.action, "page.draft_saved"),
        gt(auditLog.createdAt, new Date(Date.now() - DRAFT_LOG_INTERVAL_MS)),
        sql`${auditLog.detail}->>'pageId' = ${pageId}`,
      ),
    )
    .limit(1);
  if (!recent) await db.insert(auditLog).values({ siteId: updated.siteId, userId, action: "page.draft_saved", detail: { pageId } });
}

async function createVersion(db: Db, pageId: string, title: string, content: PageContent, userId: string) {
  // Unik indeks på (page_id, number) stopper doble nummer ved samtidige publiseringer; da prøver vi én gang til.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ current }] = await db
      .select({ current: max(pageVersions.number) })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, pageId));
    try {
      const [version] = await db
        .insert(pageVersions)
        .values({ pageId, number: (current ?? 0) + 1, title, content, publishedBy: userId })
        .returning();
      return version;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new PublishingError("Kunne ikke lagre versjon");
}

/** Gjør kladden til live versjon. Valideres på nytt, fordi kladden kan være lagret før en regel ble strengere. */
export async function publishPage(db: Db, pageId: string, userId: string) {
  const [page] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) throw new PublishingError("Fant ikke siden");
  const result = validatePageContent(page.draft);
  if (!result.ok) throw new PublishingError(result.errors.map((e) => e.message).join("\n"));
  await assertMediaExists(db, page.siteId, result.content);

  const version = await createVersion(db, pageId, page.title, result.content, userId);
  await db.update(pages).set({ publishedVersionId: version.id }).where(eq(pages.id, pageId));
  await db
    .insert(auditLog)
    .values({ siteId: page.siteId, userId, action: "page.published", detail: { pageId, version: version.number } });
  return version;
}

/** Publiserer en tidligere versjon på nytt og setter kladden lik den. Historikken beholdes. */
export async function restoreVersion(db: Db, pageId: string, versionId: string, userId: string) {
  const [old] = await db
    .select()
    .from(pageVersions)
    .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)))
    .limit(1);
  if (!old) throw new PublishingError("Fant ikke versjonen");
  const [page] = await db.select({ siteId: pages.siteId }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) throw new PublishingError("Fant ikke siden");
  await assertMediaExists(db, page.siteId, old.content);

  const version = await createVersion(db, pageId, old.title, old.content, userId);
  await db
    .update(pages)
    .set({ publishedVersionId: version.id, title: old.title, draft: old.content, draftUpdatedAt: new Date() })
    .where(eq(pages.id, pageId));
  await db.insert(auditLog).values({
    siteId: page.siteId,
    userId,
    action: "page.restored",
    detail: { pageId, from: old.number, version: version.number },
  });
  return version;
}

export async function listVersions(db: Db, pageId: string) {
  return db
    .select({ id: pageVersions.id, number: pageVersions.number, title: pageVersions.title, createdAt: pageVersions.createdAt })
    .from(pageVersions)
    .where(eq(pageVersions.pageId, pageId))
    .orderBy(desc(pageVersions.number))
    .limit(50);
}
