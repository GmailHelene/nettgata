import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLog, domains } from "@/db/schema";
import { normalizeHost } from "@/lib/hosts";
import { DomainError, displayHost, parseDomainInput, type DomainKind } from "./parse";
import { DNS_TYPE, type DnsResolver, type DomainServices, type HostnameState } from "./services";

export { DomainError, displayHost };

const HOUR = 3_600_000;
/** Et ubekreftet domene holdes av for nettstedet som la det til, så lenge. Etterpå kan et annet nettsted ta det. */
export const PENDING_RESERVATION_HOURS = 48;
/** Ubekreftede domener slettes etter så mange dager, så de ikke teller i Cloudflare-kvoten for alltid. */
export const PENDING_GIVE_UP_DAYS = 14;
/** Et aktivt domene som slutter å peke hit, får være aktivt så lenge før det kobles fra. */
export const ACTIVE_GRACE_HOURS = 72;
export const MAX_ROOTS_PER_SITE = 3;

export type DomainRow = typeof domains.$inferSelect;

export function rootOf(row: Pick<DomainRow, "hostname" | "kind">): string {
  return row.kind === "www" ? row.hostname.slice(4) : row.hostname;
}

export function cnameTarget(token: string, target: string): string {
  return `${token}.${target}`;
}

/** Vertsnavn som tilhører plattformen selv og aldri kan kobles til et kundenettsted. */
export function blockedHosts(target: string): string[] {
  const list = (value: string | undefined) => (value ?? "").split(",").map(normalizeHost).filter(Boolean);
  return [...list(process.env.PLATFORM_HOSTS), ...list(process.env.SITES_ROOT_DOMAIN), target, "workers.dev", "localhost"];
}

function randomToken(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % alphabet.length]).join("");
}

// ---------- Legg til ----------

/**
 * Kobler et domene til nettstedet: lagrer det som ventende og melder det inn hos Cloudflare.
 * Selve aktiveringen skjer først når DNS peker til domenets egen peker (se checkSiteDomains).
 */
export async function addDomain(db: Db, services: DomainServices, siteId: string, input: string, userId: string, now = new Date()) {
  const parsed = parseDomainInput(input, blockedHosts(services.target));
  const shown = displayHost(parsed.root);

  if (parsed.entries.some((e) => e.kind === "apex")) {
    const ns = await services.resolver.lookup(parsed.root, "NS");
    if (ns.nxdomain) {
      throw new DomainError(`${shown} ser ut til å være ledig. Kjøp domenet først, i ditt eget eller bedriftens navn, og kom tilbake hit.`);
    }
  }

  const own = await db.select().from(domains).where(eq(domains.siteId, siteId));
  const roots = new Set(own.map(rootOf));
  if (roots.has(parsed.root)) throw new DomainError(`${shown} er allerede lagt til`);
  if (roots.size >= MAX_ROOTS_PER_SITE) throw new DomainError(`Et nettsted kan ha opptil ${MAX_ROOTS_PER_SITE} domener. Fjern ett før du legger til et nytt.`);

  const hostnames = parsed.entries.map((e) => e.hostname);
  const taken = await db.select().from(domains).where(inArray(domains.hostname, hostnames));
  for (const row of taken) {
    if (row.status === "active") {
      throw new DomainError(`${displayHost(row.hostname)} er allerede i bruk på et annet nettsted. Er domenet ditt, ta kontakt med oss.`);
    }
    if (now.getTime() - row.createdAt.getTime() < PENDING_RESERVATION_HOURS * HOUR) {
      throw new DomainError(`${displayHost(row.hostname)} ble nettopp lagt til på et annet nettsted. Er domenet ditt, ta kontakt med oss.`);
    }
  }

  const token = randomToken();
  // Gamle, ubekreftede krav fra andre nettsteder tas over. Det er trygt fordi domenet bare aktiveres
  // når DNS peker til den nye pekeren, og Cloudflare-oppføringen kan gjenbrukes.
  for (const row of taken) {
    await db
      .update(domains)
      .set({ siteId, token, isPrimary: false, status: "pending", verifiedAt: null, checkedAt: null, lastError: null, failingSince: null, createdAt: now })
      .where(eq(domains.id, row.id));
  }

  const fresh = parsed.entries.filter((e) => !taken.some((t) => t.hostname === e.hostname));
  let inserted: DomainRow[] = [];
  if (fresh.length) {
    try {
      inserted = await db
        .insert(domains)
        .values(fresh.map((e) => ({ siteId, hostname: e.hostname, kind: e.kind, token, createdAt: now })))
        .returning();
    } catch {
      throw new DomainError(`${shown} ble lagt til på et annet nettsted akkurat nå. Prøv igjen om litt.`);
    }
  }

  const created: string[] = [];
  try {
    for (const row of inserted) {
      const state = await services.provider.create(row.hostname);
      created.push(state.id);
      await db.update(domains).set({ cfHostnameId: state.id }).where(eq(domains.id, row.id));
    }
  } catch (err) {
    for (const id of created) await services.provider.remove(id).catch(() => undefined);
    if (inserted.length) await db.delete(domains).where(inArray(domains.id, inserted.map((r) => r.id)));
    console.error("Domenekobling feilet", err);
    throw new DomainError("Vi fikk ikke meldt inn domenet hos Cloudflare. Prøv igjen om litt.");
  }

  await db.insert(auditLog).values({ siteId, userId, action: "domain.added", detail: { root: parsed.root, reclaimed: taken.length } });
  return parsed.root;
}

