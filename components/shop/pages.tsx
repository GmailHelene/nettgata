import Link from "next/link";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { orderLines, orders, products, sites } from "@/db/schema";
import { Container, Heading } from "@/components/sections";
import { mediaSrcPattern } from "@/lib/media-types";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { formatNok } from "@/lib/shop/money";
import { carrierLabel, trackingUrl } from "@/lib/shop/tracking";
import { isOnlinePayment, paymentInstructions, paymentLabels, type PaymentMethod, type ShopSettings } from "@/lib/shop/settings";
import { parsePaymentRef } from "@/lib/payments/common";
import { AddToCart } from "./add-to-cart";
import { Checkout, ForgetCartAfterPayment } from "./checkout";
import { Gallery } from "./gallery";
import { BrowseControls } from "./browse-controls";
import { availableFilters, browse, type BrowseQuery } from "@/lib/shop/browse";
import { ProductGrid } from "./product-grid";

export type ShopRoute =
  | { kind: "products" }
  | { kind: "product"; slug: string }
  | { kind: "cart" }
  | { kind: "order"; orderId: string };

/** Kort beskrivelse for Google og deling: hele ord, maks rundt 160 tegn. */
function summarize(text: string, max = 160): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (clean.length <= max) return clean;
  const short = clean.slice(0, max - 1);
  return `${short.slice(0, Math.max(short.lastIndexOf(" "), max / 2)).trimEnd()} …`;
}

export type ShopMeta = { title: string; description?: string; image?: { src: string; alt: string } };

/** Tittel, beskrivelse og delingsbilde for butikkens egne sider. Varesiden bruker varens første bilde. */
export async function shopMeta(db: Db, site: typeof sites.$inferSelect, route: ShopRoute): Promise<ShopMeta> {
  switch (route.kind) {
    case "products":
      return { title: "Alle varer" };
    case "cart":
      return { title: "Handlekurv" };
    case "order":
      return { title: "Bestilling" };
    case "product": {
      const [p] = await db
        .select({ name: products.name, description: products.description, images: products.images })
        .from(products)
        .where(and(eq(products.siteId, site.id), eq(products.slug, route.slug), eq(products.status, "active")))
        .limit(1);
      if (!p) return { title: "Vare" };
      const image = p.images.find((i) => mediaSrcPattern.test(i.src));
      return {
        title: p.name,
        description: summarize(p.description),
        image: image && { src: image.src, alt: image.decorative ? "" : image.alt },
      };
    }
  }
}

export function ProductsPage({
  products: all,
  categories,
  activeSlug,
  basePath,
  query,
}: {
  products: CatalogProduct[];
  categories: { name: string; slug: string }[];
  activeSlug: string | null;
  basePath: string;
  query: BrowseQuery;
}) {
  const items = browse(all, query);
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
          {all.length > 0 && (
            <BrowseControls action={`${basePath}/produkter`} category={activeSlug} query={query} filters={availableFilters(all)} count={items.length} />
          )}
          {items.length === 0 ? <p className="text-[var(--c-muted)]">{all.length ? "Ingen varer passer filtrene." : "Ingen varer her ennå."}</p> : (
            <>
              <h2 className="sr-only">Varer</h2>
              <ProductGrid products={items} basePath={basePath} />
            </>
          )}
        </div>
      </Container>
    </section>
  );
}

function Accordion({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-[var(--c-muted)]/25 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
        {title}
        <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-3 space-y-3 leading-relaxed text-[var(--c-text)]">{children}</div>
    </details>
  );
}

