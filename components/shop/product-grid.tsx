import Link from "next/link";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { Price } from "./price";

const href = (basePath: string, slug: string) => `${basePath}/produkt/${slug}`;

export function ProductGrid({ products, basePath }: { products: CatalogProduct[]; basePath: string }) {
  return (
    <ul className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => {
        const image = p.images[0];
        const variesInPrice = new Set(p.variants.map((v) => v.priceOre)).size > 1;
        const cheapest = p.variants.reduce((a, b) => (b.priceOre < a.priceOre ? b : a));
        return (
          <li key={p.id}>
            <Link href={href(basePath, p.slug)} className="group block">
              <div className="aspect-square overflow-hidden rounded-[var(--radius)] bg-[var(--c-surface)]">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.src}
                    alt={image.decorative ? "" : image.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                )}
              </div>
              <h3 className="mt-3 font-semibold group-hover:underline">{p.name}</h3>
              <p className="mt-1">
                <Price priceOre={p.fromPriceOre} beforePriceOre={cheapest.beforePriceOre} from={variesInPrice} />
              </p>
              {!p.inStock && <p className="mt-1 text-sm text-[var(--c-muted)]">Utsolgt</p>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
