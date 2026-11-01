import type { CSSProperties } from "react";
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farge må være på formen #RRGGBB");

const sans = "system-ui, sans-serif";
const serif = "Georgia, serif";

/** Fontpar. CSS-variablene settes av app/fonts.ts, med systemfonter som reserve. */
export const fontPairs = {
  moderne: { label: "Moderne", names: "Inter", heading: `var(--font-inter), ${sans}`, body: `var(--font-inter), ${sans}` },
  klassisk: { label: "Klassisk", names: "Playfair og Inter", heading: `var(--font-playfair), ${serif}`, body: `var(--font-inter), ${sans}` },
  robust: { label: "Robust", names: "Archivo og Inter", heading: `var(--font-archivo), ${sans}`, body: `var(--font-inter), ${sans}` },
  elegant: { label: "Elegant", names: "Cormorant og DM Sans", heading: `var(--font-cormorant), ${serif}`, body: `var(--font-dmsans), ${sans}` },
  myk: { label: "Myk", names: "Fraunces og DM Sans", heading: `var(--font-fraunces), ${serif}`, body: `var(--font-dmsans), ${sans}` },
  vennlig: { label: "Vennlig", names: "Nunito", heading: `var(--font-nunito), ${sans}`, body: `var(--font-nunito), ${sans}` },
  geometrisk: { label: "Geometrisk", names: "Manrope", heading: `var(--font-manrope), ${sans}`, body: `var(--font-manrope), ${sans}` },
  kondensert: { label: "Kondensert", names: "Barlow Condensed og Inter", heading: `var(--font-barlow), ${sans}`, body: `var(--font-inter), ${sans}` },
  redaksjonell: { label: "Redaksjonell", names: "Instrument Serif og Inter", heading: `var(--font-instrument), ${serif}`, body: `var(--font-inter), ${sans}` },
  uttrykksfull: { label: "Uttrykksfull", names: "Bricolage Grotesque og Inter", heading: `var(--font-bricolage), ${sans}`, body: `var(--font-inter), ${sans}` },
  ren: { label: "Ren", names: "DM Sans", heading: `var(--font-dmsans), ${sans}`, body: `var(--font-dmsans), ${sans}` },
  litteraer: { label: "Litterær", names: "Lora og DM Sans", heading: `var(--font-lora), ${serif}`, body: `var(--font-dmsans), ${sans}` },
  leken: { label: "Leken", names: "Fredoka og Nunito", heading: `var(--font-fredoka), ${sans}`, body: `var(--font-nunito), ${sans}` },
  grotesk: { label: "Grotesk", names: "Space Grotesk og Inter", heading: `var(--font-spacegrotesk), ${sans}`, body: `var(--font-inter), ${sans}` },
} as const;
export type FontKey = keyof typeof fontPairs;
const fontKeys = Object.keys(fontPairs) as [FontKey, ...FontKey[]];

/**
 * Stilvalgene et tema består av, med navnene kunden ser i studioet. Hvert valg er en egen akse, så et tema
 * kan tilpasses del for del (som «Tilpass» i WordPress) uten at innholdet endres.
 */
export const styleOptions = {
  headings: { label: "Overskrifter", options: { standard: "Standard", tung: "Kraftige", lett: "Lette", versaler: "Store bokstaver" } },
  scale: { label: "Størrelse på overskrifter", options: { rolig: "Rolige", standard: "Standard", stor: "Store" } },
  buttons: {
    label: "Knapper",
    options: { fylt: "Fylte", omriss: "Omriss", pille: "Runde", skygge: "Med skygge", lenke: "Lenke med pil" },
  },
  cards: { label: "Kort og bokser", options: { flate: "Fargede flater", kant: "Tynn kant", skygge: "Skygge", tykk: "Tykk kant" } },
  images: { label: "Store bilder", options: { standard: "Vanlige", bue: "Buet topp", ramme: "Med fargeramme" } },
  spacing: { label: "Luft mellom delene", options: { tett: "Tett", normal: "Normal", luftig: "Luftig" } },
  header: { label: "Toppmeny", options: { klassisk: "Logo til venstre", sentrert: "Logo i midten", farget: "Farget meny" } },
  decor: { label: "Pynt på overskrifter", options: { ingen: "Ingen", strek: "Strek under", understrek: "Tusjstrek" } },
  radius: { label: "Hjørner", options: { skarp: "Skarpe", myk: "Myke", rund: "Runde" } },
} as const;

