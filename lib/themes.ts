import type { FontKey, Theme, ThemeStyle } from "@/lib/theme";

/**
 * Temaene kunden velger mellom, som temaene i WordPress: hvert tema er en helhet av fonter, former,
 * knapper, kort, bilder, meny og luft, med flere fargevarianter. Temaet endrer aldri innholdet, bare utseendet.
 *
 * Alle fargevariantene er sjekket mot WCAG 2.0 AA i tests/temaer.test.ts.
 */

type Colors = Pick<Theme, "primary" | "onPrimary" | "background" | "surface" | "text" | "muted"> & { accent: string };
export type Palette = { key: string; label: string; colors: Colors };

export const themeTags = {
  minimal: "Enkle",
  elegant: "Elegante",
  kraftig: "Kraftige",
  leken: "Lekne",
  varm: "Varme",
  klassisk: "Klassiske",
  moderne: "Moderne",
} as const;
export type ThemeTag = keyof typeof themeTags;

export type ThemeDef = {
  key: string;
  label: string;
  description: string;
  /** Kort setning om hvem temaet passer for, vist under navnet. */
  bestFor: string;
  tags: ThemeTag[];
  fonts: FontKey;
  radius: Theme["radius"];
  style: Required<ThemeStyle>;
  palettes: Palette[];
};

const p = (key: string, label: string, colors: Colors): Palette => ({ key, label, colors });

