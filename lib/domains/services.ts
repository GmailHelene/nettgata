import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { domains } from "@/db/schema";
import { normalizeHost } from "@/lib/hosts";
import type { CertificateAuthority } from "./caa";

/** Status for et kundedomene hos Cloudflare for SaaS (custom hostname). */
export type HostnameState = {
  id: string;
  /** pending, active, active_redeploying, moved, deleted eller blocked. */
  status: string;
  /** active når sertifikatet er utstedt og ute på nettet. */
  sslStatus: string;
  errors: string[];
  /** Utstederen Cloudflare bruker for sertifikatet, når den er kjent. */
  ca?: string;
};

export interface DomainProvider {
  readonly name: "cloudflare" | "simulert";
  /** `ca`: utstederen kundens CAA-poster tillater (lib/domains/caa.ts). */
  create(hostname: string, ca?: CertificateAuthority): Promise<HostnameState>;
  /** null når oppføringen ikke finnes lenger. */
  get(id: string): Promise<HostnameState | null>;
  /** Starter valideringen på nytt, for eksempel etter status «moved» eller med en annen utsteder. */
  refresh(id: string, ca?: CertificateAuthority): Promise<HostnameState>;
  remove(id: string): Promise<void>;
}

export const DNS_TYPE = { A: 1, NS: 2, CNAME: 5, AAAA: 28, CAA: 257 } as const;
export type DnsAnswer = { type: number; data: string };

export interface DnsResolver {
  lookup(name: string, type: keyof typeof DNS_TYPE): Promise<{ nxdomain: boolean; answers: DnsAnswer[] }>;
}

export type DomainServices = {
  provider: DomainProvider;
  resolver: DnsResolver;
  /** Kundene peker til <token>.<target>, for eksempel k7f3x9q2m4ab.kunder.plattform.no. */
  target: string;
  simulated: boolean;
};

// ---------- Cloudflare for SaaS ----------

const API = "https://api.cloudflare.com/client/v4";

type CfHostname = {
  id: string;
  status?: string;
  verification_errors?: string[];
  ssl?: { status?: string; certificate_authority?: string; validation_errors?: { message: string }[] };
};

function toState(r: CfHostname): HostnameState {
  return {
    id: r.id,
    status: r.status ?? "pending",
    sslStatus: r.ssl?.status ?? "",
    errors: [...(r.verification_errors ?? []), ...(r.ssl?.validation_errors ?? []).map((e) => e.message)],
    ca: r.ssl?.certificate_authority,
  };
}

export function cloudflareProvider(apiToken: string, zoneId: string): DomainProvider {
  async function call<T>(path: string, init: RequestInit = {}): Promise<{ status: number; result: T | null }> {
    const res = await fetch(`${API}/zones/${zoneId}/custom_hostnames${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; errors?: { code: number; message: string }[]; result?: T } | null;
    if (res.status === 404) return { status: 404, result: null };
    if (!res.ok || !body?.success) {
      const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${res.status}`;
      throw new Error(`Cloudflare svarte med feil (${detail})`);
    }
    return { status: res.status, result: body.result ?? null };
  }
  // HTTP-validering: Cloudflare leverer sertifikatbeviset selv når kunden peker til oss, og fornyer automatisk.
  // Utstederen velges ut fra kundens CAA-poster, ellers står sertifikatet fast hvis CAA bare tillater én.
  const ssl = (ca?: CertificateAuthority) => ({ method: "http", type: "dv", settings: { min_tls_version: "1.2" }, ...(ca && { certificate_authority: ca }) });

  return {
    name: "cloudflare",
    async create(hostname, ca) {
      try {
        const { result } = await call<CfHostname>("", { method: "POST", body: JSON.stringify({ hostname, ssl: ssl(ca) }) });
        return toState(result!);
      } catch (err) {
        // Finnes oppføringen fra før (for eksempel etter et avbrutt forsøk), gjenbrukes den.
        const { result } = await call<CfHostname[]>(`?hostname=${encodeURIComponent(hostname)}`);
        const existing = result?.find((r) => r.id);
        if (existing) return toState(existing);
        throw err;
      }
    },
    async get(id) {
      const { result } = await call<CfHostname>(`/${encodeURIComponent(id)}`);
      return result ? toState(result) : null;
    },
    async refresh(id, ca) {
      const { result } = await call<CfHostname>(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ssl: ssl(ca) }) });
      return toState(result!);
    },
    async remove(id) {
      await call(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}

/** DNS over HTTPS hos Cloudflare (1.1.1.1). Viser det resten av verden ser, ikke det som ligger i en lokal mellomlagring. */
export const dohResolver: DnsResolver = {
  async lookup(name, type) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) throw new Error(`DNS-oppslaget feilet (HTTP ${res.status})`);
    const body = (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
    return {
      nxdomain: body.Status === 3,
      answers: (body.Answer ?? []).map((a) => ({ type: a.type, data: a.data.replace(/\.$/, "").toLowerCase() })),
    };
  },
};

