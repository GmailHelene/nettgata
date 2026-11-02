import { getSecret } from "@/lib/secret";

/**
 * IndexNow: forteller Bing, Yandex og andre søkemotorer at en side er ny eller endret, så den hentes med en gang.
 * Google bruker det ikke (der hjelper sitemap og Search Console). Nøkkelen lages av plattformens hemmelighet og
 * vertsnavnet, så hvert domene har sin egen uten at noe lagres, og den ligger på https://<domene>/<nøkkel>.txt.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** 32 heksadesimale tegn, samme for samme domene hver gang. */
export async function indexNowKey(host: string, secret: Uint8Array = getSecret()): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`indexnow:${host.toLowerCase()}`));
  return [...new Uint8Array(mac)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sender de publiserte adressene til IndexNow. Bare for ekte adresser med https (eget domene eller gratisadressen),
 * aldri for visningen via plattformen eller lokal utvikling. Feil ignoreres: det er en bonus, ikke noe som kan stoppe publisering.
 */
export async function pingIndexNow(
  siteUrl: string,
  paths: string[],
  options: { fetch?: typeof fetch; secret?: Uint8Array } = {},
): Promise<boolean> {
  try {
    const base = new URL(siteUrl);
    if (base.protocol !== "https:" || base.pathname !== "/" || !paths.length) return false;
    const key = await indexNowKey(base.host, options.secret);
    const urlList = [...new Set(paths)].slice(0, 1000).map((p) => new URL(p, base).toString());
    const res = await (options.fetch ?? fetch)(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: base.host, key, keyLocation: `${base.origin}/${key}.txt`, urlList }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
