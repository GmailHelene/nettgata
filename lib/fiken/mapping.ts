import { osloDate } from "@/lib/oslo-time";
import { ShopError } from "@/lib/shop/catalog";
import { allocateDiscount } from "@/lib/shop/discounts";
import { vatBreakdown } from "@/lib/shop/orders";

/**
 * Fra ordre til salg i Fiken (POST /companies/{companySlug}/sales, «Annet salg»). Én linje per MVA-sats, med samme
 * utregning som kassen, ordren og MVA-rapporten: rabatten fordeles på varene, frakten på satsene etter varebeløpet.
 * Alle beløp er i øre, slik Fiken vil ha dem. Ingen personopplysninger sendes, bare ordrenummeret.
 */

/** MVA-typene Fiken bruker for salg. 0 % er «fritatt» (for eksempel bøker) når selskapet er MVA-registrert. */
const vatTypes: Record<number, "HIGH" | "MEDIUM" | "LOW"> = { 25: "HIGH", 15: "MEDIUM", 12: "LOW" };

export type FikenSaleLine = { description: string; netPrice: number; vat: number; vatType: string; account: string };

export type FikenSale = {
  date: string;
  /** Betalt salg. Alle ordre som sendes, er betalt. */
  kind: "cash_sale";
  saleNumber: string;
  currency: "NOK";
  totalPaid: number;
  paymentAccount: string;
  paymentDate: string;
  lines: FikenSaleLine[];
};

export type OrderForSale = {
  number: number;
  createdAt: Date;
  paidAt: Date | null;
  totalOre: number;
  shippingOre: number;
  discountOre: number;
};

export type LineForSale = { totalOre: number; vatRate: number };

export type SaleOptions = {
  paymentAccount: string;
  incomeAccount: string;
  zeroVatIncomeAccount: string;
  vatRegistered: boolean;
};

/** Feilmeldingene sier ikke ordrenummeret. Det legger den som sender til, foran meldingen. */
export function saleFromOrder(order: OrderForSale, lines: LineForSale[], opts: SaleOptions): FikenSale {
  if (lines.length === 0) throw new ShopError("Ordren har ingen varelinjer, så den er ikke sendt.");
  const shares = allocateDiscount(
    lines.map((l) => l.totalOre),
    order.discountOre,
  );
  const rows = vatBreakdown(
    lines.map((l, i) => ({ totalOre: l.totalOre - shares[i], vatRate: l.vatRate })),
    order.shippingOre,
  ).filter((r) => r.amountOre !== 0);

  // Summen av linjene skal være nøyaktig det kunden betalte. Gjør den ikke det, sender vi heller ingenting.
  if (rows.reduce((sum, r) => sum + r.amountOre, 0) !== order.totalOre) {
    throw new ShopError("Beløpene på ordren går ikke opp mot totalen, så den er ikke sendt. Før den for hånd i Fiken.");
  }

  const what = order.shippingOre > 0 ? "varer og frakt" : "varer";
  const saleLines = rows.map((r): FikenSaleLine => {
    const description = `Ordre ${order.number} fra nettbutikken, ${what} med ${r.rate} % MVA`;
    if (r.rate === 0) {
      return { description, netPrice: r.amountOre, vat: 0, vatType: opts.vatRegistered ? "EXEMPT" : "NONE", account: opts.zeroVatIncomeAccount };
    }
    if (!opts.vatRegistered) {
      throw new ShopError(`Ordren har ${r.rate} % MVA, men selskapet er ikke MVA-registrert i Fiken. Sjekk MVA-satsen på varene, eller registreringen i Fiken.`);
    }
    const vatType = vatTypes[r.rate];
    if (!vatType) throw new ShopError(`Ordren har en MVA-sats Fiken-koblingen ikke kjenner (${r.rate} %).`);
    return { description, netPrice: r.amountOre - r.vatOre, vat: r.vatOre, vatType, account: opts.incomeAccount };
  });

  return {
    date: osloDate(order.createdAt),
    kind: "cash_sale",
    saleNumber: String(order.number),
    currency: "NOK",
    totalPaid: order.totalOre,
    paymentAccount: opts.paymentAccount,
    paymentDate: osloDate(order.paidAt ?? order.createdAt),
    lines: saleLines,
  };
}
