import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, newsletterDeliveries, newsletters, newsletterSubscribers, sites } from "@/db/schema";
import { deliver, type EmailProvider } from "@/lib/email/send";
import { readSiteInfo } from "@/lib/site-info";
import { publicSiteUrl } from "@/lib/site-url";
import { newsletterInputSchema, readBlocks, sendProblems, type NewsletterInput } from "./blocks";
import { confirmationEmail, newsletterEmail, type NewsletterSite } from "./email";
import { NEWSLETTER_CONFIRM_PATH, NEWSLETTER_UNSUBSCRIBE_API, NEWSLETTER_UNSUBSCRIBE_PATH } from "./subscribers";
import { createConfirmToken, createUnsubscribeToken } from "./tokens";

/*
 * Sending av nyhetsbrev. «Send» lager én rad per bekreftet abonnent (newsletter_deliveries). Bakgrunnsjobben
 * hvert tiende minutt sender et begrenset antall per kjøring, så en stor liste ikke får Workeren til å gå tom for tid.
 * Hver mottaker får sin egen e-post med egen avmeldingslenke. Ingen ser hvem andre som står på listen.
 */

/** Maks e-poster per kjøring. Hver e-post er ett kall til Brevo, og Workeren har et tak på antall kall. */
export const NEWSLETTER_PER_RUN = 150;
/** Så mange sendes samtidig. */
const PARALLEL = 5;
/** En mottaker som ble tatt av en kjøring som aldri ble ferdig, sendes ikke på nytt, men merkes som feilet. */
const STALE_CLAIM_MINUTES = 60;

export class NewsletterError extends Error {}

type Role = "owner" | "editor" | "developer";
type Actor = { siteId: string; role: Role; userId: string | null };

/** Eier og redaktør kan skrive og sende. Utvikleren kan se, men ikke sende til kundene. */
export function canSendNewsletter(role: Role) {
  return role === "owner" || role === "editor";
}

function assertCanSend(role: Role) {
  if (!canSendNewsletter(role)) throw new NewsletterError("Bare eier og redaktør kan skrive og sende nyhetsbrev.");
}

type SiteRow = typeof sites.$inferSelect;

export async function newsletterSite(db: Db, site: Pick<SiteRow, "id" | "slug" | "name" | "info" | "theme">): Promise<NewsletterSite> {
  return { name: site.name, info: readSiteInfo(site.info), theme: site.theme, baseUrl: await publicSiteUrl(db, site) };
}

/** Avsender er alltid plattformens adresse (EMAIL_FROM) med bedriftens navn. Svar går til bedriftens kontaktadresse. */
function sender(site: NewsletterSite) {
  return { fromName: site.name, ...(site.info.email && { replyTo: { email: site.info.email, name: site.name } }) };
}

// ---------- Bekreftelse (dobbel opt-in) ----------

export async function sendConfirmation(db: Db, provider: EmailProvider, subscriberId: string, consentedAt: Date) {
  const [row] = await db
    .select({ subscriber: newsletterSubscribers, site: sites })
    .from(newsletterSubscribers)
    .innerJoin(sites, eq(newsletterSubscribers.siteId, sites.id))
    .where(eq(newsletterSubscribers.id, subscriberId))
    .limit(1);
  if (!row || row.subscriber.status !== "venter") return;
  const site = await newsletterSite(db, row.site);
  const token = await createConfirmToken(subscriberId, consentedAt);
  const email = confirmationEmail(site, `${site.baseUrl}${NEWSLETTER_CONFIRM_PATH}?t=${encodeURIComponent(token)}`);
  await deliver(
    db,
    provider,
    { siteId: row.site.id, kind: "nyhetsbrev-bekreft" },
    { ...email, ...sender(site), to: { email: row.subscriber.email, ...(row.subscriber.name && { name: row.subscriber.name }) }, tags: ["nyhetsbrev-bekreft"] },
  );
}

// ---------- Kladd ----------

function parseInput(input: unknown): NewsletterInput {
  const parsed = newsletterInputSchema.safeParse(input);
  if (!parsed.success) throw new NewsletterError(parsed.error.issues[0].message);
  return parsed.data;
}

