let cached: Uint8Array | null = null;

/** Felles hemmelighet for økter og forhåndsvisningslenker. Stopper oppstart hvis den er for svak. */
export function getSecret(): Uint8Array {
  if (cached) return cached;
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET mangler eller er kortere enn 32 tegn");
  }
  cached = new TextEncoder().encode(secret);
  return cached;
}