// ---------- Sjekk ----------

export type HostStep = "dns" | "verification" | "certificate" | "waiting-for-www" | "active" | "blocked";

type Diagnosis = { ok: boolean; message: string | null };

/**
 * Sjekker at DNS peker til domenets egen peker. For www og underdomener må CNAME stemme nøyaktig.
 * Hoveddomenet viser bare IP-adresser (ANAME), så der sammenlignes adressene med pekerens.
 */
async function diagnose(resolver: DnsResolver, row: DomainRow, expected: string, targetIps: () => Promise<string[]>): Promise<Diagnosis> {
  const host = displayHost(row.hostname);
  if (row.kind === "apex") {
    const ips = (await resolver.lookup(row.hostname, "A")).answers.filter((a) => a.type === DNS_TYPE.A).map((a) => a.data);
    if (ips.length === 0) return { ok: false, message: `${host} peker ikke noe sted ennå. Legg inn ANAME eller ALIAS til ${expected}, eller videresend til www.` };
    const wanted = await targetIps();
    if (ips.some((ip) => wanted.includes(ip))) return { ok: true, message: null };
    return {
      ok: false,
      message: `${host} peker fortsatt til en annen server (${ips.join(", ")}). Bruker du videresending til www, trykk «Jeg bruker videresending».`,
    };
  }
  const cname = (await resolver.lookup(row.hostname, "CNAME")).answers.find((a) => a.type === DNS_TYPE.CNAME)?.data;
  if (cname === expected) return { ok: true, message: null };
  if (cname) return { ok: false, message: `${host} peker til ${cname}, men skal peke til ${expected}.` };
  const hasA = (await resolver.lookup(row.hostname, "A")).answers.some((a) => a.type === DNS_TYPE.A);
  if (hasA) {
    return {
      ok: false,
      message: `${host} har en A-post. Slett den og legg inn en CNAME til ${expected}. Ligger domenet hos Cloudflare, sett pekeren til «DNS only» (grå sky).`,
    };
  }
  return { ok: false, message: `Fant ingen peker for ${host} ennå. Legg inn en CNAME til ${expected}.` };
}

function stepFor(dns: Diagnosis, state: HostnameState, wwwReady: boolean): { step: HostStep; message: string | null } {
  if (state.status === "blocked") return { step: "blocked", message: "Cloudflare har sperret dette domenet. Ta kontakt med oss." };
  if (!dns.ok) return { step: "dns", message: dns.message };
  if (!state.status.startsWith("active")) return { step: "verification", message: "DNS er riktig. Venter på at Cloudflare bekrefter domenet." };
  if (state.sslStatus !== "active") {
    return { step: "certificate", message: "DNS er riktig. Sikkerhetssertifikatet (https) lages nå. Det tar vanligvis noen minutter." };
  }
  if (!wwwReady) return { step: "waiting-for-www", message: "Kobles til så snart www er klar." };
  return { step: "active", message: null };
}

