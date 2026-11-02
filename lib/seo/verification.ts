/**
 * «Koble til Google Search Console»: Google gir en meta-tagg som skal stå på forsiden,
 * <meta name="google-site-verification" content="abc123...">. Kunden kan lime inn hele taggen eller bare koden.
 * Vi lagrer bare koden, og bare tegn Google selv bruker, så ingenting annet kan havne i <head>.
 */
const codePattern = /^[A-Za-z0-9_-]{20,100}$/;

/** Koden alene, "" for tomt felt, null når det ikke ligner en kode fra Google. */
export function parseGoogleVerification(input: string): string | null {
  const text = input.trim();
  if (!text) return "";
  if (text.startsWith("<")) {
    if (!/name\s*=\s*["']google-site-verification["']/i.test(text)) return null;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(text)?.[1]?.trim() ?? "";
    return codePattern.test(content) ? content : null;
  }
  return codePattern.test(text) ? text : null;
}
