import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { emailLog, newsletterDeliveries, newsletters, newsletterSubscribers, users } from "@/db/schema";
import { SectionPreview, type RenderContext } from "@/components/sections";
import { validatePageContent } from "@/lib/content/registry";
import { newSection } from "@/lib/content/examples";
import type { Section } from "@/lib/content/types";
import type { EmailMessage, EmailProvider } from "@/lib/email/send";
import { lagPersonvernerklaering } from "@/lib/legal/personvern";
import { consentSentence, sendProblems, type NewsletterInput } from "@/lib/nyhetsbrev/blocks";
import { absoluteUrl, newsletterEmail } from "@/lib/nyhetsbrev/email";
import { NEWSLETTER_PER_RUN, processQueue, queueNewsletter, saveDraft, sendConfirmation, sendTest } from "@/lib/nyhetsbrev/send";
import {
  confirmSubscription,
  expireUnconfirmed,
  subscribe,
  subscribersCsv,
  unsubscribe,
  usesNewsletter,
} from "@/lib/nyhetsbrev/subscribers";
import { createConfirmToken, createUnsubscribeToken, readConfirmToken, readUnsubscribeToken } from "@/lib/nyhetsbrev/tokens";
import { runRetention } from "@/lib/retention";
import { readSiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";
import { createSiteFromPack } from "@/lib/sites";
import { buildTheme } from "@/lib/themes";

let db: Db;
let siteId: string;
let otherSiteId: string;
let userId: string;

/** Later som Brevo og tar vare på alt som «sendes». */
function fakeBrevo(fail: (m: EmailMessage) => boolean = () => false) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    name: "brevo",
    async send(m) {
      if (fail(m)) throw new Error("Brevo svarte 400: ugyldig adresse");
      sent.push(m);
      return { id: `id-${sent.length}` };
    },
  };
  return { provider, sent };
}

const linkToken = (m: EmailMessage, path: string) => {
  const match = m.text.match(new RegExp(`${path}\\?t=([^\\s]+)`));
  return match ? decodeURIComponent(match[1]) : "";
};

const owner = () => ({ siteId, role: "owner" as const, userId });
const signup = (email: string, now?: Date) =>
  subscribe(db, { siteId, email, name: "", sourcePath: "/", consentText: consentSentence("Salong Åsheim") }, now);
const statusOf = async (email: string) =>
  (await db.select().from(newsletterSubscribers).where(and(eq(newsletterSubscribers.siteId, siteId), eq(newsletterSubscribers.email, email))))[0];

const letter: NewsletterInput = {
  subject: "Nyheter i november",
  preheader: "Nye tider og et lite tilbud",
  blocks: [
    { type: "overskrift", tekst: "Hei!" },
    { type: "tekst", tekst: "Vi har fått nye tider.\n\nVelkommen innom." },
    { type: "knapp", tekst: "Bestill time", lenke: "/bestill" },
  ],
};

async function confirmed(email: string) {
  const r = await signup(email);
  await confirmSubscription(db, siteId, await createConfirmToken(r.subscriberId, r.consentedAt));
  return r.subscriberId;
}

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  const [user] = await db.insert(users).values({ email: "eier@test.no", passwordHash: "x" }).returning();
  userId = user.id;
  siteId = (await createSiteFromPack(db, { name: "Salong Åsheim", packKey: "handverker", info: demoInfo, ownerId: user.id })).id;
  otherSiteId = (await createSiteFromPack(db, { name: "Annen salong", packKey: "handverker", info: demoInfo, ownerId: user.id })).id;
});