async function ensurePrimary(db: Db, siteId: string) {
  const rows = await db.select().from(domains).where(eq(domains.siteId, siteId));
  if (rows.some((r) => r.isPrimary && r.status === "active")) return;
  const candidate = rows.find((r) => r.status === "active" && r.kind !== "apex");
  await db.update(domains).set({ isPrimary: false }).where(eq(domains.siteId, siteId));
  if (candidate) await db.update(domains).set({ isPrimary: true }).where(eq(domains.id, candidate.id));
}

/** Sjekker alle vertsnavn for ett domene (www og hoveddomenet) og aktiverer eller kobler fra etter reglene. */
async function checkRoot(db: Db, services: DomainServices, rows: DomainRow[], now: Date) {
  const token = rows.find((r) => r.token)?.token;
  if (!token) return;
  const expected = cnameTarget(token, services.target);
  let ips: string[] | null = null;
  const targetIps = async () =>
    (ips ??= (await services.resolver.lookup(expected, "A")).answers.filter((a) => a.type === DNS_TYPE.A).map((a) => a.data));

  // www og underdomener først, så hoveddomenet kan se om www ble aktivt i samme runde.
  const ordered = [...rows].sort((a, b) => Number(a.kind === "apex") - Number(b.kind === "apex"));
  for (const row of ordered) {
    let state: HostnameState | null = row.cfHostnameId ? await services.provider.get(row.cfHostnameId) : null;
    if (!state) state = await services.provider.create(row.hostname);
    else if (state.status === "moved" || state.status === "deleted") state = await services.provider.refresh(state.id);

    const dns = await diagnose(services.resolver, row, expected, targetIps);
    const wwwReady = row.kind !== "apex" || rows.some((r) => r.kind === "www" && r.status === "active");
    const { step, message } = stepFor(dns, state, wwwReady);
    const update: Partial<DomainRow> = { cfHostnameId: state.id, checkedAt: now, lastError: message };

    if (step === "active") {
      Object.assign(update, { status: "active", verifiedAt: row.verifiedAt ?? now, failingSince: null });
    } else if (row.status === "active") {
      const since = row.failingSince ?? now;
      if (now.getTime() - since.getTime() >= ACTIVE_GRACE_HOURS * HOUR) {
        Object.assign(update, { status: "pending", isPrimary: false, failingSince: null });
      } else {
        update.failingSince = since;
      }
    }
    await db.update(domains).set(update).where(eq(domains.id, row.id));
    Object.assign(row, update);
  }
  await ensurePrimary(db, rows[0].siteId);
}

