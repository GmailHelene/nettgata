/**
 * Bransje og tema som den besøkende valgte på nettgata.no før registrering. Lagres i nettleseren (samme domene som
 * studioet), så veiviseren for nytt nettsted kan starte med valget ferdig fylt inn, også etter at e-posten er bekreftet.
 * Lagres bare når den besøkende selv trykker på en startknapp, og inneholder ingen personopplysninger.
 */
const KEY = "nettgata-startvalg";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type StartValg = { pack?: string; theme?: string };

export function saveStartValg(valg: StartValg) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...valg, at: Date.now() }));
  } catch {
    // Blokkert lagring: veiviseren starter da bare blankt.
  }
}

/** Leser og sletter valget, så det brukes én gang. Valg eldre enn en uke ignoreres. */
export function takeStartValg(): StartValg | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StartValg & { at?: number };
    if (typeof data.at !== "number" || Date.now() - data.at > MAX_AGE_MS) return null;
    return {
      pack: typeof data.pack === "string" ? data.pack : undefined,
      theme: typeof data.theme === "string" ? data.theme : undefined,
    };
  } catch {
    return null;
  }
}
