import type { Db } from "@/db";
import { hit } from "@/lib/rate-limit";
import { getSecret } from "@/lib/secret";

/**
 * OAuth2 mot Fiken (authorization code). Kilde: https://api.fiken.no/api/v2/docs/, avsnittet «Authorization with OAuth2»,
 * og https://fiken.no/.well-known/oauth-authorization-server, lest 2. november 2026.
 *
 * - Eieren sendes til https://fiken.no/oauth/authorize med response_type=code, client_id, redirect_uri og state.
 *   Vi sender også PKCE (code_challenge med S256). Fiken anbefaler det for apper med hemmelighet også.
 * - Koden byttes på https://fiken.no/oauth/token med Basic-innlogging (client id og client secret).
 *   Svaret har access_token, refresh_token og expires_in (rundt et døgn i eksempelet til Fiken).
 * - Fornyelse: grant_type=refresh_token. Svaret kan ha en ny refresh_token, som da erstatter den gamle.
 * - Tilbaketrekking: POST https://fiken.no/oauth/revoke med tilgangsnøkkelen som Bearer.
 * - Fiken har ingen scopes for API-et (scopes: {} i spesifikasjonen), så vi ber ikke om noen.
 *
 * Ingen nøkler logges. Feilmeldinger fra Fiken vises aldri ordrett, fordi de kan inneholde koden.
 */

export const FIKEN_AUTHORIZE_URL = "https://fiken.no/oauth/authorize";
export const FIKEN_TOKEN_URL = "https://fiken.no/oauth/token";
export const FIKEN_REVOKE_URL = "https://fiken.no/oauth/revoke";
export const FIKEN_CALLBACK_PATH = "/studio/fiken/callback";
/** Registrert hos Fiken som redirect URL. Studioet ligger på plattformens hovedadresse. */
export const FIKEN_REDIRECT_URI = `https://nettgata.no${FIKEN_CALLBACK_PATH}`;
const TIMEOUT_MS = 15_000;
/** Så lenge eieren har på seg i Fiken før lenken går ut. */
export const STATE_TTL_MS = 10 * 60_000;
/** Tilgangsnøkkelen fornyes så lenge før den går ut, så en sending aldri starter med en nøkkel som dør underveis. */
export const REFRESH_MARGIN_MS = 5 * 60_000;

export type FikenOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Null til Helene har registrert appen i Fiken og lagt inn FIKEN_CLIENT_ID og FIKEN_CLIENT_SECRET. */
export function fikenOAuthConfig(): FikenOAuthConfig | null {
  const clientId = process.env.FIKEN_CLIENT_ID?.trim();
  const clientSecret = process.env.FIKEN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  // Adressen må være nøyaktig den som er registrert hos Fiken. FIKEN_REDIRECT_URI er bare for lokal testing.
  const redirectUri = process.env.FIKEN_REDIRECT_URI?.trim() || FIKEN_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

/**
 * Fiken for butikkene åpnes når appen er registrert hos Fiken (begge variablene satt). Til da er koblingen bare
 * synlig for plattformadmin, og kundene ser «Fiken kommer snart». Både studiosiden og handlingene sjekker dette.
 */
export function fikenAvailableTo(user: { isPlatformAdmin: boolean }): boolean {
  return user.isPlatformAdmin || fikenOAuthConfig() !== null;
}

// ---------- state: signert, kortlevd, bundet til nettsted og bruker, og bare til én bruk ----------

const enc = (text: string) => new TextEncoder().encode(text);
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

let hmacKey: Promise<CryptoKey> | null = null;
/** Egen nøkkel avledet fra SESSION_SECRET, så en signatur her aldri gjelder som økt eller lenke andre steder. */
function stateKey(): Promise<CryptoKey> {
  hmacKey ??= (async () => {
    const base = await crypto.subtle.importKey("raw", new Uint8Array(getSecret()), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: enc("nettgata-fiken-oauth"), info: enc("fiken-oauth-state-v1") },
      base,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign", "verify"],
    );
  })();
  return hmacKey;
}

export type FikenStatePayload = { siteId: string; userId: string; nonce: string; expiresAt: number };

export async function createFikenState(siteId: string, userId: string, now = Date.now()): Promise<string> {
  const payload: FikenStatePayload = { siteId, userId, nonce: b64url(crypto.getRandomValues(new Uint8Array(18))), expiresAt: now + STATE_TTL_MS };
  const body = b64url(enc(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await stateKey(), enc(body)));
  return `${body}.${b64url(sig)}`;
}

