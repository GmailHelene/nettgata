import Link from "next/link";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { Price } from "./price";

const href = (basePath: string, slug: string) => `${basePath}/produkt/${slug}`;

function stockLabel(p: CatalogProduct): { text: string; tone: "ok" | "out" } | null {
  if (!p.inStock) return { text: "Utsolgt", tone: "out" };
  const tracked = p.variants.filter((v) => v.stock !== null);
  if (tracked.length === p.variants.length && tracked.reduce((s, v) => s + (v.stock ?? 0), 0) <= 3) return { text: "Få igjen", tone: "ok" };
  return { text: "På lager", tone: "ok" };
}

export function ProductCard({ product: p, basePath }: { product: CatalogProduct; basePath: string }) {
  const [image, hover] = p.images;
  const variesInPrice = new Set(p.variants.map((v) => v.priceOre)).size > 1;
  const cheapest = p.variants.reduce((a, b) => (b.priceOre < a.priceOre ? b : a));
  const onSale = p.variants.some((v) => v.beforePriceOre);
  const stock = stockLabel(p);
  return (
    <Link href={href(basePath, p.slug)} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius)] bg-[var(--c-surface)]">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt={image.decorative ? "" : image.alt}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        )}
        {hover && (
          // Andre bilde vises ved hover, som i de fleste motebutikker.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hover.src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />
        )}
        {onSale && (
          <span className="absolute left-3 top-3 rounded-[var(--radius)] bg-[var(--c-primary)] px-2.5 py-1 text-xs font-semibold text-[var(--c-on-primary)]">Salg</span>
        )}
      </div>
      <h3 className="mt-3 font-medium leading-snug group-hover:underline">{p.name}</h3>
      <p className="mt-1">
        <Price priceOre={p.fromPriceOre} beforePriceOre={cheapest.beforePriceOre} from={variesInPrice} />
      </p>
      {stock && <p className={`mt-1 text-xs ${stock.tone === "out" ? "text-[var(--c-muted)]" : ""}`}>{stock.text}</p>}
    </Link>
  );
}

export function ProductGrid({ products, basePath }: { products: CatalogProduct[]; basePath: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} basePath={basePath} />
        </li>
      ))}
    </ul>
  );
}

/** Vannrett rad med sveip på mobil. Ren CSS (scroll snap), så den virker uten JavaScript. */
export function ProductCarousel({ products, basePath }: { products: CatalogProduct[]; basePath: string }) {
  return (
    <ul className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-5 px-5 pb-4 [scrollbar-width:thin]">
      {products.map((p) => (
        <li key={p.id} className="w-[45%] shrink-0 snap-start sm:w-[30%] lg:w-[23%]">
          <ProductCard product={p} basePath={basePath} />
        </li>
      ))}
    </ul>
  );
}
