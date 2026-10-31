import { formatNok } from "@/lib/shop/money";

/**
 * Pris med førpris når den finnes. Førprisen er regnet ut av plattformen (laveste pris
 * siste 30 dager før nedsettelsen), så butikken kan ikke vise et avslag som ikke er ekte.
 */
export function Price({ priceOre, beforePriceOre, from = false }: { priceOre: number; beforePriceOre?: number | null; from?: boolean }) {
  if (beforePriceOre && beforePriceOre > priceOre) {
    return (
      <span>
        <span className="font-semibold">
          {from && "Fra "}
          {formatNok(priceOre)}
        </span>{" "}
        <span className="text-sm text-[var(--c-muted)]">
          Før <del>{formatNok(beforePriceOre)}</del>
          <span className="sr-only">, laveste pris de siste 30 dagene</span>
        </span>
      </span>
    );
  }
  return (
    <span className="font-semibold">
      {from && "Fra "}
      {formatNok(priceOre)}
    </span>
  );
}
