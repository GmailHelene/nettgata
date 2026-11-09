import type { RenderContext } from "@/components/sections";
import { EXAMPLE_IMAGE_SRC } from "@/lib/content/fields";
import type { Pack, PackPage } from "@/lib/packs";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { readSiteInfo, type SiteInfo } from "@/lib/site-info";
import { readSiteLayout } from "@/lib/site-layout";

/** Eksempelvarer, så nettbutikk-temaene viser varekort i galleriet. Finnes bare i forhåndsvisningen. */
const demoCatalogs: Record<string, [string, number][]> = {
  klaer: [["Strikkegenser", 89900], ["Linskjorte", 69900], ["Jeans", 99900], ["Ullskjerf", 44900], ["Sommerkjole", 79900], ["Skinnbelte", 39900], ["Bomullstopp", 29900], ["Vårjakke", 149900]],
  interior: [["Vase", 54900], ["Lysestake", 34900], ["Pute i lin", 44900], ["Veggspeil", 129900], ["Keramikkfat", 39900], ["Ullpledd", 89900], ["Duftlys", 29900], ["Krukke", 24900]],
  lokalmat: [["Honning", 14900], ["Eplemost", 8900], ["Spekepølse", 12900], ["Geitost", 11900], ["Flatbrød", 6900], ["Bringebærsyltetøy", 9900], ["Poteter 2 kg", 5900], ["Egg, 12 stk", 7900]],
  nettbutikk: [["Ullpledd", 89900], ["Keramikkopp", 34900], ["Lerretsveske", 24900], ["Duftlys", 29900], ["Skjerf i lin", 44900], ["Notatbok", 19900], ["Vase", 54900], ["Glassett", 39900]],
};

const demoProducts = (packKey: string): CatalogProduct[] => (demoCatalogs[packKey] ?? demoCatalogs.nettbutikk).map(([name, priceOre], i) => ({
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

/** Bytter «Skriv ...»-tekstene med ferdig eksempeltekst, så miniaturene på salgssidene ikke ser uferdige ut. */
export function withDemoText<T>(value: T): T {
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^Skriv (?!til\b|en melding\b)/.test(text)) return value;
    const filled = /pris/i.test(text) ? "Fra 490 kr" : /^Skriv navn/.test(text) ? "Kari Nordmann" : /^Skriv rolle/.test(text) ? "Daglig leder" : "Her står din egen tekst om bedriften.";
    return filled as T;
  }
  if (Array.isArray(value)) return value.map(withDemoText) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withDemoText(v)])) as T;
  return value;
}

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
      products: shop ? demoProducts(pack.key) : [],
      layout: readSiteLayout(pack.layout ?? {}),
    },
  };
}
