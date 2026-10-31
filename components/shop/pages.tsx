import Link from "next/link";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { orderLines, orders, products, sites } from "@/db/schema";
import { Container, Heading } from "@/components/sections";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { formatNok } from "@/lib/shop/money";
import { paymentLabels, type PaymentMethod } from "@/lib/shop/settings";
import { AddToCart } from "./add-to-cart";
import { Checkout } from "./checkout";
import { ProductGrid } from "./product-grid";

export type ShopRoute =
  | { kind: "products" }
  | { kind: "product"; slug: string }
  | { kind: "cart" }
  | { kind: "order"; orderId: string };

export async function shopTitle(db: Db, site: typeof sites.$inferSelect, route: ShopRoute): Promise<string> {
  switch (route.kind) {
    case "products":
      return "Alle varer";
    case "cart":
      return "Handlekurv";
    case "order":
      return "Bestilling";
    case "product": {
      const [p] = await db
        .select({ name: products.name })
        .from(products)
        .where(and(eq(products.siteId, site.id), eq(products.slug, route.slug), eq(products.status, "active")))
        .limit(1);
      return p?.name ?? "Vare";
    }
  }
}

export function ProductsPage({
  products: items,
  categories,
  activeSlug,
  basePath,
}: {
  products: CatalogProduct[];
  categories: { name: string; slug: string }[];
  activeSlug: string | null;
  basePath: string;
}) {
  return (
    <section className="py-12">
      <Container>
        <Heading level={1}>Alle varer</Heading>
        {categories.length > 0 && (
          <nav aria-label="Kategorier" className="my-8 flex flex-wrap gap-2">
            <Link
              href={`${basePath}/produkter`}
              aria-current={activeSlug === null ? "page" : undefined}
              className="rounded-full border border-[var(--c-muted)]/50 px-4 py-1.5 aria-[current=page]:bg-[var(--c-primary)] aria-[current=page]:text-[var(--c-on-primary)]"
            >
              Alle
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`${basePath}/produkter?kategori=${encodeURIComponent(c.slug)}`}
                aria-current={activeSlug === c.slug ? "page" : undefined}
                className="rounded-full border border-[var(--c-muted)]/50 px-4 py-1.5 aria-[current=page]:bg-[var(--c-primary)] aria-[current=page]:text-[var(--c-on-primary)]"
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}
        <div className={categories.length ? "" : "mt-8"}>
          {items.length === 0 ? <p className="text-[var(--c-muted)]">Ingen varer her ennå.</p> : <ProductGrid products={items} basePath={basePath} />}
        </div>
      </Container>
    </section>
  );
}

export function ProductPage({ siteId, product, basePath }: { siteId: string; product: CatalogProduct; basePath: string }) {
  const [main, ...rest] = product.images;
  return (
    <section className="py-12">
      <Container className="grid gap-10 md:grid-cols-2">
        <div className="space-y-4">
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={main.src} alt={main.decorative ? "" : main.alt} className="aspect-square w-full rounded-[var(--radius)] object-cover" />
          ) : (
            <div className="aspect-square w-full rounded-[var(--radius)] bg-[var(--c-surface)]" />
          )}
          {rest.length > 0 && (
            <ul className="grid grid-cols-4 gap-3">
              {rest.map((img, i) => (
                <li key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.decorative ? "" : img.alt} loading="lazy" className="aspect-square w-full rounded-[var(--radius)] object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <Link href={`${basePath}/produkter`} className="text-sm underline">
            Alle varer
          </Link>
          <h1 className="mb-4 mt-3 font-[family-name:var(--f-heading)] text-3xl font-bold md:text-4xl">{product.name}</h1>
          <AddToCart siteId={siteId} product={product} cartHref={`${basePath}/handlekurv`} />
          {product.description && (
            <div className="mt-10 space-y-4 leading-relaxed">
              {product.description
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

export function CartPage({ siteId, basePath }: { siteId: string; basePath: string }) {
  return (
    <section className="py-12">
      <Container>
        <Heading level={1}>Handlekurv og kasse</Heading>
        <div className="mt-8">
          <Checkout siteId={siteId} basePath={basePath} preview={false} />
        </div>
      </Container>
    </section>
  );
}

const statusText: Record<string, string> = {
  pending_payment: "Mottatt, venter på betaling",
  paid: "Betalt",
  fulfilled: "Sendt eller hentet",
  cancelled: "Kansellert",
  refunded: "Refundert",
};

const paymentInstruction: Record<string, string> = {
  "ved-henting": "Du betaler når du henter varene.",
  faktura: "Du får faktura fra butikken.",
  test: "Dette var en testbetaling. Ingen penger er trukket.",
};

/** Kvitteringssiden. Krever den hemmelige nøkkelen fra lenken, så ingen kan se andres ordre. */
export async function OrderPage({ db, siteId, orderId, token, basePath }: { db: Db; siteId: string; orderId: string; token: string; basePath: string }) {
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f]{48}$/.test(token)) return null;
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order || order.accessToken !== token) return null;
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));

  return (
    <section className="py-12">
      <Container className="max-w-3xl">
        <Heading level={1}>Takk for bestillingen!</Heading>
        <p className="text-lg">
          Ordrenummer <strong>{order.number}</strong> · {statusText[order.status]}
        </p>
        <p className="mt-2 text-[var(--c-muted)]">
          {paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}. {paymentInstruction[order.paymentMethod] ?? ""} Ta vare på
          denne siden, lenken viser bestillingen din.
        </p>

        <div className="mt-8 rounded-[var(--radius)] bg-[var(--c-surface)] p-6">
          <ul className="divide-y divide-[var(--c-muted)]/30">
            {lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-4 py-3">
                <span>
                  {l.quantity} × {l.name}
                  {l.variantLabel && <span className="block text-sm text-[var(--c-muted)]">{l.variantLabel}</span>}
                </span>
                <span>{formatNok(l.totalOre)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-[var(--c-muted)]/30 pt-4">
            <div className="flex justify-between">
              <dt>Levering: {order.shipping.name}</dt>
              <dd>{order.shippingOre === 0 ? "Gratis" : formatNok(order.shippingOre)}</dd>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <dt>Totalt</dt>
              <dd>{formatNok(order.totalOre)}</dd>
            </div>
            <div className="flex justify-between text-sm text-[var(--c-muted)]">
              <dt>Herav MVA</dt>
              <dd>{formatNok(order.vatOre)}</dd>
            </div>
          </dl>
        </div>

        {order.shippingAddress && (
          <div className="mt-6">
            <h2 className="mb-2 font-semibold">Leveres til</h2>
            <address className="not-italic">
              {order.shippingAddress.name}
              <br />
              {order.shippingAddress.street}
              <br />
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
            </address>
          </div>
        )}

        <p className="mt-8">
          <Link href={`${basePath}/produkter`} className="font-semibold underline">
            Fortsett å handle
          </Link>
        </p>
      </Container>
    </section>
  );
}