describe("dobbel opt-in", () => {
  it("lagrer påmeldingen som «venter» med samtykke og kilde, og sender bekreftelse med signert lenke", async () => {
    const { provider, sent } = fakeBrevo();
    const result = await subscribe(db, { siteId, email: " Kari@Example.NO ", name: "Kari", sourcePath: "/om-oss", consentText: consentSentence("Salong Åsheim") });
    expect(result.sendConfirmation).toBe(true);
    const row = await statusOf("kari@example.no");
    expect(row.status).toBe("venter");
    expect(row.sourcePath).toBe("/om-oss");
    expect(row.consentText).toContain("Salong Åsheim");
    expect(row.confirmedAt).toBeNull();

    await sendConfirmation(db, provider, result.subscriberId, result.consentedAt);
    expect(sent).toHaveLength(1);
    expect(sent[0].to.email).toBe("kari@example.no");
    expect(sent[0].fromName).toBe("Salong Åsheim");
    expect(sent[0].replyTo?.email).toBe(demoInfo.email);
    expect(sent[0].subject).toBe("Bekreft påmeldingen til nyhetsbrevet fra Salong Åsheim");
    const [log] = await db.select().from(emailLog).where(eq(emailLog.kind, "nyhetsbrev-bekreft"));
    expect(log.status).toBe("sendt");

    const token = linkToken(sent[0], "/nyhetsbrev/bekreft");
    expect(await confirmSubscription(db, siteId, token)).toEqual({ ok: true, already: false });
    const after = await statusOf("kari@example.no");
    expect(after.status).toBe("bekreftet");
    expect(after.confirmedAt).toBeInstanceOf(Date);
    // Å bruke lenken igjen er ufarlig.
    expect(await confirmSubscription(db, siteId, token)).toEqual({ ok: true, already: true });
  });

  it("samme adresse to ganger blir én rad, og en bekreftet adresse får ingen ny bekreftelse", async () => {
    const first = await signup("ola@example.no");
    const again = await signup("OLA@example.no");
    expect(again.subscriberId).toBe(first.subscriberId);
    expect(again.sendConfirmation).toBe(true);
    await confirmSubscription(db, siteId, await createConfirmToken(again.subscriberId, again.consentedAt));
    expect((await signup("ola@example.no")).sendConfirmation).toBe(false);
    expect(await db.select().from(newsletterSubscribers)).toHaveLength(1);
  });

  it("bekreftelse gjelder bare riktig nettsted og den nyeste påmeldingen", async () => {
    const first = await signup("per@example.no", new Date("2026-11-01T10:00:00Z"));
    const oldToken = await createConfirmToken(first.subscriberId, first.consentedAt);
    expect(await confirmSubscription(db, otherSiteId, oldToken)).toEqual({ ok: false, reason: "ukjent" });
    await signup("per@example.no", new Date("2026-11-01T11:00:00Z"));
    expect(await confirmSubscription(db, siteId, oldToken)).toEqual({ ok: false, reason: "erstattet" });
    expect((await statusOf("per@example.no")).status).toBe("venter");
  });
});

describe("signerte nøkler", () => {
  it("bekreftelsen utløper etter 30 dager, og endrede eller feil nøkler avvises", async () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const token = await createConfirmToken("abc", now, now);
    expect(await readConfirmToken(token, new Date("2026-11-30T12:00:00Z"))).toEqual({ subscriberId: "abc", consentedAt: now.getTime() });
    expect(await readConfirmToken(token, new Date("2026-12-02T12:00:00Z"))).toBe("utlopt");
    expect(await readConfirmToken(token.slice(0, -2) + "xx", now)).toBeNull();
    expect(await readConfirmToken("tull", now)).toBeNull();
    // En avmeldingsnøkkel kan ikke brukes til å bekrefte, og omvendt.
    const unsub = await createUnsubscribeToken("abc");
    expect(await readConfirmToken(unsub, now)).toBeNull();
    expect(await readUnsubscribeToken(token)).toBeNull();
    expect(await readUnsubscribeToken(unsub)).toBe("abc");
  });

  it("utløpt bekreftelse gir egen beskjed, og påmeldingen forblir ubekreftet", async () => {
    const r = await signup("utlopt@example.no", new Date("2026-10-01T12:00:00Z"));
    const token = await createConfirmToken(r.subscriberId, r.consentedAt, new Date("2026-10-01T12:00:00Z"));
    expect(await confirmSubscription(db, siteId, token, new Date("2026-11-02T12:00:00Z"))).toEqual({ ok: false, reason: "utlopt" });
    expect((await statusOf("utlopt@example.no")).status).toBe("venter");
  });
});