/** Lagrer kladden. Uten id lages en ny. Et nyhetsbrev som er sendt, kan ikke endres. */
export async function saveDraft(db: Db, a: Actor, id: string | null, input: unknown, now = new Date()): Promise<string> {
  assertCanSend(a.role);
  const data = parseInput(input);
  if (id) {
    const [updated] = await db
      .update(newsletters)
      .set({ ...data, updatedAt: now })
      .where(and(eq(newsletters.id, id), eq(newsletters.siteId, a.siteId), eq(newsletters.status, "kladd")))
      .returning({ id: newsletters.id });
    if (updated) return updated.id;
  }
  const [created] = await db
    .insert(newsletters)
    .values({ ...data, siteId: a.siteId, createdBy: a.userId, updatedAt: now })
    .returning({ id: newsletters.id });
  return created.id;
}

/** Den siste kladden, som studioet åpner. */
export async function latestDraft(db: Db, siteId: string) {
  const [row] = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.siteId, siteId), eq(newsletters.status, "kladd")))
    .orderBy(desc(newsletters.updatedAt))
    .limit(1);
  return row ? { id: row.id, subject: row.subject, preheader: row.preheader, blocks: readBlocks(row.blocks) } : null;
}

/** Sendte nyhetsbrev, nyeste først. */
export async function newsletterHistory(db: Db, siteId: string, limit = 50) {
  return db
    .select({
      id: newsletters.id,
      subject: newsletters.subject,
      status: newsletters.status,
      recipientCount: newsletters.recipientCount,
      sentCount: newsletters.sentCount,
      failedCount: newsletters.failedCount,
      queuedAt: newsletters.queuedAt,
      finishedAt: newsletters.finishedAt,
    })
    .from(newsletters)
    .where(and(eq(newsletters.siteId, siteId), sql`${newsletters.status} <> 'kladd'`))
    .orderBy(desc(newsletters.queuedAt))
    .limit(limit);
}

// ---------- Testutgave ----------

/** Sender kladden til den som er logget inn, med «Test:» foran emnet. Avmeldingslenken går til siden uten nøkkel. */
export async function sendTest(db: Db, provider: EmailProvider, a: Actor, input: unknown, to: string) {
  assertCanSend(a.role);
  const data = parseInput(input);
  const problems = sendProblems(data);
  if (problems.length) throw new NewsletterError(problems.join("\n"));
  const [row] = await db.select().from(sites).where(eq(sites.id, a.siteId)).limit(1);
  const site = await newsletterSite(db, row);
  const email = newsletterEmail(data, site, `${site.baseUrl}${NEWSLETTER_UNSUBSCRIBE_PATH}`);
  return deliver(db, provider, { siteId: a.siteId, kind: "nyhetsbrev-test" }, { ...email, subject: `Test: ${email.subject}`, ...sender(site), to: { email: to }, tags: ["nyhetsbrev-test"] });
}

// ---------- Sending ----------

export async function confirmedCount(db: Db, siteId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.status, "bekreftet")));
  return n;
}

/**
 * Legger alle bekreftede abonnenter i køen og låser kladden. Selve sendingen gjøres av processQueue.
 * Mottakerne legges inn mens nyhetsbrevet fortsatt er kladd, og kladden går til «sender» i én setning etterpå.
 * Da kan ikke bakgrunnsjobben se et nyhetsbrev uten mottakere, og et dobbeltklikk sender ikke to ganger.
 */