function groupByRoot(rows: DomainRow[]): DomainRow[][] {
  const groups = new Map<string, DomainRow[]>();
  for (const row of rows) {
    const key = `${row.siteId}|${rootOf(row)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

/** Sjekker alle domenene til ett nettsted nå, for eksempel når kunden trykker «Sjekk nå». */
export async function checkSiteDomains(db: Db, services: DomainServices, siteId: string, now = new Date()) {
  const rows = await db.select().from(domains).where(eq(domains.siteId, siteId));
  for (const group of groupByRoot(rows)) await checkRoot(db, services, group, now);
}

/**
 * Jobben som går i bakgrunnen hvert tiende minutt: sjekker ventende domener ofte og aktive én gang i døgnet,
 * og gir opp ventende domener etter 14 dager, så de ikke blir liggende hos Cloudflare.
 */
export async function sweepDomains(db: Db, services: DomainServices, now = new Date(), limit = 50) {
  const expired = await db
    .select()
    .from(domains)
    .where(and(eq(domains.status, "pending"), lt(domains.createdAt, new Date(now.getTime() - PENDING_GIVE_UP_DAYS * 24 * HOUR))));
  for (const row of expired) {
    if (row.cfHostnameId) await services.provider.remove(row.cfHostnameId).catch((err) => console.error("Kunne ikke fjerne", row.hostname, err));
    await db.delete(domains).where(eq(domains.id, row.id));
  }

  const due = await db
    .select()
    .from(domains)
    .where(
      or(
        and(eq(domains.status, "pending"), or(isNull(domains.checkedAt), lt(domains.checkedAt, new Date(now.getTime() - 9 * 60_000)))),
        and(eq(domains.status, "active"), or(isNull(domains.checkedAt), lt(domains.checkedAt, new Date(now.getTime() - 23 * HOUR)))),
      ),
    )
    .limit(limit);
  // Hele domenet sjekkes samlet, så www og hoveddomenet aldri vurderes hver for seg.
  const siteRoots = new Set(due.map((r) => `${r.siteId}|${rootOf(r)}`));
  const all = siteRoots.size ? await db.select().from(domains).where(inArray(domains.siteId, [...new Set(due.map((r) => r.siteId))])) : [];
  let checked = 0;
  for (const group of groupByRoot(all.filter((r) => siteRoots.has(`${r.siteId}|${rootOf(r)}`)))) {
    try {
      await checkRoot(db, services, group, now);
      checked++;
    } catch (err) {
      console.error("Domenesjekk feilet", rootOf(group[0]), err);
    }
  }
  return { removed: expired.length, checked };
}

// ---------- Endre og fjerne ----------

async function ownRow(db: Db, siteId: string, domainId: string) {
  if (!/^[0-9a-f-]{36}$/.test(domainId)) throw new DomainError("Fant ikke domenet");
  const [row] = await db.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.siteId, siteId))).limit(1);
  if (!row) throw new DomainError("Fant ikke domenet");
  return row;
}

/** Fjerner et domene med www og hoveddomene, hos oss og hos Cloudflare. */
export async function removeDomain(db: Db, services: DomainServices, siteId: string, domainId: string, userId: string) {
  const row = await ownRow(db, siteId, domainId);
  const root = rootOf(row);
  const group = (await db.select().from(domains).where(eq(domains.siteId, siteId))).filter((r) => rootOf(r) === root);
  for (const r of group) {
    if (r.cfHostnameId) await services.provider.remove(r.cfHostnameId).catch((err) => console.error("Kunne ikke fjerne", r.hostname, err));
  }
  await db.delete(domains).where(inArray(domains.id, group.map((r) => r.id)));
  await ensurePrimary(db, siteId);
  await db.insert(auditLog).values({ siteId, userId, action: "domain.removed", detail: { root } });
}

/** Kunden bruker videresending fra hoveddomenet til www hos forhandleren, så hoveddomenet trengs ikke hos oss. */
export async function dropApex(db: Db, services: DomainServices, siteId: string, domainId: string) {
  const row = await ownRow(db, siteId, domainId);
  if (row.kind !== "apex") throw new DomainError("Bare hoveddomenet kan fjernes alene");
  if (row.cfHostnameId) await services.provider.remove(row.cfHostnameId).catch((err) => console.error("Kunne ikke fjerne", row.hostname, err));
  await db.delete(domains).where(eq(domains.id, row.id));
}

export async function setPrimaryDomain(db: Db, siteId: string, domainId: string) {
  const row = await ownRow(db, siteId, domainId);
  if (row.status !== "active" || row.kind === "apex") throw new DomainError("Bare et aktivt www-domene eller underdomene kan være hovedadresse");
  await db.update(domains).set({ isPrimary: false }).where(eq(domains.siteId, siteId));
  await db.update(domains).set({ isPrimary: true }).where(eq(domains.id, row.id));
}

// ---------- Til studioet ----------

export type DomainView = {
  root: string;
  rootLabel: string;
  target: string;
  status: "active" | "pending" | "problem";
  hosts: {
    id: string;
    hostname: string;
    label: string;
    kind: DomainKind;
    active: boolean;
    primary: boolean;
    message: string | null;
    checkedAt: string | null;
    failing: boolean;
  }[];
};

/** Domenene til et nettsted, gruppert per domene, klare for skjermbildet. */
export function domainViews(rows: DomainRow[], target: string): DomainView[] {
  return groupByRoot(rows)
    .map((group) => {
      const token = group.find((r) => r.token)?.token ?? "";
      const sorted = [...group].sort((a, b) => Number(a.kind === "apex") - Number(b.kind === "apex"));
      const main = sorted[0];
      const status: DomainView["status"] = group.some((r) => r.failingSince)
        ? "problem"
        : main.status === "active"
          ? "active"
          : "pending";
      return {
        root: rootOf(main),
        rootLabel: displayHost(rootOf(main)),
        target: cnameTarget(token, target),
        status,
        hosts: sorted.map((r) => ({
          id: r.id,
          hostname: r.hostname,
          label: displayHost(r.hostname),
          kind: r.kind,
          active: r.status === "active",
          primary: r.isPrimary,
          message: r.lastError,
          checkedAt: r.checkedAt?.toISOString() ?? null,
          failing: r.failingSince !== null,
        })),
      };
    })
    .sort((a, b) => a.root.localeCompare(b.root));
}
