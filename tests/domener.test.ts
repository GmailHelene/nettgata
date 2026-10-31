import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createPgliteDb } from "@/db/pglite";
import { demoTheme } from "@/db/demo";
import { domains, organizations, sites, users } from "@/db/schema";
import { cronKey, sameKey } from "@/lib/cron";
import { addDomain, checkSiteDomains, dropApex, removeDomain, setPrimaryDomain, sweepDomains } from "@/lib/domains";
import { displayHost, parseDomainInput } from "@/lib/domains/parse";
import { DNS_TYPE, type DnsResolver, type DomainProvider, type DomainServices, type HostnameState } from "@/lib/domains/services";
import { resolveHost } from "@/lib/hosts";

const TARGET = "kunder.plattform.test";
const HOUR = 3_600_000;

describe("lese domenet kunden skriver", () => {
  it("rydder adresse, www og store bokstaver, og gir www og hoveddomenet", () => {
    for (const input of ["firma.no", "https://www.Firma.no/om-oss?x=1", "FIRMA.NO.", "www.firma.no:443"]) {
      expect(parseDomainInput(input)).toEqual({
        root: "firma.no",
        entries: [
          { hostname: "www.firma.no", kind: "www" },
          { hostname: "firma.no", kind: "apex" },
        ],
      });
    }
    expect(parseDomainInput("butikk.firma.no").entries).toEqual([{ hostname: "butikk.firma.no", kind: "sub" }]);
  });

  it("lagrer æøå som punycode og viser dem riktig igjen", () => {
    const parsed = parseDomainInput("Blåbær.no");
    expect(parsed.root).toBe("xn--blbr-roah.no");
    expect(displayHost(parsed.entries[0].hostname)).toBe("www.blåbær.no");
  });

  it("avviser e-post, IP-adresser, tull og plattformens egne domener", () => {
    expect(() => parseDomainInput("post@firma.no")).toThrow(/e-postadresse/);
    expect(() => parseDomainInput("192.168.1.10")).toThrow(/gyldig domene/);
    expect(() => parseDomainInput("firma")).toThrow(/gyldig domene/);
    expect(() => parseDomainInput("-firma.no")).toThrow(/gyldig domene/);
    expect(() => parseDomainInput("")).toThrow(/Skriv inn/);
    expect(() => parseDomainInput("plattform.test", [TARGET])).toThrow(/hører til plattformen/);
    expect(() => parseDomainInput("abc.kunder.plattform.test", [TARGET])).toThrow(/hører til plattformen/);
    expect(() => parseDomainInput("noe.workers.dev", ["workers.dev"])).toThrow(/hører til plattformen/);
  });
});

describe("nøkkel for bakgrunnsjobben", () => {
  it("er lik for samme hemmelighet og ulik for andre", async () => {
    const a = await cronKey("x".repeat(40));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sameKey(a, await cronKey("x".repeat(40)))).toBe(true);
    expect(sameKey(a, await cronKey("y".repeat(40)))).toBe(false);
    expect(sameKey(a, a.slice(1))).toBe(false);
  });
});

/** Cloudflare og DNS som testen styrer selv. */
function fakeServices() {
  const hostnames = new Map<string, HostnameState & { hostname: string }>();
  const cnames = new Map<string, string>();
  const aRecords = new Map<string, string[]>();
  const unregistered = new Set<string>();
  const calls: string[] = [];
  let next = 1;
  const provider: DomainProvider = {
    name: "cloudflare",
    async create(hostname) {
      calls.push(`create ${hostname}`);
      const state = { id: `cf-${next++}`, status: "pending", sslStatus: "initializing", errors: [], hostname };
      hostnames.set(state.id, state);
      return state;
    },
    async get(id) {
      return hostnames.get(id) ?? null;
    },
    async refresh(id) {
      calls.push(`refresh ${id}`);
      const s = hostnames.get(id)!;
      s.status = "pending";
      return s;
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      hostnames.delete(id);
    },
  };
  const resolver: DnsResolver = {
    async lookup(name, type) {
      if (unregistered.has(name)) return { nxdomain: true, answers: [] };
      if (type === "CNAME") return { nxdomain: false, answers: cnames.has(name) ? [{ type: DNS_TYPE.CNAME, data: cnames.get(name)! }] : [] };
      if (type === "A") return { nxdomain: false, answers: (aRecords.get(name) ?? []).map((data) => ({ type: DNS_TYPE.A, data })) };
      return { nxdomain: false, answers: [{ type: DNS_TYPE.NS, data: "ns1.domeneshop.no" }] };
    },
  };
  const services: DomainServices = { provider, resolver, target: TARGET, simulated: false };
  /** Cloudflare har bekreftet vertsnavnet og utstedt sertifikat. */
  const cloudflareReady = (hostname: string) => {
    for (const s of hostnames.values()) if (s.hostname === hostname) Object.assign(s, { status: "active", sslStatus: "active" });
  };
  return { services, cnames, aRecords, unregistered, calls, hostnames, cloudflareReady };
}