export async function queueNewsletter(db: Db, a: Actor, id: string, input: unknown, now = new Date()) {
  assertCanSend(a.role);
  const data = parseInput(input);
  const problems = sendProblems(data);
  if (problems.length) throw new NewsletterError(problems.join("\n"));
  const draft = and(eq(newsletters.id, id), eq(newsletters.siteId, a.siteId), eq(newsletters.status, "kladd"));
  const [saved] = await db.update(newsletters).set({ ...data, updatedAt: now }).where(draft).returning({ id: newsletters.id });
  if (!saved) throw new NewsletterError("Nyhetsbrevet er allerede sendt.");

  const recipients = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.siteId, a.siteId), eq(newsletterSubscribers.status, "bekreftet")));
  if (recipients.length === 0) throw new NewsletterError("Ingen har bekreftet påmeldingen ennå, så det er ingen å sende til.");
  // I porsjoner, så en stor liste ikke sprenger taket på parametere i én SQL-setning.
  for (let i = 0; i < recipients.length; i += 1000) {
    await db
      .insert(newsletterDeliveries)
      .values(recipients.slice(i, i + 1000).map((r) => ({ newsletterId: id, subscriberId: r.id })))
      .onConflictDoNothing();
  }
  const [{ n }] = await db.select({ n: count() }).from(newsletterDeliveries).where(eq(newsletterDeliveries.newsletterId, id));
  const [locked] = await db
    .update(newsletters)
    .set({ status: "sender", queuedAt: now, recipientCount: n })
    .where(draft)
    .returning({ id: newsletters.id });
  if (!locked) throw new NewsletterError("Nyhetsbrevet er allerede sendt.");
  await db.insert(auditLog).values({ siteId: a.siteId, userId: a.userId, action: "newsletter.sent", detail: { newsletterId: id, recipients: n } });
  return { recipients: n };
}

type Outcome = { newsletterId: string; subscriberId: string; status: "sendt" | "logget" | "feilet" | "hoppet"; error?: string };

/**
 * Sender neste porsjon fra køen, eldste nyhetsbrev først. Mottakerne «tas» med FOR UPDATE SKIP LOCKED, så to
 * kjøringer samtidig (bakgrunnsjobben og sendingen rett etter «Send») aldri sender til samme person.
 */
