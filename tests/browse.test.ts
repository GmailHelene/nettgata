import { describe, expect, it } from "vitest";
import { availableFilters, browse, parseBrowseQuery } from "@/lib/shop/browse";
import type { CatalogProduct } from "@/lib/shop/catalog";

const product = (name: string, price: number, createdAt: string, variants: { values: string[]; stock: number | null }[]): CatalogProduct => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  description: "",
  images: [],
  options: [{ name: "Farge", values: ["Blå", "Rød"] }],
  vatRate: 25,
  categoryId: null,
  variants: variants.map((v, i) => ({ id: `${name}-${i}`, optionValues: v.values, label: v.values.join(" / "), priceOre: price, beforePriceOre: null, stock: v.stock })),
  fromPriceOre: price,
  inStock: variants.some((v) => v.stock === null || v.stock > 0),
  createdAt,
});

const lue = product("Lue", 39900, "2026-10-01", [
  { values: ["Blå"], stock: 2 },
  { values: ["Rød"], stock: 0 },
]);
const skjerf = product("Skjerf", 59900, "2026-10-20", [{ values: ["Rød"], stock: 0 }]);
const votter = product("Votter", 19900, "2026-10-10", [{ values: ["Blå"], stock: null }]);
const all = [lue, skjerf, votter];

describe("sortering og filtre", () => {
  it("leser adressen og ignorerer ukjent sortering", () => {
    expect(parseBrowseQuery({ sorter: "pris-lav", lager: "1", "valg-farge": "Blå" })).toEqual({ sort: "pris-lav", inStock: true, options: { farge: "Blå" } });
    expect(parseBrowseQuery({ sorter: "drop table" }).sort).toBe("");
  });

  it("sorterer på pris og dato", () => {
    expect(browse(all, parseBrowseQuery({ sorter: "pris-lav" })).map((p) => p.name)).toEqual(["Votter", "Lue", "Skjerf"]);
    expect(browse(all, parseBrowseQuery({ sorter: "pris-hoy" })).map((p) => p.name)).toEqual(["Skjerf", "Lue", "Votter"]);
    expect(browse(all, parseBrowseQuery({ sorter: "nyeste" })).map((p) => p.name)).toEqual(["Skjerf", "Votter", "Lue"]);
  });

  it("filtrerer på valg og lager i samme variant", () => {
    expect(browse(all, parseBrowseQuery({ "valg-farge": "Rød" })).map((p) => p.name)).toEqual(["Lue", "Skjerf"]);
    // Rød lue og rødt skjerf er utsolgt, så ingen igjen med både rød og på lager.
    expect(browse(all, parseBrowseQuery({ "valg-farge": "Rød", lager: "1" }))).toEqual([]);
    expect(browse(all, parseBrowseQuery({ lager: "1" })).map((p) => p.name)).toEqual(["Lue", "Votter"]);
  });

  it("samler filtermenyen fra varenes valg", () => {
    expect(availableFilters(all)).toEqual([{ key: "farge", name: "Farge", values: ["Blå", "Rød"] }]);
  });
});
