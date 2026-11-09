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
  style: Required<Omit<ThemeStyle, "layout">> & Pick<ThemeStyle, "layout">;
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
  {
    key: "vakt",
    label: "Vakt",
    description: "Telefonnummeret står først. Tung skrift, tydelig knapp og fast ringeknapp på mobil.",
    bestFor: "Rørlegger, elektriker og andre som får hastejobber.",
    tags: ["kraftig"],
    fonts: "robust",
    radius: "skarp",
    style: { headings: "tung", scale: "stor", buttons: "fylt", cards: "kant", images: "standard", spacing: "normal", header: "farget", decor: "strek", layout: "vakt" },
    palettes: [
      p("signal", "Signal", { primary: "#c2410c", onPrimary: "#ffffff", background: "#ffffff", surface: "#f4f1ec", text: "#17191c", muted: "#4f555c", accent: "#c2410c" }),
      p("marine", "Marine", { primary: "#12355b", onPrimary: "#ffffff", background: "#ffffff", surface: "#eef2f6", text: "#111a24", muted: "#4a5764", accent: "#e0a100" }),
      p("rod", "Rød", { primary: "#b3141c", onPrimary: "#ffffff", background: "#ffffff", surface: "#f6f1ef", text: "#1b1616", muted: "#57504f", accent: "#b3141c" }),
      p("nattevakt", "Nattevakt", { primary: "#ffb020", onPrimary: "#12161b", background: "#12161b", surface: "#1e242b", text: "#f4f6f8", muted: "#aeb7c0", accent: "#ffb020" }),
    ],
  },
  {
    key: "menykortet",
    label: "Menykortet",
    description: "Smal spalte som et trykt menykort, med overskrifter i midten og god luft.",
    bestFor: "Restaurant, kafé og bakeri.",
    tags: ["klassisk", "varm"],
    fonts: "litteraer",
    radius: "skarp",
    style: { headings: "standard", scale: "rolig", buttons: "lenke", cards: "kant", images: "standard", spacing: "luftig", header: "sentrert", decor: "strek", layout: "meny" },
    palettes: [
      p("papir", "Papir", { primary: "#7c2d12", onPrimary: "#ffffff", background: "#fbf7ef", surface: "#f1e9da", text: "#2a211a", muted: "#5f5246", accent: "#b45309" }),
      p("oliven", "Oliven", { primary: "#3f4f2a", onPrimary: "#ffffff", background: "#f9f8f1", surface: "#ecebdd", text: "#22261b", muted: "#555a49", accent: "#7a8c4f" }),
      p("vin", "Vin", { primary: "#6d1f33", onPrimary: "#ffffff", background: "#fbf6f4", surface: "#f1e6e3", text: "#28181c", muted: "#604f53", accent: "#a83a56" }),
      p("blekk", "Blekk", { primary: "#e8c48a", onPrimary: "#1a1714", background: "#1a1714", surface: "#26211c", text: "#f4ecdf", muted: "#c0b3a2", accent: "#e8c48a" }),
    ],
  },
  {
    key: "delt",
    label: "Delt",
    description: "Skjermen er delt i to: stort bilde på den ene siden og teksten på den andre.",
    bestFor: "Salong, terapeut og andre der bildet skal selge.",
    tags: ["elegant", "minimal"],
    fonts: "redaksjonell",
    radius: "skarp",
    style: { headings: "lett", scale: "stor", buttons: "omriss", cards: "flate", images: "standard", spacing: "luftig", header: "klassisk", decor: "ingen", layout: "delt" },
    palettes: [
      p("kalk", "Kalk", { primary: "#3b3a36", onPrimary: "#ffffff", background: "#faf8f5", surface: "#efebe4", text: "#1f1e1b", muted: "#5c5a54", accent: "#a08f78" }),
      p("salvie", "Salvie", { primary: "#355546", onPrimary: "#ffffff", background: "#f7f8f4", surface: "#e9ede5", text: "#1b241f", muted: "#4d5a52", accent: "#7f9a8a" }),
      p("rose", "Rosé", { primary: "#8a3a52", onPrimary: "#ffffff", background: "#fdf7f6", surface: "#f5e9e8", text: "#2b1c20", muted: "#66525a", accent: "#c98398" }),
      p("skumring", "Skumring", { primary: "#e6d7c3", onPrimary: "#14120f", background: "#14120f", surface: "#211e19", text: "#f4efe8", muted: "#b7aea2", accent: "#e6d7c3" }),
    ],
  },
  {
    key: "hylla",
    label: "Hylla",
    description: "Bredt og tett, med plass til mange varer på skjermen samtidig og kort toppbilde.",
    bestFor: "Nettbutikker med mange varer.",
    tags: ["moderne", "minimal"],
    fonts: "ren",
    radius: "myk",
    style: { headings: "standard", scale: "rolig", buttons: "fylt", cards: "kant", images: "standard", spacing: "tett", header: "klassisk", decor: "ingen", layout: "hylla" },
    palettes: [
      p("grafitt", "Grafitt", { primary: "#111827", onPrimary: "#ffffff", background: "#ffffff", surface: "#f3f4f6", text: "#111827", muted: "#4b5563", accent: "#111827" }),
      p("kobolt", "Kobolt", { primary: "#1d4ed8", onPrimary: "#ffffff", background: "#ffffff", surface: "#f3f5f9", text: "#111827", muted: "#4b5563", accent: "#1d4ed8" }),
      p("furu", "Furu", { primary: "#166534", onPrimary: "#ffffff", background: "#ffffff", surface: "#f1f5f1", text: "#14201a", muted: "#4a574f", accent: "#166534" }),
      p("kveldsapen", "Kveldsåpen", { primary: "#f3f4f6", onPrimary: "#0f1115", background: "#0f1115", surface: "#1a1d23", text: "#f3f4f6", muted: "#a8afba", accent: "#f3f4f6" }),
    ],
  },
  {
    key: "plakaten",
    label: "Plakaten",
    description: "Teksten over hele skjermen, som en konsertplakat. Tung, smal skrift og store flater.",
    bestFor: "Konsert, festival, utested og arrangører.",
    tags: ["kraftig", "leken"],
    fonts: "kondensert",
    radius: "skarp",
    style: { headings: "versaler", scale: "stor", buttons: "fylt", cards: "tykk", images: "standard", spacing: "normal", header: "klassisk", decor: "ingen", layout: "plakat" },
    palettes: [
      p("kull", "Kull", { primary: "#ffe600", onPrimary: "#111111", background: "#111111", surface: "#1e1e1e", text: "#f7f7f2", muted: "#b8b8ae", accent: "#ffe600" }),
      p("rodplakat", "Rød plakat", { primary: "#c1121f", onPrimary: "#ffffff", background: "#fff8ef", surface: "#f6ead9", text: "#1a1412", muted: "#5d524a", accent: "#c1121f" }),
      p("lilla", "Lilla natt", { primary: "#d8b4fe", onPrimary: "#1a1026", background: "#1a1026", surface: "#281a3a", text: "#f6effc", muted: "#bdaecb", accent: "#d8b4fe" }),
      p("turkis", "Turkis", { primary: "#0f766e", onPrimary: "#ffffff", background: "#f4fbf9", surface: "#e2f2ee", text: "#10211f", muted: "#46605c", accent: "#0f766e" }),
    ],
  },
  {
    key: "timeplan",
    label: "Timeplan",
    description: "Kort toppbilde og alt på rad og linje, så det er lett å finne tid, tjeneste og pris.",
    bestFor: "PT, studio, dans og timebaserte tjenester.",
    tags: ["moderne"],
    fonts: "grotesk",
    radius: "myk",
    style: { headings: "standard", scale: "standard", buttons: "fylt", cards: "kant", images: "standard", spacing: "tett", header: "klassisk", decor: "ingen", layout: "timeplan" },
    palettes: [
      p("friskt", "Friskt", { primary: "#0369a1", onPrimary: "#ffffff", background: "#ffffff", surface: "#eef6fb", text: "#0e1c26", muted: "#475a68", accent: "#0369a1" }),
      p("energi", "Energi", { primary: "#be123c", onPrimary: "#ffffff", background: "#ffffff", surface: "#fbeff2", text: "#1f1216", muted: "#5e4b51", accent: "#be123c" }),
      p("skoggronn", "Skoggrønn", { primary: "#15603f", onPrimary: "#ffffff", background: "#fbfdfb", surface: "#e9f3ed", text: "#13211a", muted: "#48584f", accent: "#15603f" }),
      p("kveldstrening", "Kveldstrening", { primary: "#7dd3fc", onPrimary: "#0b1620", background: "#0b1620", surface: "#15242f", text: "#eef6fb", muted: "#a8b9c5", accent: "#7dd3fc" }),
    ],
  },
  {
    key: "avisen",
    label: "Avisen",
    description: "Stor avisoverskrift, tynne linjer og saker i spalter.",
    bestFor: "Forening, forfatter, fagblogg og lokalt nytt.",
    tags: ["klassisk"],
    fonts: "klassisk",
    radius: "skarp",
    style: { headings: "standard", scale: "stor", buttons: "lenke", cards: "flate", images: "standard", spacing: "normal", header: "sentrert", decor: "ingen", layout: "avis" },
    palettes: [
      p("avispapir", "Avispapir", { primary: "#111111", onPrimary: "#ffffff", background: "#f8f5ee", surface: "#ece7db", text: "#141414", muted: "#55524a", accent: "#a4161a" }),
      p("forening", "Forening", { primary: "#1e3a5f", onPrimary: "#ffffff", background: "#fbfaf6", surface: "#ecebe3", text: "#141a22", muted: "#515a65", accent: "#1e3a5f" }),
      p("bordeaux", "Bordeaux", { primary: "#7a1f2b", onPrimary: "#ffffff", background: "#fcf8f4", surface: "#f0e7df", text: "#21171a", muted: "#5e5150", accent: "#7a1f2b" }),
      p("nattavis", "Nattavis", { primary: "#f5f0e4", onPrimary: "#141414", background: "#141414", surface: "#222220", text: "#f5f0e4", muted: "#b7b2a5", accent: "#d9b36c" }),
    ],
  },
  {
    key: "sidemeny",
    label: "Sidemeny",
    description: "Menyen står loddrett på siden, og bildene får hele resten av skjermen.",
    bestFor: "Fotograf, arkitekt og kunstner.",
    tags: ["minimal", "elegant"],
    fonts: "geometrisk",
    radius: "skarp",
    style: { headings: "lett", scale: "rolig", buttons: "lenke", cards: "flate", images: "standard", spacing: "luftig", header: "klassisk", decor: "ingen", layout: "sidemeny" },
    palettes: [
      p("hvitvegg", "Hvit vegg", { primary: "#1c1c1c", onPrimary: "#ffffff", background: "#ffffff", surface: "#f2f2f0", text: "#1c1c1c", muted: "#5a5a57", accent: "#1c1c1c" }),
      p("leire", "Leire", { primary: "#8a4b2f", onPrimary: "#ffffff", background: "#faf6f2", surface: "#f0e7df", text: "#2a1f19", muted: "#5f5249", accent: "#c0805f" }),
      p("sjo", "Sjø", { primary: "#1f5c6b", onPrimary: "#ffffff", background: "#f7fbfb", surface: "#e6f0f1", text: "#14242a", muted: "#4b5d62", accent: "#1f5c6b" }),
      p("morkerom", "Mørkerom", { primary: "#ededed", onPrimary: "#111111", background: "#111111", surface: "#1c1c1c", text: "#ededed", muted: "#a9a9a9", accent: "#ededed" }),
    ],
  },
  {
    key: "prosjektet",
    label: "Prosjektet",
    description: "Store prosjektbilder og saklige kort, så arbeidet får tale for seg.",
    bestFor: "Bygg, entreprenør og snekker.",
    tags: ["kraftig", "moderne"],
    fonts: "grotesk",
    radius: "skarp",
    style: { headings: "tung", scale: "standard", buttons: "fylt", cards: "tykk", images: "standard", spacing: "normal", header: "klassisk", decor: "strek", layout: "prosjekt" },
    palettes: [
      p("betong", "Betong", { primary: "#1f2937", onPrimary: "#ffffff", background: "#ffffff", surface: "#eff0f2", text: "#14181f", muted: "#4e5661", accent: "#d97706" }),
      p("tre", "Tre", { primary: "#7c4a1e", onPrimary: "#ffffff", background: "#fbf8f3", surface: "#f0e9dd", text: "#261c13", muted: "#5c4f41", accent: "#b9782f" }),
      p("skog", "Skog", { primary: "#27543a", onPrimary: "#ffffff", background: "#fafbf8", surface: "#e9efe7", text: "#172119", muted: "#4b584e", accent: "#27543a" }),
      p("anlegg", "Anlegg", { primary: "#fbbf24", onPrimary: "#15181c", background: "#15181c", surface: "#22272d", text: "#f3f4f5", muted: "#b2b9c0", accent: "#fbbf24" }),
    ],
  },
  {
    key: "gardsdisken",
    label: "Gårdsdisken",
    description: "Varmt og håndlaget, med stort bilde i ramme og myke flater.",
    bestFor: "Gårdsbutikk, bakeri og lokalmat.",
    tags: ["varm", "leken"],
    fonts: "myk",
    radius: "rund",
    style: { headings: "standard", scale: "standard", buttons: "pille", cards: "flate", images: "bue", spacing: "normal", header: "sentrert", decor: "understrek", layout: "disk" },
    palettes: [
      p("gard", "Gård", { primary: "#7a3e12", onPrimary: "#ffffff", background: "#fbf5e9", surface: "#f2e7d0", text: "#2a1e10", muted: "#5f5140", accent: "#b7791f" }),
      p("eng", "Eng", { primary: "#3f6212", onPrimary: "#ffffff", background: "#f9faef", surface: "#ecefd9", text: "#1f2610", muted: "#525a42", accent: "#65a30d" }),
      p("bringebaer", "Bringebær", { primary: "#9d174d", onPrimary: "#ffffff", background: "#fdf6f4", surface: "#f7e7ea", text: "#2a161e", muted: "#634e57", accent: "#db2777" }),
      p("kjeller", "Kjeller", { primary: "#f0c987", onPrimary: "#1d1a14", background: "#1d1a14", surface: "#2a261d", text: "#f5eddd", muted: "#c0b5a0", accent: "#f0c987" }),
    ],
  },
  {
    key: "ettprodukt",
    label: "Ett produkt",
    description: "Ett stort bilde i midten, og lang, rolig historie under.",
    bestFor: "Butikker med ett eller få produkter.",
    tags: ["minimal", "moderne"],
    fonts: "uttrykksfull",
    radius: "rund",
    style: { headings: "tung", scale: "stor", buttons: "pille", cards: "flate", images: "standard", spacing: "luftig", header: "sentrert", decor: "ingen", layout: "produkt" },
    palettes: [
      p("ren", "Ren", { primary: "#111111", onPrimary: "#ffffff", background: "#ffffff", surface: "#f4f4f2", text: "#111111", muted: "#55554f", accent: "#111111" }),
      p("korall", "Korall", { primary: "#b4372c", onPrimary: "#ffffff", background: "#fff7f4", surface: "#fae9e3", text: "#2a1613", muted: "#65504b", accent: "#e66b5b" }),
      p("dyp", "Dyp", { primary: "#1e3a8a", onPrimary: "#ffffff", background: "#f8f9ff", surface: "#e9edfb", text: "#121a33", muted: "#4c5573", accent: "#1e3a8a" }),
      p("lansering", "Lansering", { primary: "#a7f3d0", onPrimary: "#0c1512", background: "#0c1512", surface: "#17231e", text: "#ecf8f2", muted: "#a6bbb1", accent: "#a7f3d0" }),
    ],
  },
  {
    key: "lokalkontor",
    label: "Lokalkontor",
    description: "Nøkternt og ryddig, med tre kort i bredden og tydelig informasjon.",
    bestFor: "Klinikker, kontorer og bedrifter med mye informasjon.",
    tags: ["minimal", "klassisk"],
    fonts: "ren",
    radius: "myk",
    style: { headings: "standard", scale: "rolig", buttons: "fylt", cards: "kant", images: "standard", spacing: "normal", header: "farget", decor: "ingen", layout: "kontor" },
    palettes: [
      p("noytral", "Nøytral", { primary: "#27364a", onPrimary: "#ffffff", background: "#ffffff", surface: "#f1f3f6", text: "#161d27", muted: "#4f5a68", accent: "#27364a" }),
      p("kommune", "Grønn", { primary: "#17603f", onPrimary: "#ffffff", background: "#ffffff", surface: "#eef4f0", text: "#13211a", muted: "#49584f", accent: "#17603f" }),
      p("teal", "Blågrønn", { primary: "#0e6470", onPrimary: "#ffffff", background: "#ffffff", surface: "#ebf4f5", text: "#112327", muted: "#475a5e", accent: "#0e6470" }),
      p("kveldskontor", "Kveldskontor", { primary: "#c7d2fe", onPrimary: "#111624", background: "#111624", surface: "#1c2233", text: "#eef0f9", muted: "#aab1c6", accent: "#c7d2fe" }),
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