export async function processQueue(db: Db, provider: EmailProvider, { limit = NEWSLETTER_PER_RUN, now = new Date() } = {}) {
  await db
    .update(newsletterDeliveries)
    .set({ status: "feilet", error: "Sendingen ble avbrutt. Usikkert om e-posten kom fram, så den sendes ikke på nytt." })
    .where(and(eq(newsletterDeliveries.status, "sender"), lt(newsletterDeliveries.claimedAt, new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000))));

  const claimed = await db
    .update(newsletterDeliveries)
    .set({ status: "sender", claimedAt: now })
    .where(
      sql`(${newsletterDeliveries.newsletterId}, ${newsletterDeliveries.subscriberId}) in (
        select nd.newsletter_id, nd.subscriber_id from newsletter_deliveries nd
        join newsletters n on n.id = nd.newsletter_id
        where nd.status = 'venter' and n.status = 'sender'
        order by n.queued_at, nd.subscriber_id
        limit ${limit}
        for update of nd skip locked)`,
    )
    .returning({ newsletterId: newsletterDeliveries.newsletterId, subscriberId: newsletterDeliveries.subscriberId });

  const outcomes: Outcome[] = [];
  if (claimed.length) {
    const letterIds = [...new Set(claimed.map((c) => c.newsletterId))];
    const letters = await db.select({ newsletter: newsletters, site: sites }).from(newsletters).innerJoin(sites, eq(newsletters.siteId, sites.id)).where(inArray(newsletters.id, letterIds));
    const prepared = new Map<string, { input: NewsletterInput; site: NewsletterSite; siteId: string }>();
    for (const l of letters) {
      prepared.set(l.newsletter.id, {
        input: { subject: l.newsletter.subject, preheader: l.newsletter.preheader, blocks: readBlocks(l.newsletter.blocks) },
        site: await newsletterSite(db, l.site),
        siteId: l.site.id,
      });
    }
    const subscribers = new Map(
      (await db.select().from(newsletterSubscribers).where(inArray(newsletterSubscribers.id, [...new Set(claimed.map((c) => c.subscriberId))]))).map((s) => [s.id, s]),
    );

    const sendOne = async (c: (typeof claimed)[number]): Promise<Outcome> => {
      const letter = prepared.get(c.newsletterId);
      const subscriber = subscribers.get(c.subscriberId);
      // Meldt av etter at nyhetsbrevet ble lagt i køen: sendes ikke.
      if (!letter || !subscriber || subscriber.status !== "bekreftet" || subscriber.siteId !== letter.siteId) return { ...c, status: "hoppet" };
      if (provider.name === "logg") return { ...c, status: "logget" };
      const token = await createUnsubscribeToken(subscriber.id);
      const origin = new URL(letter.site.baseUrl).origin;
      const email = newsletterEmail(letter.input, letter.site, `${letter.site.baseUrl}${NEWSLETTER_UNSUBSCRIBE_PATH}?t=${encodeURIComponent(token)}`);
      try {
        await provider.send({
          ...email,
          ...sender(letter.site),
          to: { email: subscriber.email, ...(subscriber.name && { name: subscriber.name }) },
          tags: ["nyhetsbrev"],
          headers: {
            "List-Unsubscribe": `<${origin}${NEWSLETTER_UNSUBSCRIBE_API}?t=${encodeURIComponent(token)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        return { ...c, status: "sendt" };
      } catch (err) {
        console.error("Nyhetsbrev feilet", err);
        return { ...c, status: "feilet", error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
      }
    };

    for (let i = 0; i < claimed.length; i += PARALLEL) {
      outcomes.push(...(await Promise.all(claimed.slice(i, i + PARALLEL).map(sendOne))));
    }

    // Én oppdatering per nyhetsbrev og utfall, ikke én per mottaker.
    const groups = new Map<string, Outcome[]>();
    for (const o of outcomes) {
      if (o.status === "feilet") continue;
      const key = `${o.newsletterId}:${o.status}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    for (const list of groups.values()) {
      const { newsletterId, status } = list[0];
      await db
        .update(newsletterDeliveries)
        .set({ status, sentAt: status === "hoppet" ? null : now, claimedAt: null })
        .where(and(eq(newsletterDeliveries.newsletterId, newsletterId), inArray(newsletterDeliveries.subscriberId, list.map((o) => o.subscriberId))));
    }
    for (const o of outcomes.filter((o) => o.status === "feilet")) {
      await db
        .update(newsletterDeliveries)
        .set({ status: "feilet", error: o.error ?? null, claimedAt: null })
        .where(and(eq(newsletterDeliveries.newsletterId, o.newsletterId), eq(newsletterDeliveries.subscriberId, o.subscriberId)));
    }
  }

  const finished = await finishSent(db, now);
  const tally = (s: Outcome["status"]) => outcomes.filter((o) => o.status === s).length;
  return { sent: tally("sendt"), logged: tally("logget"), failed: tally("feilet"), skipped: tally("hoppet"), finished };
}

/** Nyhetsbrev uten flere mottakere i kø blir «sendt», med tallene lagret for historikken. */
async function finishSent(db: Db, now: Date): Promise<number> {
  const sending = await db.select({ id: newsletters.id }).from(newsletters).where(eq(newsletters.status, "sender")).orderBy(asc(newsletters.queuedAt));
  let finished = 0;
  for (const { id } of sending) {
    const rows = await db
      .select({ status: newsletterDeliveries.status, n: count() })
      .from(newsletterDeliveries)
      .where(eq(newsletterDeliveries.newsletterId, id))
      .groupBy(newsletterDeliveries.status);
    const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
    if ((by.venter ?? 0) + (by.sender ?? 0) > 0) continue;
    await db
      .update(newsletters)
      .set({ status: "sendt", finishedAt: now, sentCount: (by.sendt ?? 0) + (by.logget ?? 0), failedCount: by.feilet ?? 0 })
      .where(and(eq(newsletters.id, id), eq(newsletters.status, "sender")));
    finished++;
  }
  return finished;
}

/** Hvor langt sendingen har kommet, til historikken mens den pågår. */
export async function deliveryProgress(db: Db, newsletterId: string) {
  const rows = await db
    .select({ status: newsletterDeliveries.status, n: count() })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.newsletterId, newsletterId))
    .groupBy(newsletterDeliveries.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<Outcome["status"] | "venter" | "sender", number>>;
}