describe("avmelding og sperreliste", () => {
  it("melder av med nøkkelen, uten innlogging, og beholder adressen som «avmeldt»", async () => {
    const id = await confirmed("anne@example.no");
    const token = await createUnsubscribeToken(id);
    expect(await unsubscribe(db, token, otherSiteId)).toBeNull();
    expect(await unsubscribe(db, token, siteId)).toEqual({ siteId, email: "anne@example.no" });
    const row = await statusOf("anne@example.no");
    expect(row.status).toBe("avmeldt");
    expect(row.unsubscribedAt).toBeInstanceOf(Date);
    // Ett-klikks-avmeldingen fra e-postprogrammet har ikke nettstedet, bare nøkkelen.
    expect(await unsubscribe(db, token, null)).toEqual({ siteId, email: "anne@example.no" });
    expect(await unsubscribe(db, "feil", null)).toBeNull();
  });

  it("påmelding etter avmelding krever ny bekreftelse, og den gamle lenken virker ikke", async () => {
    const first = await signup("bjorn@example.no", new Date("2026-10-01T12:00:00Z"));
    const oldConfirm = await createConfirmToken(first.subscriberId, first.consentedAt);
    await confirmSubscription(db, siteId, oldConfirm);
    await unsubscribe(db, await createUnsubscribeToken(first.subscriberId), siteId);
    expect(await confirmSubscription(db, siteId, oldConfirm)).toEqual({ ok: false, reason: "avmeldt" });

    const again = await signup("bjorn@example.no");
    expect(again.sendConfirmation).toBe(true);
    const row = await statusOf("bjorn@example.no");
    expect(row.status).toBe("venter");
    expect(row.unsubscribedAt).toBeInstanceOf(Date);
    expect(await confirmSubscription(db, siteId, oldConfirm)).toEqual({ ok: false, reason: "erstattet" });
    await confirmSubscription(db, siteId, await createConfirmToken(again.subscriberId, again.consentedAt));
    const done = await statusOf("bjorn@example.no");
    expect(done.status).toBe("bekreftet");
    expect(done.unsubscribedAt).toBeNull();
  });

  it("bare bekreftede får nyhetsbrevet, og den som melder seg av underveis hoppes over", async () => {
    const { provider, sent } = fakeBrevo();
    const a = await confirmed("a@example.no");
    await confirmed("b@example.no");
    await signup("venter@example.no");
    const gone = await confirmed("borte@example.no");
    await unsubscribe(db, await createUnsubscribeToken(gone), siteId);

    const id = await saveDraft(db, owner(), null, letter);
    expect(await queueNewsletter(db, owner(), id, letter)).toEqual({ recipients: 2 });
    await unsubscribe(db, await createUnsubscribeToken(a), siteId);
    const result = await processQueue(db, provider);
    expect(result).toMatchObject({ sent: 1, skipped: 1, failed: 0, finished: 1 });
    expect(sent.map((m) => m.to.email)).toEqual(["b@example.no"]);
  });
});