/** Null hvis signaturen er feil, formatet er ukjent eller lenken er gått ut. Sjekker ikke om den er brukt (consumeFikenState). */
export async function verifyFikenState(state: string, now = Date.now()): Promise<FikenStatePayload | null> {
  if (typeof state !== "string" || state.length > 600) return null;
  const [body, sig, extra] = state.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    // crypto.subtle.verify sammenligner i konstant tid.
    if (!(await crypto.subtle.verify("HMAC", await stateKey(), fromB64url(sig), enc(body)))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Partial<FikenStatePayload>;
    if (typeof p.siteId !== "string" || typeof p.userId !== "string" || typeof p.nonce !== "string" || typeof p.expiresAt !== "number") return null;
    if (p.expiresAt < now || p.expiresAt > now + STATE_TTL_MS) return null;
    return { siteId: p.siteId, userId: p.userId, nonce: p.nonce, expiresAt: p.expiresAt };
  } catch {
    return null;
  }
}

/** Én bruk: første gang svarer true, deretter false. Fiken godtar dessuten hver kode bare én gang. */
export async function consumeFikenState(db: Db, payload: FikenStatePayload): Promise<boolean> {
  return hit(db, `fiken-oauth-state:${payload.nonce}`, { limit: 1, windowSeconds: Math.ceil((STATE_TTL_MS * 2) / 1000) });
}

/**
 * PKCE-verdien avledes fra state med den hemmelige nøkkelen, så den aldri må lagres. Den som bare ser state
 * (for eksempel i adressefeltet), kan ikke regne den ut.
 */
async function pkceVerifier(nonce: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await stateKey(), enc(`pkce:${nonce}`))));
}

async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc(verifier))));
}

/** Adressen eieren sendes til i Fiken. */
export async function fikenAuthorizeUrl(config: FikenOAuthConfig, state: string): Promise<string> {
  const payload = await verifyFikenState(state);
  if (!payload) throw new Error("Ugyldig state");
  const url = new URL(FIKEN_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(await pkceVerifier(payload.nonce)));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ---------- tokenendepunktet ----------

export type FikenTokens = { accessToken: string; refreshToken: string; expiresAt: number };

/**
 * revoked: Fiken sier nei til koden eller fornyelsesnøkkelen (invalid_grant og lignende). Da må eieren koble til på nytt.
 * Ellers er feilen trolig forbigående (nettverk, feil hos Fiken), og ingenting skal kobles fra.
 */
export class FikenAuthError extends Error {
  constructor(
    message: string,
    readonly revoked: boolean,
  ) {
    super(message);
    this.name = "FikenAuthError";
  }
}

async function tokenRequest(config: FikenOAuthConfig, form: Record<string, string>, now: number): Promise<FikenTokens> {
  let res: Response;
  try {
    res = await fetch(FIKEN_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(form).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new FikenAuthError("Fikk ikke kontakt med Fiken. Prøv igjen om litt.", false);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (res.ok && typeof body.access_token === "string" && body.access_token) {
    const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
    // Fiken sender ny refresh_token bare noen ganger. Kommer den ikke, gjelder den gamle fortsatt.
    const refreshToken = typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : form.refresh_token;
    if (!refreshToken) throw new FikenAuthError("Fiken sendte ingen fornyelsesnøkkel. Prøv å koble til på nytt.", true);
    return { accessToken: body.access_token, refreshToken, expiresAt: now + expiresIn * 1000 };
  }
  if (res.status >= 500 || res.status === 429) throw new FikenAuthError("Fiken svarte med en feil. Prøv igjen om litt.", false);
  // 400 og 401 fra tokenendepunktet: koden eller fornyelsesnøkkelen er ugyldig, utløpt eller trukket tilbake.
  throw new FikenAuthError("Fiken godtok ikke tilgangen lenger. Koble til Fiken på nytt.", true);
}

export async function exchangeFikenCode(config: FikenOAuthConfig, code: string, state: FikenStatePayload, rawState: string, now = Date.now()): Promise<FikenTokens> {
  return tokenRequest(
    config,
    { grant_type: "authorization_code", code, redirect_uri: config.redirectUri, state: rawState, code_verifier: await pkceVerifier(state.nonce) },
    now,
  );
}

export async function refreshFikenTokens(config: FikenOAuthConfig, refreshToken: string, now = Date.now()): Promise<FikenTokens> {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken }, now);
}

/** Trekker tilbake tilgangen hos Fiken. Gjør sitt beste: feiler det, slettes nøklene hos oss likevel. */
export async function revokeFikenToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(FIKEN_REVOKE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
