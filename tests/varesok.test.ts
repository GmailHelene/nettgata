import { describe, expect, it } from "vitest";
import { browse, parseBrowseQuery } from "@/lib/shop/browse";
import type { CatalogProduct } from "@/lib/shop/catalog";

const product = (name: string, description = "", values: string[] = []): CatalogProduct => ({
  id: name,
  name,
  slug: name,
  description,
  images: [],
  options: values.length ? [{ name: "Farge", values }] : [],
  vatRate: 25,
  categoryId: null,
  variants: (values.length ? values : [""]).map((v, i) => ({ id: `${name}-${i}`, optionValues: v ? [v] : [], label: v, priceOre: 10000, beforePriceOre: null, stock: null })),
  fromPriceOre: 10000,
  inStock: true,
  createdAt: "2026-11-01T00:00:00.000Z",
});

const all = [product("Ullpledd", "Varmt pledd fra Røros", ["Grå", "Blå"]), product("Linskjorte", "Lett skjorte i lin"), product("Keramikkopp", "Håndlaget på Åmot")];
const search = (sok: string) => browse(all, parseBrowseQuery({ sok })).map((p) => p.name);

describe("varesøk", () => {
  it("finner på navn, beskrivelse og varianter, uansett store bokstaver og æ, ø og å", () => {
    expect(search("pledd")).toEqual(["Ullpledd"]);
    expect(search("LIN")).toEqual(["Linskjorte"]);
    expect(search("roros")).toEqual(["Ullpledd"]);
    expect(search("åmot")).toEqual(["Keramikkopp"]);
    expect(search("blå")).toEqual(["Ullpledd"]);
  });

  it("krever at alle ordene treffer, og tomt søk viser alt", () => {
    expect(search("pledd lin")).toEqual([]);
    expect(search("")).toHaveLength(3);
    expect(parseBrowseQuery({ sok: "x".repeat(200) }).search).toHaveLength(80);
  });
});