describe("koble til domene", () => {
  let db: Db;
  let siteA: string;
  let siteB: string;
  let userId: string;
  let fake: ReturnType<typeof fakeServices>;

  beforeEach(async () => {
    db = await createPgliteDb();
    const [user] = await db.insert(users).values({ email: "a@b.no", passwordHash: "x" }).returning();
    const [org] = await db.insert(organizations).values({ name: "Org" }).returning();
    const [a] = await db.insert(sites).values({ orgId: org.id, name: "A", slug: "a", industryPack: "handverker", theme: demoTheme }).returning();
    const [b] = await db.insert(sites).values({ orgId: org.id, name: "B", slug: "b", industryPack: "handverker", theme: demoTheme }).returning();
    siteA = a.id;
    siteB = b.id;
    userId = user.id;
    fake = fakeServices();
  });

  const rows = (siteId: string) => db.select().from(domains).where(eq(domains.siteId, siteId)).orderBy(domains.hostname);
  /** Kunden legger inn pekerne hos forhandleren slik studioet ber om. */
  const pointDns = async (siteId: string, root: string) => {
    const [row] = (await rows(siteId)).filter((r) => r.hostname === `www.${root}`);
    const target = `${row.token}.${TARGET}`;
    fake.cnames.set(`www.${root}`, target);
    fake.aRecords.set(target, ["104.16.0.1", "104.16.0.2"]);
    fake.aRecords.set(root, ["104.16.0.2"]);
  };

  it("lager www og hoveddomenet med samme unike peker, og melder begge inn", async () => {
    await addDomain(db, fake.services, siteA, "Firma.no", userId);
    const [apex, www] = await rows(siteA);
    expect([apex.hostname, www.hostname]).toEqual(["firma.no", "www.firma.no"]);
    expect(www.token).toMatch(/^[a-z2-9]{12}$/);
    expect(apex.token).toBe(www.token);
    expect([apex.status, www.status]).toEqual(["pending", "pending"]);
    expect(fake.calls).toEqual(["create www.firma.no", "create firma.no"]);
  });

  it("sier fra når domenet ikke er kjøpt ennå", async () => {
    fake.unregistered.add("ledigfirma.no");
    await expect(addDomain(db, fake.services, siteA, "ledigfirma.no", userId)).rejects.toThrow(/ser ut til å være ledig/);
    expect(await rows(siteA)).toEqual([]);
  });

  it("aktiverer bare når DNS peker til nettstedets egen peker, og www blir hovedadresse", async () => {
    await addDomain(db, fake.services, siteA, "firma.no", userId);
    await checkSiteDomains(db, fake.services, siteA);
    let [apex, www] = await rows(siteA);
    expect(www.status).toBe("pending");
    expect(www.lastError).toMatch(/Fant ingen peker for www.firma.no/);

    // Cloudflare er klar, men DNS peker til en annens peker: skal ikke aktiveres.
    fake.cloudflareReady("www.firma.no");
    fake.cloudflareReady("firma.no");
    fake.cnames.set("www.firma.no", `feilpeker.${TARGET}`);
    await checkSiteDomains(db, fake.services, siteA);
    [apex, www] = await rows(siteA);
    expect(www.status).toBe("pending");
    expect(www.lastError).toMatch(/peker til feilpeker/);

    await pointDns(siteA, "firma.no");
    await checkSiteDomains(db, fake.services, siteA);
    [apex, www] = await rows(siteA);
    expect([www.status, www.isPrimary, apex.status, apex.isPrimary]).toEqual(["active", true, "active", false]);
    expect(www.verifiedAt).not.toBeNull();

    expect(await resolveHost(db, "www.firma.no")).toMatchObject({ redirectHost: null });
    expect(await resolveHost(db, "firma.no")).toMatchObject({ redirectHost: "www.firma.no" });
    // Gratisadressen sender videre til hovedadressen.
    const before = process.env.SITES_ROOT_DOMAIN;
    process.env.SITES_ROOT_DOMAIN = "plattform.test";
    try {
      expect(await resolveHost(db, "a.plattform.test")).toMatchObject({ redirectHost: "www.firma.no" });
    } finally {
      process.env.SITES_ROOT_DOMAIN = before;
    }
  });

  it("venter på sertifikatet før domenet tas i bruk", async () => {
    await addDomain(db, fake.services, siteA, "firma.no", userId);
    await pointDns(siteA, "firma.no");
    await checkSiteDomains(db, fake.services, siteA);
    const [, www] = await rows(siteA);
    expect(www.status).toBe("pending");
    expect(www.lastError).toMatch(/Venter på at Cloudflare bekrefter/);
  });

  it("hoveddomenet aktiveres aldri før www, og kan fjernes når kunden bruker videresending", async () => {
    await addDomain(db, fake.services, siteA, "firma.no", userId);
    fake.cloudflareReady("firma.no");
    const [apexRow] = await rows(siteA);
    fake.aRecords.set(`${apexRow.token}.${TARGET}`, ["104.16.0.1"]);
    fake.aRecords.set("firma.no", ["104.16.0.1"]);
    await checkSiteDomains(db, fake.services, siteA);
    let [apex] = await rows(siteA);
    expect(apex.status).toBe("pending");
    expect(apex.lastError).toMatch(/så snart www er klar/);

    await dropApex(db, fake.services, siteA, apex.id);
    [apex] = await rows(siteA);
    expect(apex.hostname).toBe("www.firma.no");
    expect(fake.calls).toContain("remove cf-2");
  });

  it("et annet nettsted kan ikke ta et aktivt domene, men overtar ubekreftede krav etter 48 timer", async () => {
    await addDomain(db, fake.services, siteA, "firma.no", userId);
    await expect(addDomain(db, fake.services, siteB, "www.firma.no", userId)).rejects.toThrow(/nettopp lagt til på et annet nettsted/);

    const old = new Date(Date.now() - 49 * HOUR);
    await db.update(domains).set({ createdAt: old }).where(eq(domains.siteId, siteA));
    const tokenA = (await rows(siteA))[0].token;
    await addDomain(db, fake.services, siteB, "firma.no", userId);
    const taken = await rows(siteB);
    expect(taken.map((r) => r.hostname)).toEqual(["firma.no", "www.firma.no"]);
    expect(taken[0].token).not.toBe(tokenA);
    expect(fake.calls.filter((c) => c.startsWith("create"))).toHaveLength(2);

    // Den gamle pekeren til nettsted A gir ikke lenger tilgang.
    fake.cloudflareReady("www.firma.no");
    fake.cnames.set("www.firma.no", `${tokenA}.${TARGET}`);
    await checkSiteDomains(db, fake.services, siteB);
    expect((await rows(siteB))[1].status).toBe("pending");

    await pointDns(siteB, "firma.no");
    await checkSiteDomains(db, fake.services, siteB);
    expect((await rows(siteB))[1].status).toBe("active");
    await expect(addDomain(db, fake.services, siteA, "firma.no", userId)).rejects.toThrow(/allerede i bruk/);
  });

  it("et aktivt domene som slutter å peke hit, kobles fra etter 72 timer, ikke ved første feil", async () => {
    await addDomain(db, fake.services, siteA, "firma.no", userId);
    await dropApex(db, fake.services, siteA, (await rows(siteA))[0].id);
    fake.cloudflareReady("www.firma.no");
    await pointDns(siteA, "firma.no");
    await checkSiteDomains(db, fake.services, siteA);
    expect((await rows(siteA))[0].status).toBe("active");

    fake.cnames.delete("www.firma.no");
    const now = new Date();
    await checkSiteDomains(db, fake.services, siteA, now);
    let [www] = await rows(siteA);
    expect([www.status, www.isPrimary]).toEqual(["active", true]);
    expect(www.failingSince).not.toBeNull();

    await checkSiteDomains(db, fake.services, siteA, new Date(now.getTime() + 73 * HOUR));
    [www] = await rows(siteA);
    expect([www.status, www.isPrimary, www.failingSince]).toEqual(["pending", false, null]);
    expect(await resolveHost(db, "www.firma.no")).toBeNull();
  });

  it("bakgrunnsjobben gir opp etter 14 dager og fjerner domenet hos Cloudflare", async () => {
    await addDomain(db, fake.services, siteA, "firma.no", userId);
    await addDomain(db, fake.services, siteA, "butikk.annet.no", userId);
    await db.update(domains).set({ createdAt: new Date(Date.now() - 15 * 24 * HOUR) }).where(eq(domains.hostname, "butikk.annet.no"));
    const result = await sweepDomains(db, fake.services);
    expect(result).toEqual({ removed: 1, checked: 1 });
    expect((await rows(siteA)).map((r) => r.hostname)).toEqual(["firma.no", "www.firma.no"]);
    expect(fake.calls).toContain("remove cf-3");
  });

  it("flytter hovedadressen og velger en ny når hovedadressen fjernes", async () => {
    for (const root of ["firma.no", "annet.no"]) {
      await addDomain(db, fake.services, siteA, root, userId);
      fake.cloudflareReady(`www.${root}`);
      fake.cloudflareReady(root);
      await pointDns(siteA, root);
    }
    await checkSiteDomains(db, fake.services, siteA);
    const all = await rows(siteA);
    const primary = all.find((r) => r.isPrimary)!;
    const other = all.find((r) => r.kind === "www" && !r.isPrimary)!;
    expect(await resolveHost(db, other.hostname)).toMatchObject({ redirectHost: primary.hostname });

    await setPrimaryDomain(db, siteA, other.id);
    expect(await resolveHost(db, primary.hostname)).toMatchObject({ redirectHost: other.hostname });

    await removeDomain(db, fake.services, siteA, other.id, userId);
    const left = await rows(siteA);
    expect(left.map((r) => r.hostname)).not.toContain(other.hostname);
    expect(left.find((r) => r.isPrimary)?.hostname).toBe(primary.hostname);
    await expect(setPrimaryDomain(db, siteA, left.find((r) => r.kind === "apex")!.id)).rejects.toThrow(/Bare et aktivt www-domene/);
  });

  it("begrenser antall domener og stopper duplikater på samme nettsted", async () => {
    await addDomain(db, fake.services, siteA, "en.no", userId);
    await expect(addDomain(db, fake.services, siteA, "www.en.no", userId)).rejects.toThrow(/allerede lagt til/);
    await addDomain(db, fake.services, siteA, "to.no", userId);
    await addDomain(db, fake.services, siteA, "tre.no", userId);
    await expect(addDomain(db, fake.services, siteA, "fire.no", userId)).rejects.toThrow(/opptil 3 domener/);
  });

  it("rydder opp hvis Cloudflare feiler midt i", async () => {
    let created = 0;
    const flaky: DomainServices = {
      ...fake.services,
      provider: {
        ...fake.services.provider,
        async create(hostname) {
          if (++created === 2) throw new Error("nede");
          return fake.services.provider.create(hostname);
        },
      },
    };
    await expect(addDomain(db, flaky, siteA, "firma.no", userId)).rejects.toThrow(/fikk ikke meldt inn domenet/);
    expect(await rows(siteA)).toEqual([]);
    expect(fake.calls).toContain("remove cf-1");
  });
});
