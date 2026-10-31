/** Kontrollsiffer for organisasjonsnummer (modulus 11, vekter 3 2 7 6 5 4 3 2). */
export function isValidOrgnr(orgnr: string): boolean {
  if (!/^\d{9}$/.test(orgnr)) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(orgnr[i]), 0);
  const rest = sum % 11;
  const control = rest === 0 ? 0 : 11 - rest;
  return control !== 10 && control === Number(orgnr[8]);
}

export type BrregCompany = {
  orgnr: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  industryCode: string;
  industry: string;
};

type BrregAddress = { adresse?: string[]; postnummer?: string; poststed?: string };

/** Gjør «RØRLEGGER HANSEN AS» om til «Rørlegger Hansen AS». */
export function tidyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(As|Asa|Sa|Da|Ans|Enk|Nuf|Ba)\b/g, (m) => m.toUpperCase())
    // Småord midt i navnet skrives med liten forbokstav: «Registerenheten i Brønnøysund».
    .replace(/(?<=\s)(I|Og|På|For|Av|Til|Med)(?=\s)/g, (m) => m.toLowerCase());
}

/**
 * Slår opp en enhet i Enhetsregisteret (åpne data, ingen nøkkel).
 * Returnerer null hvis den ikke finnes, er slettet eller registeret ikke svarer.
 */
export async function lookupOrgnr(orgnr: string, fetcher: typeof fetch = fetch): Promise<BrregCompany | null> {
  const clean = orgnr.replace(/\s/g, "");
  if (!isValidOrgnr(clean)) return null;
  try {
    const res = await fetcher(`https://data.brreg.no/enhetsregisteret/api/enheter/${clean}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      navn?: string;
      slettedato?: string;
      forretningsadresse?: BrregAddress;
      postadresse?: BrregAddress;
      naeringskode1?: { kode?: string; beskrivelse?: string };
    };
    if (!data.navn || data.slettedato) return null;
    const address = data.forretningsadresse ?? data.postadresse ?? {};
    return {
      orgnr: clean,
      name: tidyName(data.navn),
      street: (address.adresse ?? []).filter(Boolean).join(", "),
      postalCode: address.postnummer ?? "",
      city: address.poststed ? tidyName(address.poststed) : "",
      industryCode: data.naeringskode1?.kode ?? "",
      industry: data.naeringskode1?.beskrivelse ?? "",
    };
  } catch {
    return null;
  }
}