/** Produktdata for Google: pris, valuta og lagerstatus per variant. */
function ProductStructuredData({ product, url, siteName }: { product: CatalogProduct; url: string; siteName: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description.slice(0, 500) || undefined,
    // Google vil ha fulle adresser til bildene, ikke /media/... alene.
    image: product.images.map((i) => new URL(i.src, url).toString()),
    brand: { "@type": "Brand", name: siteName },
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      url,
      priceCurrency: "NOK",
      price: (v.priceOre / 100).toFixed(2),
      availability: v.stock === null || v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      ...(v.label && { name: v.label }),
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function ProductPage({
  siteId,
  siteName,
  product,
  basePath,
  settings,
  origin,
}: {
  siteId: string;
  siteName: string;
  product: CatalogProduct;
  basePath: string;
  settings: ShopSettings;
  origin: string;
}) {
  const paragraphs = product.description.split(/\n\s*\n/).filter(Boolean);
  return (
    <section className="py-8 md:py-12">
      {!basePath && <ProductStructuredData product={product} url={`${origin}/produkt/${product.slug}`} siteName={siteName} />}
      <Container>
        <nav aria-label="Brødsmuler" className="mb-6 text-sm text-[var(--c-muted)]">
          <Link href={`${basePath}/`} className="hover:underline">
            Forside
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={`${basePath}/produkter`} className="hover:underline">
            Alle varer
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{product.name}</span>
        </nav>
        <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
          <Gallery images={product.images} />
          <div className="md:sticky md:top-28 md:self-start">
            <h1 className="mb-4 font-[family-name:var(--f-heading)] text-3xl font-bold leading-tight md:text-4xl">{product.name}</h1>
            <AddToCart siteId={siteId} product={product} cartHref={`${basePath}/handlekurv`} />
            <div className="mt-10 border-t border-[var(--c-muted)]/25">
              {paragraphs.length > 0 && (
                <Accordion title="Beskrivelse" open>
                  {paragraphs.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </Accordion>
              )}
              <Accordion title="Levering">
                <ul className="space-y-1">
                  {settings.shippingOptions.map((o) => (
                    <li key={o.code} className="flex justify-between gap-4">
                      <span>{o.name}</span>
                      <span>{o.priceOre === 0 ? "Gratis" : formatNok(o.priceOre)}</span>
                    </li>
                  ))}
                </ul>
                {settings.freeShippingOverOre !== null && <p>Gratis frakt ved kjøp over {formatNok(settings.freeShippingOverOre)}.</p>}
              </Accordion>
              <Accordion title="Angrerett og retur">
                <p>
                  Du har 14 dagers angrerett, regnet fra dagen etter at du får varen.{" "}
                  <Link href={`${basePath}${settings.termsPath}`} className="underline">
                    Les kjøpsvilkårene
                  </Link>
                  .
                </p>
              </Accordion>
            </div>
          </div>
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

/** Kvitteringssiden. Krever den hemmelige nøkkelen fra lenken, så ingen kan se andres ordre. */
export async function OrderPage({ db, siteId, orderId, token, basePath }: { db: Db; siteId: string; orderId: string; token: string; basePath: string }) {
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !/^[0-9a-f]{48}$/.test(token)) return null;
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.siteId, siteId))).limit(1);
  if (!order || order.accessToken !== token) return null;
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));

  const label = paymentLabels[order.paymentMethod as PaymentMethod] ?? order.paymentMethod;
  const online = isOnlinePayment(order.paymentMethod);
  // Vipps og Klarna i testmiljøet: ingen ekte penger. Det skal kunden (og butikken som tester) se.
  const testMode = online && parsePaymentRef(order.paymentRef)?.environment === "test";
  const waiting = online && order.status === "pending_payment";
  const cancelled = order.status === "cancelled";
  const paidOnline = online && (order.status === "paid" || order.status === "fulfilled");

  let paymentText = `${label}. ${paymentInstructions[order.paymentMethod as PaymentMethod] ?? ""}`;
  if (online) {
    const after =
      order.status === "paid"
        ? order.paymentMethod === "vipps"
          ? " Beløpet er reservert og trekkes når varene sendes eller hentes."
          : " Klarna sender deg informasjon om betalingen når varene er sendt."
        : order.status === "refunded"
          ? " Pengene er betalt tilbake til deg."
          : "";
    paymentText = `Betalt med ${label}.${after}`;
  }
  if (testMode) paymentText += " Dette var en betaling i testmiljøet, og ingen ekte penger er trukket.";

  return (
    <section className="py-12">
      <Container className="max-w-3xl">
        {paidOnline && <ForgetCartAfterPayment siteId={siteId} orderId={order.id} />}
        <Heading level={1}>{waiting ? "Betalingen er ikke fullført ennå" : cancelled ? "Bestillingen er kansellert" : "Takk for bestillingen!"}</Heading>
        <p className="text-lg">
          Ordrenummer <strong>{order.number}</strong> · {statusText[order.status]}
        </p>
        {waiting ? (
          <div className="mt-4 space-y-4 rounded-[var(--radius)] border-2 border-[var(--c-text)] p-5">
            <p>
              Vi har ikke fått bekreftet betalingen fra {label}. Har du nettopp betalt, kan det ta et lite øyeblikk.
              {testMode && " Dette er en betaling i testmiljøet, og ingen ekte penger trekkes."}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={`/api/betaling/retur?ordre=${order.id}&t=${order.accessToken}`}
                className="rounded-[var(--radius)] bg-[var(--c-primary)] px-5 py-3 font-semibold text-[var(--c-on-primary)]"
              >
                Sjekk betalingen på nytt
              </a>
              <form method="post" action="/api/betaling/avbryt">
                <input type="hidden" name="ordre" value={order.id} />
                <input type="hidden" name="t" value={order.accessToken} />
                <button className="font-semibold underline">Avbryt og velg en annen betalingsmåte</button>
              </form>
            </div>
            <p className="text-sm text-[var(--c-muted)]">
              Varene holdes av en stund. Blir ikke betalingen fullført, kanselleres bestillingen av seg selv, og ingen penger trekkes.
            </p>
          </div>
        ) : cancelled ? (
          <p className="mt-2">
            {order.paidAt
              ? online
                ? `Du får pengene tilbake fra ${label}.`
                : "Har du betalt, får du pengene tilbake fra butikken."
              : online
                ? "Betalingen ble ikke fullført, så ingen penger er trukket. Varene ligger fortsatt i handlekurven hvis du vil prøve igjen."
                : "Ingen penger er trukket."}{" "}
            {online && !order.paidAt && (
              <Link href={`${basePath}/handlekurv`} className="font-semibold underline">
                Gå til handlekurven
              </Link>
            )}
          </p>
        ) : (
          <p className="mt-2 text-[var(--c-muted)]">{paymentText.trim()} Ta vare på denne siden, lenken viser bestillingen din.</p>
        )}

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
            {order.discountOre > 0 && (
              <div className="flex justify-between">
                <dt>Rabatt ({order.discountCode})</dt>
                <dd>−{formatNok(order.discountOre)}</dd>
              </div>
            )}
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

        {order.trackingNumber && (
          <div className="mt-6">
            <h2 className="mb-2 font-semibold">Sporing</h2>
            <p>
              {carrierLabel(order.trackingCarrier)}: {order.trackingNumber}
              {trackingUrl(order.trackingCarrier, order.trackingNumber) && (
                <>
                  {" "}
                  <a href={trackingUrl(order.trackingCarrier, order.trackingNumber)!} target="_blank" rel="noreferrer" className="font-semibold underline">
                    Spor pakken
                  </a>
                </>
              )}
            </p>
          </div>
        )}

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
