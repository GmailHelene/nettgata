import { getSecret } from "@/lib/secret";

/**
 * Kryptering av butikkenes Vipps- og Klarna-nøkler. Samme mønster som tofaktorhemmelighetene (lib/totp.ts):
 * AES-GCM med en nøkkel avledet fra SESSION_SECRET med HKDF, men med egen etikett, så de to nøklene aldri er like.
 * Byttes SESSION_SECRET, må butikkene legge inn betalingsnøklene på nytt.
 *
 * Konteksten (nettsted, løsning og miljø) bindes til chifferteksten som tilleggsdata. En kryptert nøkkel
 * kan derfor ikke flyttes til en annen butikk eller et annet miljø og fortsatt virke.
 */

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

let derived: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  derived ??= (async () => {
    const base = await crypto.subtle.importKey("raw", new Uint8Array(getSecret()), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode("nettgata-betaling"),
        info: new TextEncoder().encode("betalingsnokler-v1"),
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return derived;
}

export async function encryptPaymentSecret(plain: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    await key(),
    new TextEncoder().encode(plain),
  );
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptPaymentSecret(stored: string, context: string): Promise<string> {
  const [version, iv, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Ukjent format på betalingsnøklene");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv), additionalData: new TextEncoder().encode(context) },
    await key(),
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(plain);
}