export const themes: ThemeDef[] = [
  {
    key: "fjord",
    label: "Fjord",
    description: "Luftig og nordisk. Mye hvitrom, rolige farger og myke hjørner.",
    bestFor: "Passer de fleste, fra rådgivere til små butikker.",
    tags: ["minimal", "moderne"],
    fonts: "geometrisk",
    radius: "myk",
    style: { headings: "standard", scale: "standard", buttons: "fylt", cards: "flate", images: "standard", spacing: "luftig", header: "klassisk", decor: "ingen" },
    palettes: [
      p("fjordbla", "Fjordblå", { primary: "#1f4e79", onPrimary: "#ffffff", background: "#ffffff", surface: "#eef3f8", text: "#142333", muted: "#4b5b6b", accent: "#3d7bb8" }),
      p("granskog", "Granskog", { primary: "#24533d", onPrimary: "#ffffff", background: "#fbfcfa", surface: "#ecf2ee", text: "#17231d", muted: "#4a5951", accent: "#3f8a64" }),
      p("sand", "Sand", { primary: "#7a4a26", onPrimary: "#ffffff", background: "#fbf8f3", surface: "#f2ebe1", text: "#2a1f17", muted: "#5c4f45", accent: "#c08a4f" }),
      p("natt", "Natt", { primary: "#8ec1ff", onPrimary: "#0b1320", background: "#0f1722", surface: "#182334", text: "#eef3f8", muted: "#a9b6c6", accent: "#8ec1ff" }),
    ],
  },
  {
    key: "verksted",
    label: "Verksted",
    description: "Kraftige overskrifter i store bokstaver, skarpe hjørner og farget meny. Solid og ryddig.",
    bestFor: "Håndverkere, bygg og anlegg, bilverksted.",
    tags: ["kraftig"],
    fonts: "kondensert",
    radius: "skarp",
    style: { headings: "versaler", scale: "stor", buttons: "fylt", cards: "kant", images: "standard", spacing: "normal", header: "farget", decor: "strek" },
    palettes: [
      p("stal", "Stål og gul", { primary: "#f2b705", onPrimary: "#15191d", background: "#ffffff", surface: "#f1f3f5", text: "#15191d", muted: "#4a535c", accent: "#15191d" }),
      p("kveld", "Mørk og gul", { primary: "#f2b705", onPrimary: "#15191d", background: "#15191d", surface: "#22282e", text: "#f2f4f5", muted: "#b4bcc3", accent: "#f2b705" }),
      p("laave", "Rød låve", { primary: "#a4161a", onPrimary: "#ffffff", background: "#ffffff", surface: "#f5f1ee", text: "#1c1917", muted: "#57534e", accent: "#a4161a" }),
      p("stein", "Skog og stein", { primary: "#2f4f3a", onPrimary: "#ffffff", background: "#f7f6f2", surface: "#ebe8e0", text: "#1d211e", muted: "#4b514b", accent: "#2f4f3a" }),
    ],
  },
  {
    key: "atelier",
    label: "Atelier",
    description: "Tynne serifer, buede bilder og logo i midten. Rolig og lekkert.",
    bestFor: "Frisør, hudpleie, interiør og bryllup.",
    tags: ["elegant"],
    fonts: "elegant",
    radius: "skarp",
    style: { headings: "lett", scale: "stor", buttons: "omriss", cards: "flate", images: "bue", spacing: "luftig", header: "sentrert", decor: "ingen" },
    palettes: [
      p("pudder", "Pudder", { primary: "#8a4f4a", onPrimary: "#ffffff", background: "#fbf7f4", surface: "#f3e9e4", text: "#2b2220", muted: "#64524d", accent: "#c9958b" }),
      p("svart", "Sort og hvit", { primary: "#111111", onPrimary: "#ffffff", background: "#ffffff", surface: "#f4f4f2", text: "#111111", muted: "#5c5c5c", accent: "#b8a07e" }),
      p("salvie", "Salvie", { primary: "#4b5e45", onPrimary: "#ffffff", background: "#f6f7f2", surface: "#e8ece1", text: "#1f251e", muted: "#4f584d", accent: "#8fa382" }),
      p("champagne", "Champagne", { primary: "#d8b98c", onPrimary: "#1b1816", background: "#1b1816", surface: "#262220", text: "#f4ede6", muted: "#bfb3a8", accent: "#d8b98c" }),
    ],
  },
  {
    key: "galleri",
    label: "Galleri",
    description: "Store bilder, store overskrifter og nesten ingen pynt. Arbeidet ditt får hele plassen.",
    bestFor: "Kunstnere, fotografer, arkitekter og designere.",
    tags: ["minimal", "elegant"],
    fonts: "redaksjonell",
    radius: "skarp",
    style: { headings: "lett", scale: "stor", buttons: "lenke", cards: "kant", images: "standard", spacing: "luftig", header: "klassisk", decor: "ingen" },
    palettes: [
      p("kube", "Hvit kube", { primary: "#0d0d0d", onPrimary: "#ffffff", background: "#ffffff", surface: "#f5f5f5", text: "#0d0d0d", muted: "#5a5a5a", accent: "#0d0d0d" }),
      p("papir", "Papir", { primary: "#23201c", onPrimary: "#f7f3ec", background: "#f7f3ec", surface: "#ece6db", text: "#23201c", muted: "#595248", accent: "#b04a2e" }),
      p("kull", "Kull", { primary: "#f2f2f2", onPrimary: "#121212", background: "#121212", surface: "#1d1d1d", text: "#f2f2f2", muted: "#a8a8a8", accent: "#f2f2f2" }),
      p("blekk", "Blekk", { primary: "#1b2a6b", onPrimary: "#ffffff", background: "#f4f6fb", surface: "#e6eaf3", text: "#101828", muted: "#4a5568", accent: "#1b2a6b" }),
    ],
  },
  {
    key: "bistro",
    label: "Bistro",
    description: "Varme farger, runde knapper og overskrifter med karakter. Bildene får en farget ramme.",
    bestFor: "Kafé, restaurant, bakeri og gårdsbutikk.",
    tags: ["varm", "leken"],
    fonts: "myk",
    radius: "rund",
    style: { headings: "tung", scale: "stor", buttons: "pille", cards: "flate", images: "ramme", spacing: "normal", header: "sentrert", decor: "understrek" },
    palettes: [
      p("tomat", "Tomat", { primary: "#b8361e", onPrimary: "#ffffff", background: "#fffaf3", surface: "#f8ecdc", text: "#2a1a12", muted: "#654e40", accent: "#e8a33d" }),
      p("oliven", "Oliven", { primary: "#4f5a26", onPrimary: "#ffffff", background: "#f8f6ee", surface: "#ecebdc", text: "#22261a", muted: "#53574a", accent: "#c2a24a" }),
      p("espresso", "Espresso", { primary: "#e0a96d", onPrimary: "#1f1714", background: "#1f1714", surface: "#2b211c", text: "#f6ece3", muted: "#c4b2a4", accent: "#e0a96d" }),
      p("sitron", "Sitron", { primary: "#2f6b3a", onPrimary: "#ffffff", background: "#fffdf0", surface: "#f6efc6", text: "#1e2a1f", muted: "#4f5945", accent: "#e2b93b" }),
    ],
  },
  {
    key: "klinikk",
    label: "Klinikk",
    description: "Rent, rolig og trygt, med myke former og kort som løfter seg litt fra siden.",
    bestFor: "Fysioterapi, tannlege, psykolog og andre behandlere.",
    tags: ["minimal", "moderne"],
    fonts: "vennlig",
    radius: "rund",
    style: { headings: "standard", scale: "standard", buttons: "pille", cards: "skygge", images: "standard", spacing: "luftig", header: "klassisk", decor: "ingen" },
    palettes: [
      p("mint", "Mint", { primary: "#0f766e", onPrimary: "#ffffff", background: "#ffffff", surface: "#eef7f4", text: "#12302a", muted: "#4a5f5a", accent: "#5fbfaa" }),
      p("himmel", "Himmel", { primary: "#1d5fa8", onPrimary: "#ffffff", background: "#fbfdff", surface: "#ebf3fb", text: "#0f2236", muted: "#4a5d70", accent: "#6aa8e8" }),
      p("lavendel", "Lavendel", { primary: "#5b3fa0", onPrimary: "#ffffff", background: "#fdfcff", surface: "#f2effa", text: "#241c38", muted: "#5c5470", accent: "#a48fd9" }),
      p("fersken", "Fersken", { primary: "#a8482b", onPrimary: "#ffffff", background: "#fffaf7", surface: "#fbefe8", text: "#33201a", muted: "#6b544b", accent: "#f0a07f" }),
    ],
  },
  {
    key: "kontor",
    label: "Kontor",
    description: "Klassisk serif, tynne linjer og tydelig struktur. Gir tillit uten å bli stivt.",
    bestFor: "Regnskap, advokat, konsulenter og eiendom.",
    tags: ["klassisk"],
    fonts: "klassisk",
    radius: "myk",
    style: { headings: "standard", scale: "standard", buttons: "fylt", cards: "kant", images: "standard", spacing: "normal", header: "klassisk", decor: "strek" },
    palettes: [
      p("marine", "Marine", { primary: "#14315c", onPrimary: "#ffffff", background: "#ffffff", surface: "#f2f4f8", text: "#111827", muted: "#4b5563", accent: "#b08d57" }),
      p("grafitt", "Grafitt", { primary: "#2b2b2b", onPrimary: "#ffffff", background: "#ffffff", surface: "#f3f3f3", text: "#1a1a1a", muted: "#555555", accent: "#2f6f62" }),
      p("bordeaux", "Bordeaux", { primary: "#6d1f2f", onPrimary: "#ffffff", background: "#fdfbf9", surface: "#f4eeea", text: "#241619", muted: "#5e4f52", accent: "#6d1f2f" }),
      p("skifer", "Skifer", { primary: "#c9a96a", onPrimary: "#111827", background: "#111827", surface: "#1f2937", text: "#f3f4f6", muted: "#b3bcc8", accent: "#c9a96a" }),
    ],
  },
  {
    key: "puls",
    label: "Puls",
    description: "Sterke farger, tykke kanter og knapper med skygge. Synes godt.",
    bestFor: "Trening, arrangementer, ungdom og idrett.",
    tags: ["kraftig", "leken"],
    fonts: "uttrykksfull",
    radius: "myk",
    style: { headings: "tung", scale: "stor", buttons: "skygge", cards: "tykk", images: "standard", spacing: "normal", header: "klassisk", decor: "understrek" },
    palettes: [
      p("lime", "Lime", { primary: "#c8f04a", onPrimary: "#111111", background: "#fafaf5", surface: "#eef5d8", text: "#111111", muted: "#4b4b45", accent: "#9cc41f" }),
      p("elektrisk", "Elektrisk", { primary: "#3b3bf5", onPrimary: "#ffffff", background: "#ffffff", surface: "#eef0ff", text: "#0b0b23", muted: "#4a4a68", accent: "#ff5c39" }),
      p("sorbet", "Sorbet", { primary: "#c2185b", onPrimary: "#ffffff", background: "#fff7f2", surface: "#ffe4d6", text: "#2b1020", muted: "#6b4a58", accent: "#ff9e6d" }),
      p("nattklubb", "Nattklubb", { primary: "#c8f04a", onPrimary: "#0d0d12", background: "#0d0d12", surface: "#1a1a24", text: "#f5f5f7", muted: "#a9a9b8", accent: "#c8f04a" }),
    ],
  },
  {
    key: "boutique",
    label: "Boutique",
    description: "Rent og stramt med logoen i midten, så varene får hovedrollen.",
    bestFor: "Nettbutikker med klær, interiør og gaver.",
    tags: ["minimal", "moderne"],
    fonts: "ren",
    radius: "myk",
    style: { headings: "standard", scale: "standard", buttons: "fylt", cards: "flate", images: "standard", spacing: "normal", header: "sentrert", decor: "ingen" },
    palettes: [
      p("ren", "Ren", { primary: "#111111", onPrimary: "#ffffff", background: "#ffffff", surface: "#f5f5f4", text: "#111111", muted: "#57534e", accent: "#111111" }),
      p("krem", "Krem", { primary: "#2b241c", onPrimary: "#fbf8f2", background: "#fbf8f2", surface: "#f1ebe0", text: "#2b241c", muted: "#5e5446", accent: "#a3743f" }),
      p("rosa", "Rosa", { primary: "#9e2a4a", onPrimary: "#ffffff", background: "#fff8f8", surface: "#fbe9ea", text: "#2d1a1d", muted: "#6a5257", accent: "#e7a1b0" }),
      p("havdyp", "Havdyp", { primary: "#0e4d55", onPrimary: "#ffffff", background: "#f7fafa", surface: "#e6f0f0", text: "#0e2a2e", muted: "#4a6266", accent: "#3ea0a8" }),
    ],
  },
  {
    key: "hytte",
    label: "Hytte",
    description: "Jordnære farger og en varm serif. Føles som å komme inn i varmen.",
    bestFor: "Overnatting, opplevelser og lokalmat.",
    tags: ["varm", "klassisk"],
    fonts: "litteraer",
    radius: "rund",
    style: { headings: "standard", scale: "standard", buttons: "fylt", cards: "flate", images: "standard", spacing: "luftig", header: "klassisk", decor: "strek" },
    palettes: [
      p("mose", "Mose", { primary: "#3e5a2c", onPrimary: "#ffffff", background: "#f8f6f0", surface: "#ebe7da", text: "#232a20", muted: "#535b4d", accent: "#b5853d" }),
      p("fjell", "Fjell", { primary: "#2c4a5e", onPrimary: "#ffffff", background: "#f5f7f8", surface: "#e5eaed", text: "#1b2730", muted: "#4c5a64", accent: "#8aa1b1" }),
      p("tyttebaer", "Tyttebær", { primary: "#8c2632", onPrimary: "#ffffff", background: "#fdf8f6", surface: "#f5e8e3", text: "#2c1a1a", muted: "#634d4a", accent: "#d0743c" }),
      p("polarnatt", "Polarnatt", { primary: "#9fd8c4", onPrimary: "#0f1a1f", background: "#0f1a1f", surface: "#19272e", text: "#eef4f2", muted: "#a7b8b5", accent: "#9fd8c4" }),
    ],
  },
  {
    key: "leken",
    label: "Leken",
    description: "Runde former, glade farger og en vennlig font.",
    bestFor: "Barn og familie, dyr, hobby og foreninger.",
    tags: ["leken"],
    fonts: "leken",
    radius: "rund",
    style: { headings: "tung", scale: "stor", buttons: "pille", cards: "flate", images: "standard", spacing: "normal", header: "klassisk", decor: "understrek" },
    palettes: [
      p("godteri", "Godteri", { primary: "#6d28d9", onPrimary: "#ffffff", background: "#fffaf5", surface: "#fdeef3", text: "#2a1630", muted: "#5e4b63", accent: "#f59e0b" }),
      p("hav", "Hav", { primary: "#0b6e99", onPrimary: "#ffffff", background: "#f5fbff", surface: "#dff1fb", text: "#0c2a3f", muted: "#42596a", accent: "#ffb703" }),
      p("sol", "Sol", { primary: "#b4380a", onPrimary: "#ffffff", background: "#fffdf3", surface: "#fff1c2", text: "#2a2208", muted: "#5a5233", accent: "#f2a900" }),
      p("eng", "Eng", { primary: "#3d7a1f", onPrimary: "#ffffff", background: "#f7fbf3", surface: "#e5f3d6", text: "#1c2a14", muted: "#4d5c3c", accent: "#e86a92" }),
    ],
  },
  {
    key: "nordlys",
    label: "Nordlys",
    description: "Mørk bakgrunn med lysende detaljer. Gir et eksklusivt inntrykk.",
    bestFor: "Tech, musikk, eventer og premium-salonger.",
    tags: ["moderne", "elegant"],
    fonts: "grotesk",
    radius: "myk",
    style: { headings: "tung", scale: "stor", buttons: "pille", cards: "kant", images: "standard", spacing: "luftig", header: "klassisk", decor: "strek" },
    palettes: [
      p("nordlys", "Nordlys", { primary: "#5eead4", onPrimary: "#0b1120", background: "#0b1120", surface: "#131c31", text: "#eef2ff", muted: "#a5b0cb", accent: "#a78bfa" }),
      p("midnatt", "Midnatt", { primary: "#f5f5f7", onPrimary: "#0a0a0f", background: "#0a0a0f", surface: "#16161f", text: "#f5f5f7", muted: "#a1a1b0", accent: "#f59e0b" }),
      p("glod", "Glød", { primary: "#ff8a5b", onPrimary: "#160d0b", background: "#160d0b", surface: "#241613", text: "#fbefe9", muted: "#c7aca2", accent: "#ff8a5b" }),
      p("isbre", "Isbre", { primary: "#0b1729", onPrimary: "#ffffff", background: "#f8fbff", surface: "#e9f1fb", text: "#0b1729", muted: "#4a5a70", accent: "#2e7dd1" }),
    ],
  },
];

export function getThemeDef(key: string): ThemeDef | null {
  return themes.find((t) => t.key === key) ?? null;
}

/** Et ferdig tema til lagring, med hvilket tema og hvilken fargevariant det kom fra. */
export function buildTheme(themeKey: string, paletteKey?: string): Theme | null {
  const def = getThemeDef(themeKey);
  if (!def) return null;
  const palette = def.palettes.find((x) => x.key === paletteKey) ?? def.palettes[0];
  return { ...palette.colors, fonts: def.fonts, radius: def.radius, ...def.style, preset: { theme: def.key, palette: palette.key } };
}

/** Temaet og fargevarianten et lagret tema kom fra, hvis kunden ikke har tilpasset det til noe eget. */
export function presetOf(theme: Theme): { def: ThemeDef; palette: Palette } | null {
  if (!theme.preset) return null;
  const def = getThemeDef(theme.preset.theme);
  const palette = def?.palettes.find((x) => x.key === theme.preset?.palette);
  return def && palette ? { def, palette } : null;
}
