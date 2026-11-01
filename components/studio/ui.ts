/**
 * Studioets knapper, kort og tekst i samme stil som nettgata.no (components/brand.tsx).
 * Gateblått (#173b6c) og asfalt (#1b232b) på hvitt og kalk (#f2f4f5) holder WCAG AA med god margin.
 */
export const ui = {
  page: "mx-auto w-full max-w-6xl px-4 sm:px-6",
  eyebrow: "mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#2f5a47]",
  muted: "text-[#47525c]",
  card: "rounded-xl border border-[#d5dbe0] bg-white",
  label: "mb-1.5 block text-sm font-semibold",
  button:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#173b6c] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#0f2c55] disabled:cursor-not-allowed disabled:opacity-60",
  buttonGhost:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-[#173b6c] bg-white px-5 py-2 font-semibold text-[#173b6c] transition-colors hover:bg-[#eef3f9] disabled:cursor-not-allowed disabled:opacity-50",
  link: "font-medium text-[#173b6c] underline underline-offset-4 hover:text-[#0f2c55]",
  error: "rounded-lg border border-[#a13a2c]/30 bg-[#fbeceb] px-3.5 py-2.5 text-sm text-[#7a2a20]",
  success: "rounded-lg border border-[#2f5a47]/30 bg-[#e9f1ed] px-3.5 py-2.5 text-sm text-[#1e3d30]",
} as const;