// ---------- Simulert, bare i utvikling ----------

type SimulatedState = { status: string; sslStatus: string; checks: number; hostname: string };
const simulated = ((globalThis as { __simulerteDomener?: Map<string, SimulatedState> }).__simulerteDomener ??= new Map());
const lookups = ((globalThis as { __simulerteOppslag?: Map<string, number> }).__simulerteOppslag ??= new Map());
const SIMULATED_IP = "203.0.113.10";

/**
 * Lokalt finnes verken Cloudflare-konto eller ekte DNS. Her går domenet gjennom de samme stegene
 * som i virkeligheten: først mangler DNS, så venter sertifikatet, så er det aktivt.
 * Domener som begynner med «ledig» oppfører seg som om de ikke er kjøpt ennå.
 */
function simulatedServices(db: Db, target: string): DomainServices {
  const step = (s: SimulatedState) => {
    s.checks++;
    if (s.checks >= 2) s.status = "active";
    if (s.checks >= 3) s.sslStatus = "active";
    else if (s.checks >= 2) s.sslStatus = "pending_validation";
  };
  return {
    simulated: true,
    target,
    provider: {
      name: "simulert",
      async create(hostname) {
        const id = `sim-${crypto.randomUUID()}`;
        simulated.set(id, { status: "pending", sslStatus: "initializing", checks: 0, hostname });
        return { id, status: "pending", sslStatus: "initializing", errors: [] };
      },
      async get(id) {
        const s = simulated.get(id);
        if (!s) return null;
        step(s);
        return { id, status: s.status, sslStatus: s.sslStatus, errors: [] };
      },
      async refresh(id) {
        const s = simulated.get(id) ?? { status: "pending", sslStatus: "initializing", checks: 0, hostname: "" };
        simulated.set(id, s);
        return { id, status: s.status, sslStatus: s.sslStatus, errors: [] };
      },
      async remove(id) {
        simulated.delete(id);
      },
    },
    resolver: {
      async lookup(name, type) {
        if (name.split(".")[0].startsWith("ledig")) return { nxdomain: true, answers: [] };
        if (type === "NS") return { nxdomain: false, answers: [{ type: DNS_TYPE.NS, data: "ns1.simulert.test" }] };
        if (name.endsWith(`.${target}`)) return { nxdomain: false, answers: [{ type: DNS_TYPE.A, data: SIMULATED_IP }] };
        // Første oppslag: kunden har ikke lagt inn pekeren ennå. Deretter peker den riktig.
        const seen = (lookups.get(`${name}:${type}`) ?? 0) + 1;
        lookups.set(`${name}:${type}`, seen);
        if (seen < 2) return { nxdomain: false, answers: [] };
        const [row] = await db.select({ token: domains.token, kind: domains.kind }).from(domains).where(eq(domains.hostname, name)).limit(1);
        if (!row?.token) return { nxdomain: false, answers: [] };
        if (type === "CNAME" && row.kind !== "apex") return { nxdomain: false, answers: [{ type: DNS_TYPE.CNAME, data: `${row.token}.${target}` }] };
        if (type === "A" && row.kind === "apex") return { nxdomain: false, answers: [{ type: DNS_TYPE.A, data: SIMULATED_IP }] };
        return { nxdomain: false, answers: [] };
      },
    },
  };
}

// ---------- Oppsett ----------

const required = ["CF_API_TOKEN", "CF_ZONE_ID", "CUSTOM_DOMAIN_TARGET"] as const;

/** Hva som mangler for å slå på ekte domenekobling. Vises bare for plattformens administrator. */
export function missingDomainConfig(): string[] {
  return required.filter((key) => !process.env[key]?.trim());
}

/**
 * Cloudflare når alt er satt opp. I utvikling uten oppsett: en simulert utgave, så hele flyten kan prøves.
 * I produksjon uten oppsett: null, og studioet sier at kobling av eget domene kommer snart.
 */
export function getDomainServices(db: Db): DomainServices | null {
  const apiToken = process.env.CF_API_TOKEN?.trim();
  const zoneId = process.env.CF_ZONE_ID?.trim();
  const target = normalizeHost(process.env.CUSTOM_DOMAIN_TARGET);
  if (apiToken && zoneId && target) return { provider: cloudflareProvider(apiToken, zoneId), resolver: dohResolver, target, simulated: false };
  if (process.env.NODE_ENV !== "production") return simulatedServices(db, target || "kunder.plattform.test");
  return null;
}
