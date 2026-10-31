/**
 * Nøkkelen bakgrunnsjobben sender til appen. Avledet fra SESSION_SECRET med HMAC,
 * så det trengs ingen ny hemmelighet, og selve hemmeligheten sendes aldri.
 * Brukes både av custom-worker.ts og av ruten, så filen har ingen andre avhengigheter.
 */
export async function cronKey(secret: string, job = "domener"): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`cron:${job}`));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sammenligner uten å avsløre hvor mange tegn som stemte, via tiden det tar. */
export function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