type StyleKey = keyof typeof styleOptions;
type OptionOf<K extends StyleKey> = keyof (typeof styleOptions)[K]["options"];
const optionKeys = <K extends StyleKey>(key: K) => Object.keys(styleOptions[key].options) as [OptionOf<K>, ...OptionOf<K>[]];

export const themeSchema = z.object({
  primary: hex,
  onPrimary: hex,
  background: hex,
  surface: hex,
  text: hex,
  muted: hex,
  /** Pyntefarge til ikoner, streker og rammer. Brukes aldri til tekst, og er primærfargen hvis den mangler. */
  accent: hex.optional(),
  fonts: z.enum(fontKeys),
  radius: z.enum(optionKeys("radius")),
  // Stilvalgene kom i november 2026. De er valgfrie, så eldre nettsteder er gyldige og ser ut som før.
  headings: z.enum(optionKeys("headings")).optional(),
  scale: z.enum(optionKeys("scale")).optional(),
  buttons: z.enum(optionKeys("buttons")).optional(),
  cards: z.enum(optionKeys("cards")).optional(),
  images: z.enum(optionKeys("images")).optional(),
  spacing: z.enum(optionKeys("spacing")).optional(),
  header: z.enum(optionKeys("header")).optional(),
  decor: z.enum(optionKeys("decor")).optional(),
  /** Temaet og fargevarianten innstillingene kom fra. Brukes bare til å vise valget i studioet. */
  preset: z.object({ theme: z.string().max(40), palette: z.string().max(40) }).optional(),
});
export type Theme = z.infer<typeof themeSchema>;
export type ThemeStyle = Pick<Theme, "headings" | "scale" | "buttons" | "cards" | "images" | "spacing" | "header" | "decor">;
export type ResolvedTheme = Required<Omit<Theme, "preset">> & Pick<Theme, "preset">;

const defaults = {
  headings: "standard",
  scale: "standard",
  buttons: "fylt",
  cards: "flate",
  images: "standard",
  spacing: "normal",
  header: "klassisk",
  decor: "ingen",
} as const satisfies Required<ThemeStyle>;

/** Nøytral reserve hvis et lagret tema skulle være ødelagt. Siden skal vises uansett. */
const fallback: ResolvedTheme = {
  primary: "#1f2937",
  onPrimary: "#ffffff",
  background: "#ffffff",
  surface: "#f3f4f6",
  text: "#111827",
  muted: "#4b5563",
  accent: "#1f2937",
  fonts: "moderne",
  radius: "myk",
  ...defaults,
};

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const pick = <K extends StyleKey>(key: K, value: unknown, fallbackValue: OptionOf<K>): OptionOf<K> =>
  typeof value === "string" && value in styleOptions[key].options ? (value as OptionOf<K>) : fallbackValue;

/**
 * Fyller inn standardverdier og tåler ukjente verdier felt for felt. Temaet kommer fra databasen uten
 * kontroll, og en enkelt rar verdi skal ikke kunne velte hele nettstedet.
 */
export function resolveTheme(raw: Partial<Theme> | null | undefined): ResolvedTheme {
  const t = raw ?? {};
  const color = (key: "primary" | "onPrimary" | "background" | "surface" | "text" | "muted") => (isHex(t[key]) ? t[key] : fallback[key]);
  const primary = color("primary");
  return {
    primary,
    onPrimary: color("onPrimary"),
    background: color("background"),
    surface: color("surface"),
    text: color("text"),
    muted: color("muted"),
    accent: isHex(t.accent) ? t.accent : primary,
    fonts: typeof t.fonts === "string" && t.fonts in fontPairs ? t.fonts : fallback.fonts,
    radius: pick("radius", t.radius, fallback.radius),
    headings: pick("headings", t.headings, defaults.headings),
    scale: pick("scale", t.scale, defaults.scale),
    buttons: pick("buttons", t.buttons, defaults.buttons),
    cards: pick("cards", t.cards, defaults.cards),
    images: pick("images", t.images, defaults.images),
    spacing: pick("spacing", t.spacing, defaults.spacing),
    header: pick("header", t.header, defaults.header),
    decor: pick("decor", t.decor, defaults.decor),
    preset: t.preset,
  };
}

