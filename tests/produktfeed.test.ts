import { describe, expect, it } from "vitest";
import { EXAMPLE_IMAGE_SRC } from "@/lib/content/fields";
import { productFeedXml } from "@/lib/shop/feed";
import type { CatalogProduct } from "@/lib/shop/catalog";

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: "p1",
  name: "Ullpledd",
  slug: "ullpledd",
  description: "<p>Varmt pledd i <b>ull</b> &amp; lin.</p>",
  images: [
    { src: "/media/a/1.webp", alt: "Pledd" },
    { src: "/media/a/2.webp", alt: "" },
  ],
  options: [],
  vatRate: 25,
  categoryId: null,
  variants: [{ id: "v1", optionValues: [], label: "", priceOre: 89900, beforePriceOre: null, stock: null }],
  fromPriceOre: 89900,
  inStock: true,
  createdAt: "2026-10-31T00:00:00.000Z",
  ...overrides,
});

const feed = (products: CatalogProduct[]) => productFeedXml({ origin: "https://butikk.no", siteName: "Lin & Ull", products });

describe("produktfeed", () => {
  it("har feltene Google og Meta krever, med pris inkludert mva. og escapet tekst", () => {
    const xml = feed([product()]);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:id>v1</g:id>");
    expect(xml).toContain("<g:price>899.00 NOK</g:price>");
    expect(xml).toContain("<g:link>https://butikk.no/produkt/ullpledd</g:link>");
    expect(xml).toContain("<g:image_link>https://butikk.no/media/a/1.webp</g:image_link>");
    expect(xml).toContain("<g:additional_image_link>https://butikk.no/media/a/2.webp</g:additional_image_link>");
    expect(xml).toContain("<g:brand>Lin &#38; Ull</g:brand>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).not.toContain("<b>");
    expect(xml).not.toContain("<g:item_group_id>");
  });

  it("bruker førprisen som pris og dagens pris som salgspris", () => {
    const xml = feed([product({ variants: [{ id: "v1", optionValues: [], label: "", priceOre: 69900, beforePriceOre: 89900, stock: 3 }] })]);
    expect(xml).toContain("<g:price>899.00 NOK</g:price>");
    expect(xml).toContain("<g:sale_price>699.00 NOK</g:sale_price>");
  });

  it("gir én vare per variant, gruppert, med størrelse og farge", () => {
    const xml = feed([
      product({
        options: [
          { name: "Farge", values: ["Grå", "Blå"] },
          { name: "Størrelse", values: ["S", "M"] },
        ],
        variants: [
          { id: "v1", optionValues: ["Grå", "S"], label: "Grå, S", priceOre: 89900, beforePriceOre: null, stock: 0 },
          { id: "v2", optionValues: ["Blå", "M"], label: "Blå, M", priceOre: 89900, beforePriceOre: null, stock: 4 },
        ],
      }),
    ]);
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("<g:item_group_id>p1</g:item_group_id>");
    expect(xml).toContain("<g:title>Ullpledd, Grå, S</g:title>");
    expect(xml).toContain("<g:color>Grå</g:color><g:size>S</g:size>");
    expect(xml).toMatch(/<g:id>v1<\/g:id>.*<g:availability>out_of_stock<\/g:availability>/);
  });

  it("tar ikke med eksempelbilder", () => {
    const xml = feed([product({ images: [{ src: EXAMPLE_IMAGE_SRC, alt: "" }] })]);
    expect(xml).not.toContain("image_link");
  });
});

describe("strekkode i produktfeeden", () => {
  it("sender GTIN og varenummer når varen har det, ellers identifier_exists=no", () => {
    const withCode = feed([product({ variants: [{ id: "v1", optionValues: [], label: "", priceOre: 89900, beforePriceOre: null, stock: null, gtin: "7038010009457", sku: "PLEDD-1" }] })]);
    expect(withCode).toContain("<g:gtin>7038010009457</g:gtin>");
    expect(withCode).toContain("<g:mpn>PLEDD-1</g:mpn>");
    expect(withCode).not.toContain("identifier_exists");
    expect(feed([product()])).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });
});
