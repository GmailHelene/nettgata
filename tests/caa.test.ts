import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedAuthority, parseCaa } from "@/lib/domains/caa";
import { cloudflareProvider, type DnsResolver } from "@/lib/domains/services";

/** DNS der bare navnene i `caa` har CAA-poster. Et CNAME gir ingen CAA-svar, akkurat som hos 1.1.1.1. */
const resolver = (caa: Record<string, string[]>): DnsResolver => ({
  async lookup(name, type) {
    if (type !== "CAA") return { nxdomain: false, answers: [] };
    return { nxdomain: false, answers: (caa[name] ?? []).map((data) => ({ type: 257, data })) };
  },
});

describe("utsteder ut fra CAA", () => {
  it("leser CAA-poster slik DNS over HTTPS gir dem", () => {
    expect(parseCaa('0 issue "letsencrypt.org"')).toEqual({ tag: "issue", value: "letsencrypt.org" });
    expect(parseCaa('128 issuewild "pki.goog; cansignhttpexchanges=yes"')).toEqual({ tag: "issuewild", value: "pki.goog; cansignhttpexchanges=yes" });
  });

  it("arver fra foreldredomenet, som helene.cloud hos Domeneshop", async () => {
    const dns = resolver({ "helene.cloud": ['0 issue "letsencrypt.org"'] });
    expect(await allowedAuthority(dns, "test.helene.cloud")).toBe("lets_encrypt");
  });

  it("velger en annen tillatt utsteder, og gir null når ingen av våre er tillatt", async () => {
    expect(await allowedAuthority(resolver({ "kunde.no": ['0 issue "pki.goog"'] }), "www.kunde.no")).toBe("google");
    expect(await allowedAuthority(resolver({ "kunde.no": ['0 issue "digicert.com"'] }), "kunde.no")).toBeNull();
    expect(await allowedAuthority(resolver({ "kunde.no": ['0 issue ";"'] }), "kunde.no")).toBeNull();
    expect(await allowedAuthority(resolver({}), "kunde.no")).toBe("lets_encrypt");
    expect(await allowedAuthority(resolver({ "kunde.no": ['0 iodef "mailto:it@kunde.no"'] }), "kunde.no")).toBe("lets_encrypt");
  });
});

describe("Cloudflare for SaaS", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ber om sertifikat fra utstederen CAA tillater", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true, result: { id: "h1", status: "pending", ssl: { status: "pending_validation", certificate_authority: "lets_encrypt" } } }));
    vi.stubGlobal("fetch", fetchMock);
    const state = await cloudflareProvider("token", "zone").create("test.helene.cloud", "lets_encrypt");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.ssl).toMatchObject({ method: "http", type: "dv", certificate_authority: "lets_encrypt" });
    expect(state.ca).toBe("lets_encrypt");
  });
});
