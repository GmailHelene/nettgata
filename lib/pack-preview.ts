import type { RenderContext } from "@/components/sections";
import { EXAMPLE_IMAGE_SRC } from "@/lib/content/fields";
import type { Pack, PackPage } from "@/lib/packs";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { readSiteInfo, type SiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";

/** Eksempelvarer, så nettbutikk-temaene viser varekort i galleriet. Finnes bare i forhåndsvisningen. */
const demoProducts: CatalogProduct[] = [
  ["Ullpledd", 89900],
  ["Keramikkopp", 34900],
  ["Lerretsveske", 24900],
  ["Duftlys", 29900],
  ["Skjerf i lin", 44900],
  ["Notatbok", 19900],
  ["Vase", 54900],
  ["Glassett", 39900],
].map(([name, priceOre], i) => ({
  id: `eksempel-${i}`,
  name: name as string,
  slug: `eksempel-${i}`,
  description: "",
  images: [{ src: EXAMPLE_IMAGE_SRC, alt: "" }],
  options: [],
  vatRate: 25,
  categoryId: null,
  variants: [{ id: `eksempel-${i}-v`, optionValues: [], label: "", priceOre: priceOre as number, beforePriceOre: i === 2 ? 32900 : null, stock: 10 }],
  fromPriceOre: priceOre as number,
  inStock: true,
  createdAt: new Date(2026, 9, 31 - i).toISOString(),
}));

/**
 * Sidene og rammen til en bransjepakke slik de blir for akkurat denne bedriften, før noe er lagret.
 * Brukes av temagalleriet i «Nytt nettsted», så kunden ser sitt eget navn og sin egen bransje.
 */
export function packPreview(pack: Pack, input: { name: string; info: Partial<SiteInfo> }): { pages: PackPage[]; ctx: RenderContext } {
  const name = input.name.trim() || "Ditt firma";
  const info = readSiteInfo(input.info);
  const pages = pack.pages({ name, city: info.city });
  const shop = pack.kind === "nettbutikk";
  const nav = pages.filter((p) => p.showInMenu).map((p) => ({ path: p.path, title: p.title }));
  // Som på et ekte nettsted (lib/render.ts): «Alle varer» står rett etter forsiden i en nettbutikk.
  if (shop && !nav.some((n) => n.path === "/produkter")) nav.splice(nav[0]?.path === "/" ? 1 : 0, 0, { path: "/produkter", title: "Alle varer" });
  return {
    pages,
    ctx: {
      site: { id: "forhandsvisning", name, info, schemaType: pack.schemaType },
      nav,
      path: "/",
      preview: true,
      basePath: "",
      shop,
      products: shop ? demoProducts : [],
      layout: readSiteLayout(pack.layout ?? {}),
    },
  };
}
