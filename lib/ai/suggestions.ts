import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { aiSuggestions, auditLog, pages } from "@/db/schema";
import { pageContentSchema, type PageContent } from "@/lib/content/types";
import { createPost } from "@/lib/pages";
import { saveDraft } from "@/lib/publishing";
import { editableTextFields } from "./context";
import { MAX_SUGGESTIONS_PER_RUN } from "./config";
import { rawSuggestionSchema, type RawSuggestion, type SuggestionKind } from "./prompt";

export type Suggestion = typeof aiSuggestions.$inferSelect;
export type NewSuggestion = typeof aiSuggestions.$inferInsert;

export class SuggestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuggestionError";
  }
}

const LIMITS: Partial<Record<SuggestionKind, number>> = {
  seo_tittel: 70,
  seo_beskrivelse: 170,
  tekst: 4000,
  blogginnlegg: 8000,
  sosialt_innlegg: 2200,
  tips: 1000,
};

/** Tankestrek er det tydeligste AI-sporet. Byttes til vanlig bindestrek, også om modellen glemmer regelen. */
export function cleanText(text: string): string {
  return text.replace(/\s*[\u2013\u2014]\s*/g, " - ").replace(/[ \t]+\n/g, "\n").trim();
}

type PageRow = { id: string; draft: unknown };

function readContent(draft: unknown): PageContent | null {
  const parsed = pageContentSchema.safeParse(draft);
  return parsed.success ? parsed.data : null;
}

/** Verdien forslaget erstatter, eller undefined når målet ikke finnes eller ikke kan endres. */
function currentValue(kind: SuggestionKind, content: PageContent, sectionId: string, field: string): string | undefined {
  if (kind === "seo_tittel") return content.seo?.title ?? "";
  if (kind === "seo_beskrivelse") return content.seo?.description ?? "";
  if (kind === "tekst") {
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section || !editableTextFields(section.type).includes(field)) return undefined;
    const value = section.props[field];
    return typeof value === "string" ? value : value === undefined ? "" : undefined;
  }
  return undefined;
}

/**
 * Gjør svaret fra AI-en om til forslag som kan lagres. Alt som peker på sider eller felt utenfor nettstedet,
 * eller som er for langt, forkastes. Det er her en feil eller et påfunn fra modellen stoppes.
 */
export function validateSuggestions(raw: unknown[], sitePages: PageRow[], siteId: string, runId: string | null): { accepted: NewSuggestion[]; rejected: number } {
  const accepted: NewSuggestion[] = [];
  let rejected = 0;
  const pagesById = new Map(sitePages.map((p) => [p.id, p]));

  for (const item of raw.slice(0, MAX_SUGGESTIONS_PER_RUN)) {
    const parsed = rawSuggestionSchema.safeParse(item);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const row = toRow(parsed.data, pagesById, siteId, runId);
    if (row) accepted.push(row);
    else rejected++;
  }
  rejected += Math.max(0, raw.length - MAX_SUGGESTIONS_PER_RUN);
  return { accepted, rejected };
}

function toRow(s: RawSuggestion, pagesById: Map<string, PageRow>, siteId: string, runId: string | null): NewSuggestion | null {
  const value = cleanText(s.ny_verdi);
  const title = cleanText(s.tittel).slice(0, 120);
  const reason = cleanText(s.hvorfor).slice(0, 600);
  const effect = cleanText(s.effekt).slice(0, 400);
  if (!value || !title || value.length > (LIMITS[s.type] ?? 0)) return null;
  const base = { siteId, runId, role: s.rolle, kind: s.type, title, reason, effect };

  switch (s.type) {
    case "seo_tittel":
    case "seo_beskrivelse":
    case "tekst": {
      const page = pagesById.get(s.side);
      const content = page && readContent(page.draft);
      if (!page || !content) return null;
      const before = currentValue(s.type, content, s.seksjon, s.felt);
      if (before === undefined || before === value) return null;
      return {
        ...base,
        pageId: page.id,
        sectionId: s.type === "tekst" ? s.seksjon : null,
        field: s.type === "tekst" ? s.felt : null,
        before,
        proposal: { value },
      };
    }
    case "blogginnlegg": {
      const ingress = cleanText(s.ingress).slice(0, 400);
      if (title.length > 120) return null;
      return { ...base, proposal: { value, ingress } };
    }
    case "sosialt_innlegg":
      if (!s.kanal) return null;
      return { ...base, proposal: { value, channel: s.kanal } };
    case "tips":
      return { ...base, proposal: { value } };
  }
}

export async function listSuggestions(db: Db, siteId: string) {
  const open = await db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.siteId, siteId), eq(aiSuggestions.status, "ny")))
    .orderBy(desc(aiSuggestions.createdAt));
  const decided = await db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.siteId, siteId), inArray(aiSuggestions.status, ["godkjent", "avvist", "utdatert"])))
    .orderBy(desc(aiSuggestions.decidedAt))
    .limit(20);
  return { open, decided };
}

