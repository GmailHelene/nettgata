import { EXAMPLE_IMAGE_SRC } from "@/lib/content/fields";
import type { CatalogProduct } from "./catalog";

/**
 * Produktfeed for Google Merchant Center og Meta (Facebook og Instagram), som RSS 2.0 med g:-feltene begge leser.
 * Én vare per variant, gruppert med item_group_id. Prisene i katalogen er inkludert mva., slik Google krever i Norge.
 * Har en variant førpris, blir førprisen g:price og dagens pris g:sale_price.
 */

const escape = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const nok = (ore: number) => `${(ore / 100).toFixed(2)} NOK`;

/** Brødtekst uten tagger og ekstra mellomrom. Google tillater 5000 tegn. */
const plain = (text: string, max: number) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function variantAttributes(product: CatalogProduct, optionValues: string[]): string[] {
  return product.options.flatMap((option, i) => {
    const value = optionValues[i];
    if (!value) return [];
    if (/størrelse|str\.?$|size/i.test(option.name)) return [`<g:size>${escape(value)}</g:size>`];
    if (/farge|colou?r/i.test(option.name)) return [`<g:color>${escape(value)}</g:color>`];
    return [];
  });
}

export function productFeedXml({ origin, siteName, products }: { origin: string; siteName: string; products: CatalogProduct[] }): string {
  const items = products.flatMap((product) => {
    const images = product.images.filter((img) => img.src && img.src !== EXAMPLE_IMAGE_SRC).map((img) => `${origin}${img.src}`);
    const link = `${origin}/produkt/${encodeURIComponent(product.slug)}`;
    const description = plain(product.description, 5000) || product.name;
    const grouped = product.variants.length > 1;
    return product.variants.map((variant) => {
      const title = plain(variant.label && grouped ? `${product.name}, ${variant.label}` : product.name, 150);
      const onSale = variant.beforePriceOre !== null && variant.beforePriceOre > variant.priceOre;
      const inStock = variant.stock === null || variant.stock > 0;
      const fields = [
        `<g:id>${escape(variant.id)}</g:id>`,
        `<g:title>${escape(title)}</g:title>`,
        `<g:description>${escape(description)}</g:description>`,
        `<g:link>${escape(link)}</g:link>`,
        ...(images[0] ? [`<g:image_link>${escape(images[0])}</g:image_link>`] : []),
        ...images.slice(1, 11).map((src) => `<g:additional_image_link>${escape(src)}</g:additional_image_link>`),
        `<g:availability>${inStock ? "in_stock" : "out_of_stock"}</g:availability>`,
        `<g:price>${nok(onSale ? variant.beforePriceOre! : variant.priceOre)}</g:price>`,
        ...(onSale ? [`<g:sale_price>${nok(variant.priceOre)}</g:sale_price>`] : []),
        `<g:brand>${escape(siteName)}</g:brand>`,
        "<g:condition>new</g:condition>",
        // Med strekkode får Google den. Uten skal Google få vite at den mangler, ellers avvises varen.
        ...(variant.gtin ? [`<g:gtin>${escape(variant.gtin)}</g:gtin>`] : ["<g:identifier_exists>no</g:identifier_exists>"]),
        ...(variant.sku ? [`<g:mpn>${escape(variant.sku)}</g:mpn>`] : []),
        ...(grouped ? [`<g:item_group_id>${escape(product.id)}</g:item_group_id>`, ...variantAttributes(product, variant.optionValues)] : []),
      ];
      return `<item>${fields.join("")}</item>`;
    });
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    `<title>${escape(siteName)}</title><link>${escape(origin)}</link><description>${escape(`Varer fra ${siteName}`)}</description>` +
    items.join("") +
    `</channel></rss>`
  );
}
