import { getSecret } from "@/lib/secret";

/**
 * Kryptering av butikkenes API-nøkkel til Fiken. Samme mønster som Vipps- og Klarna-nøklene (lib/payments/crypto.ts):
 * AES-GCM med en nøkkel avledet fra SESSION_SECRET med HKDF, men med egen etikett, så nøkkelen aldri er den samme som
 * for betalingsnøklene eller tofaktor. Byttes SESSION_SECRET, må butikkene koble til Fiken på nytt.
 *
 * Nettstedet bindes til chifferteksten som tilleggsdata. En kryptert nøkkel kan derfor ikke flyttes til en annen
 * butikk og fortsatt virke.
 */

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const context = (siteId: string) => new TextEncoder().encode(`nettgata-fiken:${siteId}`);

let derived: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  derived ??= (async () => {
    const base = await crypto.subtle.importKey("raw", new Uint8Array(getSecret()), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("nettgata-fiken"),
        info: new TextEncoder().encode("fiken-api-nokkel-v1"),
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return derived;
}

export async function encryptFikenToken(token: string, siteId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context(siteId) }, await key(), new TextEncoder().encode(token));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptFikenToken(stored: string, siteId: string): Promise<string> {
  const [version, iv, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Ukjent format på Fiken-nøkkelen");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv), additionalData: context(siteId) }, await key(), fromBase64(ciphertext));
  return new TextDecoder().decode(plain);
}