describe("sending i porsjoner", () => {
  it("sender hver mottaker for seg, med avmeldingslenke og List-Unsubscribe, og stopper ved taket per kjøring", async () => {
    const { provider, sent } = fakeBrevo();
    for (let i = 0; i < 7; i++) await confirmed(`kunde${i}@example.no`);
    const id = await saveDraft(db, owner(), null, letter);
    await queueNewsletter(db, owner(), id, letter);

    expect(await processQueue(db, provider, { limit: 3 })).toMatchObject({ sent: 3, finished: 0 });
    let [row] = await db.select().from(newsletters).where(eq(newsletters.id, id));
    expect(row.status).toBe("sender");
    expect(await processQueue(db, provider, { limit: 3 })).toMatchObject({ sent: 3, finished: 0 });
    expect(await processQueue(db, provider, { limit: 3 })).toMatchObject({ sent: 1, finished: 1 });
    expect(await processQueue(db, provider, { limit: 3 })).toMatchObject({ sent: 0, finished: 0 });

    [row] = await db.select().from(newsletters).where(eq(newsletters.id, id));
    expect(row).toMatchObject({ status: "sendt", recipientCount: 7, sentCount: 7, failedCount: 0 });
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(new Set(sent.map((m) => m.to.email)).size).toBe(7);

    for (const m of sent) {
      expect(m.fromName).toBe("Salong Åsheim");
      expect(m.replyTo?.email).toBe(demoInfo.email);
      expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(m.headers?.["List-Unsubscribe"]).toMatch(/^<https?:\/\/[^>]+\/api\/nyhetsbrev\/avmeld\?t=.+>$/);
      // Lenken i bunnen er personlig og melder av akkurat denne mottakeren.
      const token = linkToken(m, "/nyhetsbrev/avmeld");
      const [sub] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.id, (await readUnsubscribeToken(token))!));
      expect(sub.email).toBe(m.to.email);
    }
    expect(NEWSLETTER_PER_RUN).toBeLessThanOrEqual(200);
  });

  it("en mottaker som feiler, sendes ikke på nytt og telles som feilet", async () => {
    const { provider } = fakeBrevo((m) => m.to.email === "feil@example.no");
    await confirmed("ok@example.no");
    await confirmed("feil@example.no");
    const id = await saveDraft(db, owner(), null, letter);
    await queueNewsletter(db, owner(), id, letter);
    expect(await processQueue(db, provider)).toMatchObject({ sent: 1, failed: 1, finished: 1 });
    const [row] = await db.select().from(newsletters).where(eq(newsletters.id, id));
    expect(row).toMatchObject({ sentCount: 1, failedCount: 1 });
    const failed = await db.select().from(newsletterDeliveries).where(eq(newsletterDeliveries.status, "feilet"));
    expect(failed[0].error).toContain("ugyldig adresse");
  });

  it("uten Brevo logges sendingen bare, og en mottaker som ble hengende, sendes ikke på nytt", async () => {
    await confirmed("x@example.no");
    await confirmed("y@example.no");
    const id = await saveDraft(db, owner(), null, letter);
    await queueNewsletter(db, owner(), id, letter);
    // Som om en kjøring tok mottakeren og døde for to timer siden.
    const [first] = await db.select().from(newsletterDeliveries).limit(1);
    await db
      .update(newsletterDeliveries)
      .set({ status: "sender", claimedAt: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(newsletterDeliveries.subscriberId, first.subscriberId));
    const { logProvider } = await import("@/lib/email/send");
    expect(await processQueue(db, logProvider)).toMatchObject({ logged: 1, finished: 1 });
    const statuses = (await db.select().from(newsletterDeliveries)).map((d) => d.status).sort();
    expect(statuses).toEqual(["feilet", "logget"]);
  });

  it("et nyhetsbrev kan bare sendes én gang, og bare av eier eller redaktør", async () => {
    await confirmed("c@example.no");
    const id = await saveDraft(db, owner(), null, letter);
    await expect(queueNewsletter(db, { ...owner(), role: "developer" }, id, letter)).rejects.toThrow("Bare eier og redaktør");
    await queueNewsletter(db, owner(), id, letter);
    await expect(queueNewsletter(db, owner(), id, letter)).rejects.toThrow("allerede sendt");
    expect(await db.select().from(newsletterDeliveries)).toHaveLength(1);
    // Kladden kan ikke endres etter sending: lagring gir et nytt nyhetsbrev.
    expect(await saveDraft(db, owner(), id, letter)).not.toBe(id);
  });

  it("stopper sending uten emne, uten innhold eller uten bekreftede abonnenter", async () => {
    expect(sendProblems({ subject: "", preheader: "", blocks: [] })).toEqual(["Skriv et emne.", "Skriv noe i nyhetsbrevet."]);
    expect(sendProblems({ ...letter, blocks: [{ type: "bilde", src: "/media/x.webp", alt: "" }] })).toContain("Blokk 1: skriv hva bildet viser.");
    const id = await saveDraft(db, owner(), null, letter);
    await expect(queueNewsletter(db, owner(), id, letter)).rejects.toThrow("Ingen har bekreftet");
  });

  it("testutgaven går bare til den som ber om den, med «Test:» foran emnet", async () => {
    const { provider, sent } = fakeBrevo();
    await confirmed("abonnent@example.no");
    await sendTest(db, provider, owner(), letter, "eier@test.no");
    expect(sent.map((m) => [m.to.email, m.subject])).toEqual([["eier@test.no", "Test: Nyheter i november"]]);
    expect(await db.select().from(newsletterDeliveries)).toHaveLength(0);
  });
});

