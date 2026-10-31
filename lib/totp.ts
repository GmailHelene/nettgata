import { getSecret } from "@/lib/secret";

/**
 * Engangskoder etter RFC 6238 (TOTP): HMAC-SHA1, 30 sekunder, 6 siffer. Det er det Google Authenticator,
 * Microsoft Authenticator og 1Password forventer. Bare Web Crypto, så det virker i Cloudflare Workers.
 */
export const TOTP_PERIOD = 30;
const DIGITS = 6;
const ISSUER = "Nettgata";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Ugyldig base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toHex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

/** Sammenligner uten å avsløre hvor langt like strengene var, via tiden det tar. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_PERIOD);

/** HOTP (RFC 4226) for ett tidssteg. */
export async function totpCode(secret: Uint8Array, step: number, digits = DIGITS): Promise<string> {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const key = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Godtar koden for nå og ett steg før eller etter, fordi klokken på telefonen kan gå litt feil.
 * Steg som er brukt før (lastStep eller eldre), avvises, så en kode som er sett, ikke kan brukes igjen.
 * Returnerer steget koden gjaldt for, eller null.
 */
export async function verifyTotp(secret: Uint8Array, code: string, nowMs: number, lastStep: number | null): Promise<number | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = totpStep(nowMs);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (sameString(await totpCode(secret, step), clean)) return step;
  }
  return null;
}

export function otpauthUri(secretBase32: string, account: string): string {
  const label = encodeURIComponent(`${ISSUER}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${ISSUER}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD}`;
}

export function newTotpSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(20));
}

// Nøklene avledes fra SESSION_SECRET, så de aldri ligger i databasen sammen med det de beskytter.
let derived: Promise<{ encryption: CryptoKey; recovery: CryptoKey }> | null = null;
function keys() {
  derived ??= (async () => {
    const base = await crypto.subtle.importKey("raw", new Uint8Array(getSecret()), "HKDF", false, ["deriveKey"]);
    const salt = new TextEncoder().encode("nettgata-tofaktor");
    const derive = (info: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]) =>
      crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) }, base, algorithm, false, usages);
    return {
      encryption: await derive("totp-hemmelighet-v1", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
      recovery: await derive("reservekoder-v1", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
    };
  })();
  return derived;
}

/** Krypterer hemmeligheten med AES-GCM før den lagres. Formatet har versjon, så nøkkelen kan byttes senere. */
export async function encryptSecret(secret: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, (await keys()).encryption, new Uint8Array(secret)));
  return `v1:${toBase64(iv)}:${toBase64(ciphertext)}`;
}

export async function decryptSecret(stored: string): Promise<Uint8Array> {
  const [version, iv, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Ukjent format på tofaktorhemmeligheten");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, (await keys()).encryption, fromBase64(ciphertext)));
}

// Uten 0/o og 1/l/i, så kodene er lette å skrive av fra papir.
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ti reservekoder på formen «abcde-fghij», rundt 50 bit tilfeldighet hver. Vises bare én gang. */
export function newRecoveryCodes(count = 10): string[] {
  const limit = 256 - (256 % RECOVERY_ALPHABET.length); // forkaster byte over grensen, så alle tegn er like sannsynlige
  return Array.from({ length: count }, () => {
    let chars = "";
    while (chars.length < 10) {
      for (const b of crypto.getRandomValues(new Uint8Array(16))) {
        if (b < limit && chars.length < 10) chars += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
      }
    }
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Reservekoder lagres som HMAC, så en lekket database ikke gir brukbare koder. Store bokstaver og bindestrek spiller ingen rolle. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  return toHex(await crypto.subtle.sign("HMAC", (await keys()).recovery, new TextEncoder().encode(normalized)));
}
