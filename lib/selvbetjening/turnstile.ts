/**
 * Cloudflare Turnstile på registrering og «Glemt passord». Er TURNSTILE_SITE_KEY og TURNSTILE_SECRET_KEY satt,
 * vises utfordringen i skjemaet og svaret sjekkes på serveren. Mangler de (lokalt og i testene), hoppes den over,
 * og skjemaene er beskyttet av honningkrukka og grensene i lib/rate-limit.ts.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Den offentlige nøkkelen til skjemaet, eller null når Turnstile ikke er satt opp. */
export function turnstileSiteKey(): string | null {
  const site = process.env.TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  return site && secret ? site : null;
}

/** Sjekker svaret fra utfordringen hos Cloudflare. Svarer true når Turnstile ikke er satt opp. */
export async function verifyTurnstile(response: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !process.env.TURNSTILE_SITE_KEY?.trim()) return true;
  if (!response || response.length > 2048) return false;
  const body = new URLSearchParams({ secret, response });
  if (ip && ip !== "ukjent") body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    // Svarer ikke Cloudflare, slipper ingen gjennom. Hemmeligheten står aldri i feilmeldingen.
    console.error("Turnstile svarte ikke", err instanceof Error ? err.name : "ukjent");
    return false;
  }
}