const radiusPx = { skarp: "0px", myk: "8px", rund: "20px" } as const;
const spacingScale = { tett: "0.72", normal: "1", luftig: "1.4" } as const;
const scaleValue = { rolig: 0.86, standard: 1, stor: 1.18 } as const;
/** Vekt, sperring og størrelse per overskriftsstil. Store bokstaver krymper litt, ellers blir de for dominerende. */
const headingStyles = {
  standard: { weight: "700", h3: "600", tracking: "-0.02em", textCase: "none", scale: 1 },
  tung: { weight: "800", h3: "700", tracking: "-0.03em", textCase: "none", scale: 1 },
  lett: { weight: "400", h3: "500", tracking: "-0.01em", textCase: "none", scale: 1.08 },
  versaler: { weight: "700", h3: "700", tracking: "0.03em", textCase: "uppercase", scale: 0.88 },
} as const;

/** Relativ luminans etter WCAG 2.x. */
function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mørk bakgrunn: skjemafelt og rullefelt følger etter, så de ikke lyser hvitt på en mørk side. */
export function isDark(theme: Pick<Theme, "background">): boolean {
  return luminance(theme.background) < 0.18;
}

/**
 * WCAG 2.0 AA krever 4.5:1 for vanlig tekst. Et tema som ikke holder,
 * kan ikke lagres, slik at kunden ikke kan publisere en side som bryter kravet.
 */
export function themeContrastProblems(theme: Theme): string[] {
  const checks: [string, string, string][] = [
    ["Tekst mot bakgrunn", theme.text, theme.background],
    ["Tekst mot flater", theme.text, theme.surface],
    ["Dempet tekst mot bakgrunn", theme.muted, theme.background],
    ["Dempet tekst mot flater", theme.muted, theme.surface],
    ["Knappetekst mot knapp", theme.onPrimary, theme.primary],
  ];
  // Knapper med omriss har teksten i primærfargen rett på bakgrunnen.
  if (theme.buttons === "omriss") {
    checks.push(["Knappefarge mot bakgrunn", theme.primary, theme.background], ["Knappefarge mot flater", theme.primary, theme.surface]);
  }
  return checks
    .filter(([, fg, bg]) => contrastRatio(fg, bg) < 4.5)
    .map(([label, fg, bg]) => `${label} har kontrast ${contrastRatio(fg, bg).toFixed(2)}:1, kravet er 4.5:1`);
}

/** Det nettstedets ytterste element får: fargene og målene som CSS-variabler, stilvalgene som data-attributter. */
export type ThemeRootProps = { style: CSSProperties } & { [attribute: `data-${string}`]: string | undefined };

/**
 * Stilvalg som bruker farger (knapper, kort, rammer, farget meny) styres med data-attributter og regler i
 * app/globals.css. Da regnes fargene ut der elementet står, og følger med når en seksjon med fargerik
 * bakgrunn bytter fargene lokalt. Rene tall og mål går som variabler.
 */
export function themeRootProps(raw: Partial<Theme>): ThemeRootProps {
  const t = resolveTheme(raw);
  const fonts = fontPairs[t.fonts];
  const heading = headingStyles[t.headings];
  return {
    style: {
      "--c-primary": t.primary,
      "--c-on-primary": t.onPrimary,
      // Faste kopier, brukt når en seksjon bytter om primærfargene lokalt.
      "--c-primary-fixed": t.primary,
      "--c-on-primary-fixed": t.onPrimary,
      "--c-bg": t.background,
      "--c-surface": t.surface,
      "--c-text": t.text,
      "--c-muted": t.muted,
      "--c-accent": t.accent,
      "--f-heading": fonts.heading,
      "--f-body": fonts.body,
      "--radius": radiusPx[t.radius],
      "--space": spacingScale[t.spacing],
      "--h-weight": heading.weight,
      "--h3-weight": heading.h3,
      "--h-track": heading.tracking,
      "--h-case": heading.textCase,
      "--h-scale": String(Math.round(scaleValue[t.scale] * heading.scale * 100) / 100),
    } as CSSProperties,
    "data-knapper": t.buttons,
    "data-kort": t.cards,
    "data-bilder": t.images,
    "data-topp": t.header,
    "data-dekor": t.decor,
    "data-mork": isDark(t) ? "" : undefined,
  };
}