describe("e-posten", () => {
  const site = { name: "Salong <Åsheim>", info: readSiteInfo({ ...demoInfo, orgnr: "927889404" }), theme: buildTheme("atelier"), baseUrl: "https://salong.no" };

  it("escaper tekst, gjør lenker absolutte og har avsender, adresse og avmelding nederst", () => {
    const email = newsletterEmail(
      { subject: "Hei", preheader: "", blocks: [{ type: "tekst", tekst: "<script>alert(1)</script>" }, { type: "knapp", tekst: "Se mer", lenke: "/tilbud" }] },
      site,
      "https://salong.no/nyhetsbrev/avmeld?t=abc",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain('href="https://salong.no/tilbud"');
    expect(email.html).toContain("Salong &lt;Åsheim&gt;");
    expect(email.html).toContain("Storgata 1, 3340 Åmot");
    expect(email.html).toContain("Org.nr. 927 889 404");
    expect(email.html).toContain('href="https://salong.no/nyhetsbrev/avmeld?t=abc"');
    expect(email.text).toContain("Meld deg av: https://salong.no/nyhetsbrev/avmeld?t=abc");
    expect(email.text).not.toMatch(/[–—]/);
    expect(absoluteUrl("javascript:alert(1)", "https://salong.no")).toBe("#");
  });

  it("bilder hentes fra /media rett under domenet, også når nettstedet vises via /vis", () => {
    const src = "/media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.webp";
    const email = newsletterEmail({ subject: "Hei", preheader: "", blocks: [{ type: "bilde", src, alt: "Salongen" }] }, { ...site, baseUrl: "https://nettgata.no/vis/salong" }, "#");
    expect(email.html).toContain('src="https://nettgata.no/media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222-w1280.webp"');
    expect(email.html).toContain('alt="Salongen"');
  });
});

describe("seksjonen og personvern", () => {
  const ctx = (preview = false): RenderContext => ({
    site: { id: siteId, name: "Salong Åsheim", info: readSiteInfo({}), schemaType: "HairSalon" },
    nav: [],
    path: "/",
    preview,
    basePath: "/vis/salong",
    shop: false,
    products: [],
    layout: readSiteLayout({}),
  });
  const section: Section = { id: "nb", type: "nyhetsbrev", variant: "standard", props: { overskrift: "Få nyheter", tekst: "", knappTekst: "" } };

  it("kan publiseres, og viser samtykket, lenke til personvern og skjult honningkrukke", () => {
    expect(validatePageContent({ sections: [section] }).ok).toBe(true);
    expect(validatePageContent({ sections: [{ ...section, props: {} }] }).ok).toBe(false);
    const html = renderToStaticMarkup(createElement(SectionPreview, { section, theme: buildTheme("atelier")!, ctx: ctx() }));
    expect(html).toContain(consentSentence("Salong Åsheim"));
    expect(html).toContain('href="/vis/salong/personvern"');
    expect(html).toContain('name="nettsted"');
    expect(html).toContain("Meld meg på");
    expect(renderToStaticMarkup(createElement(SectionPreview, { section, theme: buildTheme("atelier")!, ctx: ctx(true) }))).toContain("av i forhåndsvisning");
    expect(newSection("nyhetsbrev", "standard", "x", []).props.overskrift).toBeTruthy();
  });

  it("personvernerklæringen tar med nyhetsbrevet når seksjonen er publisert eller noen står på listen", async () => {
    const page = (sections: Section[]) => [{ seo: {}, sections }];
    expect(await usesNewsletter(db, siteId, page([]))).toBe(false);
    expect(await usesNewsletter(db, siteId, page([{ ...section, hidden: true }]))).toBe(false);
    expect(await usesNewsletter(db, siteId, page([section]))).toBe(true);
    await signup("noen@example.no");
    expect(await usesNewsletter(db, siteId, page([]))).toBe(true);
    const tekst = JSON.stringify(lagPersonvernerklaering({ virksomhet: { navn: "Salong Åsheim", info: demoInfo }, type: "nettside", nyhetsbrev: true }));
    expect(tekst).toContain("Bekrefter du ikke innen 30 dager, sletter vi påmeldingen.");
  });

  it("CSV har alle, også de som har meldt seg av, med samtykketeksten", async () => {
    const id = await confirmed("csv@example.no");
    await unsubscribe(db, await createUnsubscribeToken(id), siteId);
    const csv = await subscribersCsv(db, siteId);
    expect(csv).toContain("csv@example.no;;Meldt av;");
    expect(csv).toContain(consentSentence("Salong Åsheim"));
  });
});

describe("sletting", () => {
  it("ubekreftede slettes etter 30 dager, men en tidligere avmelding blir stående som sperre", async () => {
    const old = new Date("2026-09-01T12:00:00Z");
    const now = new Date("2026-11-02T03:00:00Z");
    await signup("gammel@example.no", old);
    await signup("ny@example.no", new Date("2026-10-20T12:00:00Z"));
    const id = await confirmed("sperret@example.no");
    await unsubscribe(db, await createUnsubscribeToken(id), siteId, new Date("2026-08-01T12:00:00Z"));
    await signup("sperret@example.no", old);
    await confirmed("fast@example.no");

    expect((await runRetention(db, now)).unconfirmedNewsletter).toBe(1);
    expect(await statusOf("gammel@example.no")).toBeUndefined();
    expect((await statusOf("ny@example.no")).status).toBe("venter");
    expect((await statusOf("sperret@example.no")).status).toBe("avmeldt");
    expect((await statusOf("fast@example.no")).status).toBe("bekreftet");
    expect(await expireUnconfirmed(db, now)).toBe(0);
  });
});
