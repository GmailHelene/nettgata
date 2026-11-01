import type { CatalogProduct } from "./catalog";

export const sortOptions = [
  { value: "", label: "Anbefalt" },
  { value: "pris-lav", label: "Pris, lav til høy" },
  { value: "pris-hoy", label: "Pris, høy til lav" },
  { value: "nyeste", label: "Nyeste" },
] as const;

export type BrowseQuery = { sort: string; inStock: boolean; options: Record<string, string>; search?: string };

/** Små bokstaver uten aksenter, med æ, ø og å skrevet om, så «stol» finner «Stol» og «oy» finner «øy». */
const fold = (text: string) =>
  text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Leser søk, sortering og filtre fra adressen, f.eks. ?sok=pledd&sorter=pris-lav&lager=1&valg-farge=Blå */
export function parseBrowseQuery(query: Record<string, string | string[] | undefined>): BrowseQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("valg-") && first(value)) options[key.slice(5)] = first(value).slice(0, 40);
  }
  const sort = first(query.sorter);
  return {
    sort: sortOptions.some((o) => o.value === sort) ? sort : "",
    inStock: first(query.lager) === "1",
    options,
    search: first(query.sok).trim().slice(0, 80) || undefined,
  };
}

export const optionKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Alle valg som finnes blant varene, med verdier, til filtermenyen. */
export function availableFilters(products: CatalogProduct[]) {
  const map = new Map<string, { name: string; values: Set<string> }>();
  for (const p of products) {
    for (const o of p.options) {
      const key = optionKey(o.name);
      const entry = map.get(key) ?? { name: o.name, values: new Set<string>() };
      o.values.forEach((v) => entry.values.add(v));
      map.set(key, entry);
    }
  }
  return [...map.entries()].map(([key, v]) => ({ key, name: v.name, values: [...v.values] }));
}

/**
 * Filtrerer og sorterer i minnet. Det holder godt for små og mellomstore butikker
 * (noen hundre varer); større kataloger bør flyttes til databasespørringer.
 */
export function browse(products: CatalogProduct[], q: BrowseQuery): CatalogProduct[] {
  // Søket treffer når alle ordene finnes i navnet, beskrivelsen eller variantene.
  const words = fold(q.search ?? "").split(/\s+/).filter(Boolean);
  let result = products.filter((p) => {
    if (words.length) {
      const haystack = fold([p.name, p.description, ...p.options.flatMap((o) => o.values)].join(" "));
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    const matching = p.variants.filter((v) =>
      Object.entries(q.options).every(([key, value]) => {
        const index = p.options.findIndex((o) => optionKey(o.name) === key);
        return index === -1 ? false : v.optionValues[index] === value;
      }),
    );
    if (matching.length === 0) return false;
    if (q.inStock && !matching.some((v) => v.stock === null || v.stock > 0)) return false;
    return true;
  });
  if (q.sort === "pris-lav") result = [...result].sort((a, b) => a.fromPriceOre - b.fromPriceOre);
  if (q.sort === "pris-hoy") result = [...result].sort((a, b) => b.fromPriceOre - a.fromPriceOre);
  if (q.sort === "nyeste") result = [...result].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}
