import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farge må være på formen #RRGGBB");

export const fontPairs = {
  moderne: { heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
  klassisk: { heading: "Georgia, 'Times New Roman', serif", body: "system-ui, sans-serif" },
  robust: { heading: "'Arial Black', Arial, sans-serif", body: "Arial, system-ui, sans-serif" },
} as const;

export const themeSchema = z.object({
  primary: hex,
  onPrimary: hex,
  background: hex,
  surface: hex,
  text: hex,
  muted: hex,
  fonts: z.enum(["moderne", "klassisk", "robust"]),
  radius: z.enum(["skarp", "myk", "rund"]),
});
export type Theme = z.infer<typeof themeSchema>;

const radiusPx = { skarp: "0px", myk: "8px", rund: "20px" } as const;

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

/**
 * WCAG 2.0 AA krever 4.5:1 for vanlig tekst. Et tema som ikke holder,
 * kan ikke lagres, slik at kunden ikke kan publisere en side som bryter kravet.
 */
export function themeContrastProblems(theme: Theme): string[] {
  const checks: [string, string, string][] = [
    ["Tekst mot bakgrunn", theme.text, theme.background],
    ["Tekst mot flater", theme.text, theme.surface],
    ["Dempet tekst mot bakgrunn", theme.muted, theme.background],
    ["Knappetekst mot knapp", theme.onPrimary, theme.primary],
  ];
  return checks
    .filter(([, fg, bg]) => contrastRatio(fg, bg) < 4.5)
    .map(([label, fg, bg]) => `${label} har kontrast ${contrastRatio(fg, bg).toFixed(2)}:1, kravet er 4.5:1`);
}

export function themeToCssVars(theme: Theme): Record<string, string> {
  const fonts = fontPairs[theme.fonts];
  return {
    "--c-primary": theme.primary,
    "--c-on-primary": theme.onPrimary,
    "--c-bg": theme.background,
    "--c-surface": theme.surface,
    "--c-text": theme.text,
    "--c-muted": theme.muted,
    "--f-heading": fonts.heading,
    "--f-body": fonts.body,
    "--radius": radiusPx[theme.radius],
  };
}
