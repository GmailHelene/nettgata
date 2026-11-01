/**
 * Plattformens priser, vedtatt 31.10.2026 (docs/PRODUKTSPEK.md). Alle beløp i øre, uten mva.
 *
 * Stripe bestemmer hva kunden faktisk trekkes, men prisene står også her av to grunner: studioet viser dem
 * før kunden går til betaling, og betalingen stoppes hvis prisen i Stripe ikke stemmer med denne lista.
 * Endres en pris, må den endres begge steder. Fila brukes også i nettleseren, så den skal ikke importere noe fra serveren.
 */

export const VAT_PERCENT = 25;

export type Plan = "nettside" | "nettbutikk";
export type BillingInterval = "month" | "year";

export const PLANS: Record<Plan, { label: string; monthOre: number; yearOre: number; setupOre: number; setupIncludes: string }> = {
  nettside: {
    label: "Nettside",
    monthOre: 19900,
    yearOre: 169 * 12 * 100,
    setupOre: 390000,
    setupIncludes: "Opptil 7 sider, design, tekst og flytting fra den gamle siden din.",
  },
  nettbutikk: {
    label: "Nettbutikk",
    monthOre: 39900,
    yearOre: 339 * 12 * 100,
    setupOre: 990000,
    setupIncludes: "Butikkoppsett, betaling, frakt og import av opptil 100 varer.",
  },
};

/**
 * Tillegget koster 249 kr i måneden. Stripe Checkout kan ikke blande måned og år i samme abonnement,
 * så ved årlig betaling faktureres tillegget for et år om gangen: 12 x 249 kr.
 */
/** Tillegget er ikke bygget ennå (fase 2 i spesifikasjonen). Til det er klart, kan det verken velges eller betales. */
export const ADDON_AVAILABLE = false;

export const ADDON = {
  label: "AI-team og sosiale medier",
  monthOre: 24900,
  yearOre: 249 * 12 * 100,
  includes: "Daglig rapport med forslag og innlegg til sosiale medier. Ingenting endres før du trykker Godkjenn.",
};

export type PriceRole = "plan" | "addon" | "setup";

/** Én pris slik den skal ligge i Stripe. lookupKey er oppslagsnøkkelen koden finner prisen med. */
export type PriceSpec = {
  lookupKey: string;
  role: PriceRole;
  plan: Plan | null;
  /** null for engangsbeløp. */
  interval: BillingInterval | null;
  amountOre: number;
  label: string;
};

const intervalKey: Record<BillingInterval, string> = { month: "mnd", year: "ar" };

function planSpec(plan: Plan, interval: BillingInterval): PriceSpec {
  const p = PLANS[plan];
  return {
    lookupKey: `nettgata_${plan}_${intervalKey[interval]}`,
    role: "plan",
    plan,
    interval,
    amountOre: interval === "month" ? p.monthOre : p.yearOre,
    label: `${p.label}, ${interval === "month" ? "månedlig" : "årlig"}`,
  };
}

function addonSpec(interval: BillingInterval): PriceSpec {
  return {
    lookupKey: `nettgata_tillegg_ai_${intervalKey[interval]}`,
    role: "addon",
    plan: null,
    interval,
    amountOre: interval === "month" ? ADDON.monthOre : ADDON.yearOre,
    label: ADDON.label,
  };
}

function setupSpec(plan: Plan): PriceSpec {
  return {
    lookupKey: `nettgata_oppstart_${plan}`,
    role: "setup",
    plan,
    interval: null,
    amountOre: PLANS[plan].setupOre,
    label: `Oppstart, ${PLANS[plan].label.toLowerCase()}`,
  };
}

/** Alle prisene som må finnes i Stripe. Står også i docs/BETALING-PLATTFORM.md. */
export const PRICE_SPECS: PriceSpec[] = [
  planSpec("nettside", "month"),
  planSpec("nettside", "year"),
  planSpec("nettbutikk", "month"),
  planSpec("nettbutikk", "year"),
  addonSpec("month"),
  addonSpec("year"),
  setupSpec("nettside"),
  setupSpec("nettbutikk"),
];

export function priceSpecByKey(lookupKey: string): PriceSpec | null {
  return PRICE_SPECS.find((s) => s.lookupKey === lookupKey) ?? null;
}

/** Abonnementet følger nettstedets type. */
export function planForKind(kind: string): Plan {
  return kind === "nettbutikk" ? "nettbutikk" : "nettside";
}

export type CheckoutChoice = { interval: BillingInterval; addon: boolean; setup: boolean };

/** Prisene i et valg, i den rekkefølgen de vises og sendes til Stripe. */
export function specsFor(plan: Plan, choice: CheckoutChoice): PriceSpec[] {
  return [planSpec(plan, choice.interval), ...(choice.addon ? [addonSpec(choice.interval)] : []), ...(choice.setup ? [setupSpec(plan)] : [])];
}

export type Quote = {
  lines: { label: string; amountOre: number }[];
  /** Første betaling, uten mva. */
  subtotalOre: number;
  vatOre: number;
  totalOre: number;
  /** Det som trekkes hver måned eller hvert år etter første betaling, uten mva. */
  recurringOre: number;
  interval: BillingInterval;
};

/** Hele kroner gir alltid hele øre med 25 % mva, så det trengs ingen avrunding. */
export function quote(plan: Plan, choice: CheckoutChoice): Quote {
  const specs = specsFor(plan, choice);
  const lines = specs.map((s) => ({ label: s.label, amountOre: s.amountOre }));
  const subtotalOre = lines.reduce((sum, l) => sum + l.amountOre, 0);
  const vatOre = Math.round((subtotalOre * VAT_PERCENT) / 100);
  const recurringOre = specs.filter((s) => s.interval).reduce((sum, s) => sum + s.amountOre, 0);
  return { lines, subtotalOre, vatOre, totalOre: subtotalOre + vatOre, recurringOre, interval: choice.interval };
}