export async function previousTitles(db: Db, siteId: string, now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - 60 * 86_400_000);
  const rows = await db
    .select({ title: aiSuggestions.title })
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.siteId, siteId), gt(aiSuggestions.createdAt, since)))
    .orderBy(desc(aiSuggestions.createdAt))
    .limit(60);
  return rows.map((r) => r.title);
}

async function loadOpen(db: Db, siteId: string, suggestionId: string): Promise<Suggestion> {
  const [row] = await db
    .select()
    .from(aiSuggestions)
    .where(and(eq(aiSuggestions.id, suggestionId), eq(aiSuggestions.siteId, siteId)))
    .limit(1);
  if (!row) throw new SuggestionError("Fant ikke forslaget.");
  if (row.status !== "ny") throw new SuggestionError("Forslaget er allerede behandlet.");
  return row;
}

/** Setter status bare hvis forslaget fortsatt er nytt, så to klikk samtidig ikke gir to endringer. */
async function decide(db: Db, row: Suggestion, status: "godkjent" | "avvist" | "utdatert", userId: string, extra: Partial<Suggestion> = {}) {
  const updated = await db
    .update(aiSuggestions)
    .set({ status, decidedBy: userId, decidedAt: new Date(), ...extra })
    .where(and(eq(aiSuggestions.id, row.id), eq(aiSuggestions.status, "ny")))
    .returning({ id: aiSuggestions.id });
  if (!updated.length) throw new SuggestionError("Forslaget er allerede behandlet.");
}

export type ApproveResult = { message: string; pageId: string | null };

/**
 * Godkjenn: endringen skrives i kladden, aldri rett til det publiserte nettstedet. Kunden publiserer selv,
 * og kan gå tilbake til en tidligere versjon som vanlig. Er kladden endret siden forslaget ble laget, blir
 * forslaget utdatert i stedet for å overskrive det kunden har skrevet.
 */
export async function approveSuggestion(db: Db, siteId: string, suggestionId: string, userId: string): Promise<ApproveResult> {
  const row = await loadOpen(db, siteId, suggestionId);
  const kind = row.kind as SuggestionKind;
  let result: ApproveResult;

  if (kind === "seo_tittel" || kind === "seo_beskrivelse" || kind === "tekst") {
    const [page] = row.pageId
      ? await db.select().from(pages).where(and(eq(pages.id, row.pageId), eq(pages.siteId, siteId))).limit(1)
      : [];
    const content = page && readContent(page.draft);
    if (!page || !content) {
      await decide(db, row, "utdatert", userId);
      throw new SuggestionError("Siden finnes ikke lenger, så forslaget kan ikke brukes.");
    }
    if (currentValue(kind, content, row.sectionId ?? "", row.field ?? "") !== row.before) {
      await decide(db, row, "utdatert", userId);
      throw new SuggestionError("Teksten er endret siden forslaget ble laget, så det er ikke brukt. Det du har skrevet, er beholdt.");
    }
    const value = row.proposal.value;
    const next: PageContent =
      kind === "tekst"
        ? { ...content, sections: content.sections.map((s) => (s.id === row.sectionId ? { ...s, props: { ...s.props, [row.field!]: value } } : s)) }
        : { ...content, seo: { ...content.seo, [kind === "seo_tittel" ? "title" : "description"]: value } };
    await saveDraft(db, page.id, { title: page.title, content: next }, userId);
    await decide(db, row, "godkjent", userId);
    result = { message: `Endringen er lagt i kladden for «${page.title}». Publiser siden når du vil at den skal vises.`, pageId: page.id };
  } else if (kind === "blogginnlegg") {
    const post = await createPost(db, siteId, { title: row.title }, userId);
    const content = readContent(post.draft)!;
    const next: PageContent = {
      ...content,
      sections: content.sections.map((s) =>
        s.id === "ingress" ? { ...s, props: { ...s.props, undertekst: row.proposal.ingress ?? "" } } : s.id === "tekst" ? { ...s, props: { ...s.props, brodtekst: row.proposal.value } } : s,
      ),
    };
    await saveDraft(db, post.id, { title: post.title, content: next }, userId);
    await decide(db, row, "godkjent", userId, { pageId: post.id });
    result = { message: "Innlegget er lagret som kladd under Sider. Les gjennom og publiser når du er fornøyd.", pageId: post.id };
  } else {
    await decide(db, row, "godkjent", userId);
    result = { message: kind === "sosialt_innlegg" ? "Godkjent. Kopier teksten og legg den ut der du vil." : "Notert.", pageId: null };
  }

  await db.insert(auditLog).values({ siteId, userId, action: "ai.approved", detail: { suggestionId: row.id, kind, pageId: result.pageId } });
  return result;
}

export async function rejectSuggestion(db: Db, siteId: string, suggestionId: string, userId: string) {
  const row = await loadOpen(db, siteId, suggestionId);
  await decide(db, row, "avvist", userId);
  await db.insert(auditLog).values({ siteId, userId, action: "ai.rejected", detail: { suggestionId: row.id, kind: row.kind } });
}
