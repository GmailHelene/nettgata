import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Innlogging i studioet: informasjonskapslene ligger i et kart, så serverhandlingene kan kjøres som en vanlig kunde.
const jar = vi.hoisted(() => new Map<string, string>());
const ip = vi.hoisted(() => ({ value: "203.0.113.7" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (opts: string | { name: string }) => void jar.delete(typeof opts === "string" ? opts : opts.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": ip.value, host: "localhost:3000" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  unstable_rethrow: (err: unknown) => {
    if (err instanceof Error && err.message.startsWith("redirect:")) throw err;
  },
}));

import {
  confirmEmailAction,
  registerAction,
  requestResetAction,
  resendVerificationAction,
  resetPasswordAction,
} from "@/app/studio/registrer/actions";
import { createSiteAction } from "@/app/studio/site-actions";
import { setDbForTests, type Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { auditLog, emailLog, media, memberships, organizations, sites, users } from "@/db/schema";
import { weeklyAiActive } from "@/lib/ai/access";
import type { EmailMessage, EmailProvider } from "@/lib/email/send";
import { TEKSTVERSJON } from "@/lib/legal/felles";
import { MediaError, saveFile } from "@/lib/media";
import { assertCanPublish } from "@/lib/publishing";
import { PUBLISH_NEEDS_SUBSCRIPTION } from "@/lib/billing/state";
import { runRetention } from "@/lib/retention";
import { touchSite } from "@/lib/selvbetjening/aktivitet";
import { assertStorageRoom, MAX_UNPAID_SITES, UNPAID_STORAGE_BYTES } from "@/lib/selvbetjening/grenser";
import { confirmEmail, registerAccount, requestPasswordReset, resetPassword, type AccountDeps } from "@/lib/selvbetjening/konto";
import { cleanupInactiveSites, deleteSite } from "@/lib/selvbetjening/opprydding";
import { verifyTurnstile } from "@/lib/selvbetjening/turnstile";
import { createSession, getCurrentUser } from "@/lib/session";
import { createSiteFromPack } from "@/lib/sites";
import type { MediaStore } from "@/lib/storage";

let db: Db;
let sent: EmailMessage[];
const provider: EmailProvider = {
  name: "brevo",
  async send(message) {
    sent.push(message);
    return { id: "test" };
  },
};
const deps = (now?: Date): AccountDeps => ({ db, provider, baseUrl: "https://nettgata.no", now });
const DAY = 86_400_000;

/** Lenken i siste e-post, til siden bak lenken. */
function lastLink(path: string): string {
  const match = sent.at(-1)!.text.match(new RegExp(`https://nettgata\\.no${path}/(\\S+)`));
  if (!match) throw new Error(`Fant ingen lenke til ${path}`);
  return match[1];
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const signup = { name: "Kari Nordmann", email: "kari@ullstua.no", password: "et-langt-passord", terms: "ja" };

function memoryStore(): MediaStore & { keys: Map<string, Uint8Array> } {
  const keys = new Map<string, Uint8Array>();
  return {
    keys,
    async put(key, data) {
      keys.set(key, data);
    },
    async get(key) {
      const body = keys.get(key);
      return body ? { body, contentType: "application/octet-stream", size: body.byteLength } : null;
    },
    async delete(key) {
      keys.delete(key);
    },
    async list(prefix) {
      return [...keys.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
  };
}

async function verifiedUser(email = "ola@snekker.no") {
  const [user] = await db
    .insert(users)
    .values({ email, name: "Ola", passwordHash: await bcrypt.hash("et-langt-passord", 4), emailVerifiedAt: new Date() })
    .returning();
  return user;
}

beforeEach(async () => {
  db = await createPgliteDb();
  setDbForTests(db);
  sent = [];
  jar.clear();
  ip.value = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("registrering", () => {
  it("lager en ubekreftet konto, lagrer versjonen av vilkårene og sender bekreftelsen", async () => {
    await registerAccount(deps(), { ...signup, email: " Kari@Ullstua.no ", acceptedTerms: true });
    const [user] = await db.select().from(users);
    expect(user.email).toBe("kari@ullstua.no");
    expect(user.emailVerifiedAt).toBeNull();
    expect(await bcrypt.compare(signup.password, user.passwordHash)).toBe(true);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "account.registered"));
    expect(entry.detail).toEqual({ vilkar: TEKSTVERSJON, databehandleravtale: TEKSTVERSJON });
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Bekreft e-posten din hos Nettgata");
    expect(sent[0].text).toContain("https://nettgata.no/studio/bekreft/");
    // E-post om kontoen hører ikke til et nettsted.
    const [log] = await db.select().from(emailLog);
    expect(log).toMatchObject({ siteId: null, kind: "konto-bekreft", recipient: "kari@ullstua.no" });
  });

  it("krever vilkår, navn og passord på minst 12 tegn, og peker på feltet", async () => {
    await expect(registerAccount(deps(), { ...signup, acceptedTerms: false })).rejects.toMatchObject({ field: "terms" });
    await expect(registerAccount(deps(), { ...signup, password: "kort", acceptedTerms: true })).rejects.toMatchObject({ field: "password" });
    await expect(registerAccount(deps(), { ...signup, name: " ", acceptedTerms: true })).rejects.toMatchObject({ field: "name" });
    await expect(registerAccount(deps(), { ...signup, email: "ikke-epost", acceptedTerms: true })).rejects.toMatchObject({ field: "email" });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("svarer det samme når adressen finnes, og sender «du har allerede en konto» i stedet", async () => {
    const existing = await verifiedUser("kari@ullstua.no");
    const first = await registerAction(null, form(signup));
    ip.value = "198.51.100.9";
    const fresh = await registerAction(null, form({ ...signup, email: "ny@ullstua.no" }));
    expect(first).toEqual({ ...fresh, email: "kari@ullstua.no" });
    expect(first?.ok).toBe(true);

    const [unchanged] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(unchanged.passwordHash).toBe(existing.passwordHash);
    const logs = await db.select().from(emailLog);
    expect(logs.map((l) => [l.kind, l.recipient]).sort()).toEqual([
      ["konto-bekreft", "ny@ullstua.no"],
      ["konto-finnes", "kari@ullstua.no"],
    ]);
  });

  it("lar honningkrukka svare som vanlig uten å lagre noe", async () => {
    const state = await registerAction(null, form({ ...signup, nettsted: "https://spam.example" }));
    expect(state?.ok).toBe(true);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("stopper mange registreringer fra samme IP og samme adresse", async () => {
    for (let i = 0; i < 5; i++) expect((await registerAction(null, form({ ...signup, email: `kunde${i}@test.no` })))?.ok).toBe(true);
    expect((await registerAction(null, form({ ...signup, email: "kunde9@test.no" })))?.message).toMatch(/For mange forsøk/);

    for (let i = 0; i < 3; i++) {
      ip.value = `198.51.100.${i + 1}`;
      await registerAction(null, form(signup));
    }
    ip.value = "198.51.100.50";
    expect((await registerAction(null, form(signup)))?.message).toMatch(/For mange forsøk/);
  });
});

describe("bekreftelse av e-post", () => {
  it("bekrefter én gang, logger inn, sender velkomst-e-post og avviser samme lenke etterpå", async () => {
    await registerAccount(deps(), { ...signup, acceptedTerms: true });
    const token = lastLink("/studio/bekreft");
    await expect(confirmEmailAction(token)).rejects.toThrow("redirect:/studio/nytt?velkommen=1");
    const user = await getCurrentUser();
    expect(user).toMatchObject({ email: "kari@ullstua.no", emailVerified: true });

    const welcome = await db.select().from(emailLog).where(eq(emailLog.kind, "konto-velkommen"));
    expect(welcome).toHaveLength(1);
    expect((await confirmEmailAction(token))?.ok).toBe(false);
  });

  it("velkomst-e-posten har tre steg og lenke til hjelpen", async () => {
    await registerAccount(deps(), { ...signup, acceptedTerms: true });
    await confirmEmail(deps(), lastLink("/studio/bekreft"));
    const welcome = sent.at(-1)!;
    expect(welcome.subject).toBe("Velkommen til Nettgata");
    expect(welcome.text).toMatch(/1\. .*\n[\s\S]*2\. [\s\S]*3\. /);
    expect(welcome.text).toContain("https://nettgata.no/studio/hjelp");
    expect(welcome.html + welcome.text).not.toMatch(/[–—]| - /);
  });

  it("lenken går ut etter 48 timer", async () => {
    const start = new Date("2026-11-02T10:00:00Z");
    await registerAccount(deps(start), { ...signup, acceptedTerms: true });
    const token = lastLink("/studio/bekreft");
    await expect(confirmEmail(deps(new Date(start.getTime() + 49 * 3_600_000)), token)).rejects.toThrow(/virker ikke lenger/);
    await confirmEmail(deps(new Date(start.getTime() + 47 * 3_600_000)), token);
    const [user] = await db.select().from(users);
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("sender lenken på nytt høyst tre ganger i timen per adresse, og svarer likt for ukjente adresser", async () => {
    await registerAccount(deps(), { ...signup, acceptedTerms: true });
    const unknown = await resendVerificationAction(null, form({ email: "finnes-ikke@test.no" }));
    for (let i = 0; i < 3; i++) {
      ip.value = `192.0.2.${i + 1}`;
      const state = await resendVerificationAction(null, form({ email: signup.email }));
      expect(state?.message).toBe(unknown?.message);
    }
    ip.value = "192.0.2.99";
    expect((await resendVerificationAction(null, form({ email: signup.email })))?.message).toMatch(/For mange forsøk/);
    expect(await db.select().from(emailLog).where(eq(emailLog.kind, "konto-bekreft"))).toHaveLength(4);
  });
});

describe("Turnstile", () => {
  it("hoppes over uten nøkler, og sjekkes hos Cloudflare når de er satt", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyTurnstile("", null)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("TURNSTILE_SITE_KEY", "test-nettstednokkel");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-hemmelig");
    fetchMock.mockResolvedValueOnce(Response.json({ success: true }));
    expect(await verifyTurnstile("svar-fra-skjemaet", "203.0.113.7")).toBe(true);
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(fetchMock.mock.calls[0][0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(body.get("response")).toBe("svar-fra-skjemaet");
    expect(body.get("remoteip")).toBe("203.0.113.7");

    fetchMock.mockResolvedValueOnce(Response.json({ success: false }));
    expect(await verifyTurnstile("feil", null)).toBe(false);
    expect(await verifyTurnstile("", null)).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("nede"));
    expect(await verifyTurnstile("svar", null)).toBe(false);
  });

  it("stopper registreringen når utfordringen ikke er løst", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "test-nettstednokkel");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-hemmelig");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false })));
    const state = await registerAction(null, form(signup));
    expect(state?.ok).toBe(false);
    expect(state?.message).toMatch(/menneske/);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("veiviseren for kunder", () => {
  const siteForm = (name: string) => form({ name, pack: "frisor", theme: "", palette: "", orgnr: "", street: "", postalCode: "", city: "" });

  it("lar en bekreftet kunde lage nettsteder selv, opptil grensen for ubetalte", async () => {
    const user = await verifiedUser();
    await createSession(user.id);
    for (let i = 1; i <= MAX_UNPAID_SITES; i++) await expect(createSiteAction(null, siteForm(`Salong ${i}`))).rejects.toThrow(/redirect:\/studio\/nettsted\//);
    const own = await db.select().from(sites);
    expect(own.every((s) => s.selfServe)).toBe(true);
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    expect(membership.role).toBe("owner");

    const blocked = await createSiteAction(null, siteForm("Salong 3"));
    expect(blocked).toMatchObject({ ok: false, message: expect.stringMatching(/uten abonnement/) });

    // Et betalt nettsted teller ikke mot grensen.
    await db.update(sites).set({ billing: { status: "active", stripeSubscriptionId: "sub_1" } }).where(eq(sites.id, own[0].id));
    await expect(createSiteAction(null, siteForm("Salong 3"))).rejects.toThrow(/redirect:/);
  });

  it("stenger ute kunder som ikke har bekreftet e-posten", async () => {
    const [user] = await db.insert(users).values({ email: "ny@test.no", passwordHash: "x" }).returning();
    await createSession(user.id);
    expect(await createSiteAction(null, siteForm("Salong"))).toMatchObject({ ok: false, message: expect.stringMatching(/Bekreft e-postadressen/) });
    expect(await db.select().from(sites)).toHaveLength(0);
  });

  it("publisering er fortsatt sperret for ubetalte nettsteder, og den ukentlige AI-rapporten går ikke", async () => {
    const user = await verifiedUser();
    const site = await createSiteFromPack(db, { name: "Salongen", packKey: "frisor", info: demoInfo, ownerId: user.id, selfServe: true });
    await expect(assertCanPublish(db, site.id, { isPlatformAdmin: false })).rejects.toThrow(PUBLISH_NEEDS_SUBSCRIPTION);
    expect(weeklyAiActive(site.billing)).toBe(false);
  });
});

describe("lagringsplass på ubetalte nettsteder", () => {
  it("stopper opplasting over 200 MB, men ikke når nettstedet betaler eller er satt opp av plattformadmin", async () => {
    const user = await verifiedUser();
    const site = await createSiteFromPack(db, { name: "Salongen", packKey: "frisor", info: demoInfo, ownerId: user.id, selfServe: true });
    await db.insert(media).values({ siteId: site.id, key: `${site.id}/stor.webp`, contentType: "image/webp", size: UNPAID_STORAGE_BYTES - 50 });
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, ...new Array(100).fill(0x20)]);
    const store = memoryStore();
    await expect(saveFile(db, store, { siteId: site.id, userId: user.id, bytes: pdf, name: "meny.pdf" })).rejects.toThrow(MediaError);
    await expect(saveFile(db, store, { siteId: site.id, userId: user.id, bytes: pdf, name: "meny.pdf" })).rejects.toThrow(/200 MB/);
    expect(store.keys.size).toBe(0);

    await db.update(sites).set({ billing: { status: "active", stripeSubscriptionId: "sub_1" } }).where(eq(sites.id, site.id));
    await assertStorageRoom(db, site.id, 1000);
    const admins = await createSiteFromPack(db, { name: "Pilot", packKey: "frisor", info: demoInfo, ownerId: user.id });
    await db.insert(media).values({ siteId: admins.id, key: `${admins.id}/stor.webp`, contentType: "image/webp", size: UNPAID_STORAGE_BYTES });
    await assertStorageRoom(db, admins.id, 1000);
  });
});

describe("opprydding", () => {
  const T0 = new Date("2026-01-01T03:00:00Z");
  const at = (days: number) => new Date(T0.getTime() + days * DAY + 3_600_000);

  async function idleSite(opts: { selfServe?: boolean; billing?: Record<string, unknown> } = {}) {
    const user = await verifiedUser(`eier${Math.random()}@test.no`);
    const site = await createSiteFromPack(db, { name: "Salongen", packKey: "frisor", info: demoInfo, ownerId: user.id, selfServe: opts.selfServe ?? true });
    await db
      .update(sites)
      .set({ lastActivityAt: T0, ...(opts.billing && { billing: opts.billing }) })
      .where(eq(sites.id, site.id));
    return site;
  }
  const cleanup = (now: Date, store = memoryStore()) => cleanupInactiveSites({ db, store, provider, baseUrl: "https://nettgata.no", now });

  it("varsler etter 60 dager og sletter 14 dager etter varselet, med filene i lageret", async () => {
    const site = await idleSite();
    const store = memoryStore();
    await store.put(`${site.id}/bilde.webp`, new Uint8Array([1]), "image/webp");
    await store.put(`eksport/${site.id}.json`, new Uint8Array([1]), "application/json");
    await store.put(`eksport/${site.id}/jobb/del-00001.bin`, new Uint8Array([1]), "application/octet-stream");
    await store.put("annet-nettsted/bilde.webp", new Uint8Array([1]), "image/webp");

    expect(await cleanup(at(59), store)).toEqual({ warned: 0, deleted: 0 });
    expect(await cleanup(at(60), store)).toEqual({ warned: 1, deleted: 0 });
    expect(sent.at(-1)!.subject).toMatch(/Salongen blir slettet/);
    expect(sent.at(-1)!.text).toContain(`https://nettgata.no/studio/nettsted/${site.id}/abonnement`);
    // Varselet sendes bare én gang.
    expect(await cleanup(at(61), store)).toEqual({ warned: 0, deleted: 0 });
    expect(await cleanup(at(73), store)).toEqual({ warned: 0, deleted: 0 });
    expect(await cleanup(at(74), store)).toEqual({ warned: 0, deleted: 1 });

    expect(await db.select().from(sites).where(eq(sites.id, site.id))).toHaveLength(0);
    expect(await db.select().from(organizations).where(eq(organizations.id, site.orgId))).toHaveLength(0);
    expect([...store.keys.keys()]).toEqual(["annet-nettsted/bilde.webp"]);
  });

  it("sletter ikke når eieren er innom etter varselet, eller logger inn", async () => {
    const site = await idleSite();
    await cleanup(at(60));
    const [warned] = await db.select().from(sites).where(eq(sites.id, site.id));
    expect(warned.inactivityWarnedAt).not.toBeNull();
    await touchSite(db, warned, at(65));
    expect(await cleanup(at(74))).toEqual({ warned: 0, deleted: 0 });
    expect(await db.select().from(sites).where(eq(sites.id, site.id))).toHaveLength(1);

    // Innlogging (createSession) nullstiller også.
    const other = await idleSite();
    await cleanup(at(60));
    const [owner] = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.orgId, other.orgId));
    await createSession(owner.userId);
    const [touched] = await db.select().from(sites).where(eq(sites.id, other.id));
    expect(touched.inactivityWarnedAt).toBeNull();
  });

  it("rører ikke nettsteder med abonnement eller nettsteder plattformadmin har satt opp", async () => {
    await idleSite({ billing: { status: "active", stripeSubscriptionId: "sub_1" } });
    await idleSite({ billing: { status: "canceled", stripeSubscriptionId: "sub_2" } });
    await idleSite({ billing: { manual: true } });
    await idleSite({ selfServe: false });
    expect(await cleanup(at(60))).toEqual({ warned: 0, deleted: 0 });
    expect(await cleanup(at(200))).toEqual({ warned: 0, deleted: 0 });
    expect(await db.select().from(sites)).toHaveLength(4);
  });

  it("deleteSite beholder organisasjonen når den har flere nettsteder", async () => {
    const user = await verifiedUser();
    const first = await createSiteFromPack(db, { name: "En", packKey: "frisor", info: demoInfo, ownerId: user.id });
    const [second] = await db.insert(sites).values({ ...first, id: undefined, slug: "to", name: "To" }).returning();
    await deleteSite(db, memoryStore(), first.id);
    expect(await db.select().from(organizations).where(eq(organizations.id, second.orgId))).toHaveLength(1);
  });

  it("sletter ubekreftede kontoer etter sju dager, men ikke bekreftede, admin eller brukere med tilgang", async () => {
    const created = new Date("2026-03-01T12:00:00Z");
    const [unverified] = await db.insert(users).values({ email: "glemt@test.no", passwordHash: "x", createdAt: created }).returning();
    await db.insert(users).values({ email: "admin@test.no", passwordHash: "x", isPlatformAdmin: true, createdAt: created });
    await db.insert(users).values({ email: "ok@test.no", passwordHash: "x", emailVerifiedAt: created, createdAt: created });
    const [member] = await db.insert(users).values({ email: "medlem@test.no", passwordHash: "x", createdAt: created }).returning();
    await createSiteFromPack(db, { name: "Medlem", packKey: "frisor", info: demoInfo, ownerId: member.id });

    expect((await runRetention(db, new Date(created.getTime() + 6 * DAY))).unverifiedAccounts).toBe(0);
    expect((await runRetention(db, new Date(created.getTime() + 7 * DAY + 60_000))).unverifiedAccounts).toBe(1);
    const left = (await db.select({ email: users.email }).from(users)).map((u) => u.email).sort();
    expect(left).toEqual(["admin@test.no", "medlem@test.no", "ok@test.no"]);
    expect(await db.select().from(users).where(eq(users.id, unverified.id))).toHaveLength(0);
  });
});

describe("glemt passord", () => {
  it("sender lenke bare til kjente adresser, bytter passordet, logger ut overalt og virker én gang", async () => {
    const user = await verifiedUser("kari@ullstua.no");
    await createSession(user.id);
    expect(await getCurrentUser()).not.toBeNull();

    await requestPasswordReset(deps(), "finnes-ikke@test.no");
    expect(sent).toHaveLength(0);
    await requestPasswordReset(deps(), " Kari@Ullstua.no ");
    expect(sent[0].subject).toBe("Nytt passord til Nettgata");
    const token = lastLink("/studio/nytt-passord");

    await expect(resetPassword(deps(), token, "kort")).rejects.toMatchObject({ field: "password" });
    await resetPassword(deps(), token, "et-helt-nytt-passord");
    const [changed] = await db.select().from(users).where(eq(users.id, user.id));
    expect(await bcrypt.compare("et-helt-nytt-passord", changed.passwordHash)).toBe(true);
    // Den gamle økten virker ikke lenger, og lenken kan ikke brukes igjen.
    expect(await getCurrentUser()).toBeNull();
    await expect(resetPassword(deps(), token, "et-tredje-passord-her")).rejects.toThrow(/virker ikke lenger/);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.userId, user.id), eq(auditLog.action, "account.password_reset")))).toHaveLength(1);
  });

  it("lenken går ut etter én time", async () => {
    await verifiedUser("kari@ullstua.no");
    const start = new Date("2026-11-02T10:00:00Z");
    await requestPasswordReset(deps(start), "kari@ullstua.no");
    const token = lastLink("/studio/nytt-passord");
    await expect(resetPassword(deps(new Date(start.getTime() + 61 * 60_000)), token, "et-helt-nytt-passord")).rejects.toThrow(/virker ikke lenger/);
  });

  it("skjemaene svarer likt for alle adresser, krever like passord og sender til innloggingen", async () => {
    await verifiedUser("kari@ullstua.no");
    const known = await requestResetAction(null, form({ email: "kari@ullstua.no" }));
    const unknown = await requestResetAction(null, form({ email: "ukjent@test.no" }));
    expect(known?.message).toBe(unknown?.message);
    const [log] = await db.select().from(emailLog).where(eq(emailLog.kind, "konto-passord"));
    expect(log.recipient).toBe("kari@ullstua.no");

    // Lenken lages på nytt her, fordi e-posten i handlingen bare logges (ingen Brevo i testene).
    await requestPasswordReset(deps(), "kari@ullstua.no");
    const token = lastLink("/studio/nytt-passord");
    expect(await resetPasswordAction(token, null, form({ password: "et-helt-nytt-passord", confirm: "noe-annet-helt" }))).toMatchObject({ ok: false, field: "password" });
    await expect(resetPasswordAction(token, null, form({ password: "et-helt-nytt-passord", confirm: "et-helt-nytt-passord" }))).rejects.toThrow(
      "redirect:/studio/logg-inn?passord=byttet",
    );
  });
});
