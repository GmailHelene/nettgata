import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { PageContent, Section } from "@/lib/content/types";
import { EXAMPLE_IMAGE_SRC, isSafeHref, type ImageValue } from "@/lib/content/fields";
import { sectionRegistry } from "@/lib/content/registry";
import { focusStyle, mediaSrcPattern, mediaSrcSet } from "@/lib/media-types";
import { formatAddress, formatOrgnr, type SiteInfo } from "@/lib/site-info";
import { ContactForm } from "./contact-form";
import { BookingEmbed } from "./booking-embed";
import { embeddableHost } from "@/lib/booking";
import { CartDrawer } from "@/components/shop/cart-drawer";
import { MobileMenu } from "@/components/site/mobile-menu";
import { socialLabels, type SiteLayout } from "@/lib/site-layout";
import { ProductCarousel, ProductGrid } from "@/components/shop/product-grid";
import type { CatalogProduct } from "@/lib/shop/catalog";
import { themeRootProps, type Theme } from "@/lib/theme";

type Props = Record<string, unknown>;
/** Luft over og under en seksjon. Temaets «luft» skalerer den (--space). */
const pad = "py-[calc(3.5rem*var(--space,1))]";
const str = (p: Props, key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
const list = (p: Props, key: string) => (Array.isArray(p[key]) ? (p[key] as Props[]) : []);
const image = (p: Props, key: string): ImageValue | null => {
  const v = p[key] as ImageValue | null | undefined;
  return v && typeof v.src === "string" && (mediaSrcPattern.test(v.src) || v.src === EXAMPLE_IMAGE_SRC) ? v : null;
};

/**
 * Hvor bredt bildet vises, så nettleseren henter riktig størrelse. Innholdet er maks 984 px bredt
 * (max-w-5xl minus marg), og tallene følger rutenettene i seksjonene.
 */
const imageSizes = {
  full: "100vw",
  half: "(min-width: 1024px) 472px, (min-width: 768px) calc(50vw - 40px), calc(100vw - 40px)",
  third: "(min-width: 1024px) 317px, (min-width: 768px) calc(33vw - 24px), calc(50vw - 28px)",
  quarter: "(min-width: 1024px) 231px, (min-width: 768px) calc(33vw - 27px), calc(50vw - 30px)",
} as const;

/** Bilder fra eget lager. next/image brukes ikke fordi bildene allerede er krympet til WebP ved opplasting. */
function Img({
  value,
  className = "",
  eager = false,
  sizes,
}: {
  value: ImageValue;
  className?: string;
  eager?: boolean;
  /** Uten sizes hentes bare originalen, for eksempel for logoen. */
  sizes?: (typeof imageSizes)[keyof typeof imageSizes];
}) {
  if (value.src === EXAMPLE_IMAGE_SRC) {
    // Eksempelbilde fra seksjonsbiblioteket og bransjepakkene. Finnes bare i kladder, fordi publisering stopper det.
    // Tegnes som et landskap i temaets farger (ng-art i globals.css), med et lite bildeikon som viser at det skal byttes.
    return (
      <div role="img" aria-label="Eksempelbilde" className={`${className} ng-art relative`}>
        <svg
          className="absolute bottom-3 left-3 text-[var(--c-text)] opacity-35"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M3 17l5-5 4 4 3-3 6 6" />
        </svg>
      </div>
    );
  }
  const srcSet = sizes ? mediaSrcSet(value.src) : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={value.src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={value.decorative ? "" : value.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className}
      style={focusStyle(value.focus)}
    />
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((para, i) => (
          <p key={i} className="mb-4 leading-relaxed last:mb-0">
            {para}
          </p>
        ))}
    </>
  );
}

/** Interne lenker får nettstedets grunnsti, slik at de virker både på eget domene og under /vis/<slug>. */
export function siteHref(basePath: string, href: string): string {
  if (!basePath || !href.startsWith("/") || href.startsWith("//")) return href;
  return href === "/" ? basePath : `${basePath}${href}`;
}

function Button({ href, basePath, children }: { href: string; basePath: string; children: ReactNode }) {
  if (!href || !isSafeHref(href)) return null;
  return (
    // Utseendet styres av temaet (ng-btn og data-knapper i globals.css).
    <a href={siteHref(basePath, href)} className="ng-btn">
      {children}
    </a>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-5xl px-5 ${className}`}>{children}</div>;
}

/**
 * `level` styrer utseendet. `first` gjør overskriften til sidens H1 uten å endre utseendet, så en side
 * som starter med for eksempel en tekstseksjon også har én hovedoverskrift for Google og skjermlesere.
 */
export function Heading({ children, level = 2, first = false }: { children: ReactNode; level?: 1 | 2; first?: boolean }) {
  const Tag = level === 1 || first ? "h1" : "h2";
  // Font, vekt, store bokstaver og størrelse kommer fra temaet (ng-h i globals.css).
  return <Tag className={`ng-h ${level === 1 ? "ng-h1" : "ng-h2 mb-6"}`}>{children}</Tag>;
}

function Hero({ section, isFirst, basePath }: { section: Section; isFirst: boolean; basePath: string }) {
  const p = section.props;
  const bilde = image(p, "bilde");
  const variant = bilde ? section.variant : section.variant === "sentrert" ? "sentrert" : "standard";
  const centered = variant === "sentrert" || variant === "bakgrunn";
  const text = (
    <div className={centered ? "mx-auto max-w-3xl" : "max-w-3xl"}>
      <Heading level={isFirst ? 1 : 2}>{str(p, "overskrift")}</Heading>
      {str(p, "undertekst") && (
        <p className={`mt-5 text-lg ${variant === "bakgrunn" ? "text-white" : "text-[var(--c-muted)]"}`}>{str(p, "undertekst")}</p>
      )}
      {str(p, "knappTekst") && (
        <div className="mt-8">
          <Button href={str(p, "knappLenke")} basePath={basePath}>
            {str(p, "knappTekst")}
          </Button>
        </div>
      )}
    </div>
  );

  if (variant === "bakgrunn" && bilde) {
    // Mørk hinne over bildet sikrer lesbar hvit tekst uansett hva bildet viser.
    return (
      <section className="ng-hero-dark relative isolate overflow-hidden py-[calc(7rem*var(--space,1))] text-center text-white md:py-[calc(10rem*var(--space,1))]">
        <Img value={bilde} eager={isFirst} sizes={imageSizes.full} className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/60" />
        <Container>{text}</Container>
      </section>
    );
  }
  if (variant === "bilde" && bilde) {
    return (
      <section className="py-[calc(4rem*var(--space,1))] md:py-[calc(6rem*var(--space,1))]">
        <Container className="grid items-center gap-10 md:grid-cols-2">
          {text}
          <Img value={bilde} eager={isFirst} sizes={imageSizes.half} className="ng-feature aspect-[4/3] w-full object-cover" />
        </Container>
      </section>
    );
  }
  return (
    <section className="py-[calc(5rem*var(--space,1))] md:py-[calc(7rem*var(--space,1))]">
      <Container className={centered ? "text-center" : ""}>{text}</Container>
    </section>
  );
}

function BildeTekst({ section, basePath, first }: { section: Section; basePath: string; first: boolean }) {
  const p = section.props;
  const bilde = image(p, "bilde");
  const imageFirst = section.variant !== "bilde-hoyre";
  return (
    <section className={pad}>
      <Container className="grid items-center gap-10 md:grid-cols-2">
        {bilde && (
          <Img value={bilde} sizes={imageSizes.half} className={`ng-feature aspect-[4/3] w-full object-cover ${imageFirst ? "" : "md:order-2"}`} />
        )}
        <div>
          {str(p, "overskrift") && <Heading first={first}>{str(p, "overskrift")}</Heading>}
          <Paragraphs text={str(p, "brodtekst")} />
          {str(p, "knappTekst") && (
            <div className="mt-6">
              <Button href={str(p, "knappLenke")} basePath={basePath}>
                {str(p, "knappTekst")}
              </Button>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

function Galleri({ section, first }: { section: Section; first: boolean }) {
  const p = section.props;
  const items = list(p, "bilder")
    .map((item) => ({ bilde: image(item, "bilde"), tekst: str(item, "tekst") }))
    .filter((i): i is { bilde: ImageValue; tekst: string } => i.bilde !== null);
  const large = section.variant === "store";
  return (
    <section className={pad}>
      <Container>
        {str(p, "overskrift") && <Heading first={first}>{str(p, "overskrift")}</Heading>}
        <ul className={`grid gap-4 ${large ? "md:grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
          {items.map((item, i) => (
            <li key={i}>
              <figure>
                <Img
                  value={item.bilde}
                  sizes={large ? imageSizes.half : imageSizes.third}
                  className="aspect-square w-full rounded-[var(--radius)] object-cover"
                />
                {item.tekst && <figcaption className="mt-2 text-sm text-[var(--c-muted)]">{item.tekst}</figcaption>}
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Omtaler({ section, first }: { section: Section; first: boolean }) {
  const p = section.props;
  return (
    <section className={pad}>
      <Container>
        <Heading first={first}>{str(p, "overskrift")}</Heading>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {list(p, "omtaler").map((o, i) => (
            <li key={i}>
              <figure className="ng-card h-full p-6">
                <blockquote className="leading-relaxed">«{str(o, "sitat")}»</blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold">{str(o, "navn")}</span>
                  {str(o, "sted") && <span className="text-[var(--c-muted)]">, {str(o, "sted")}</span>}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Faq({ section, first }: { section: Section; first: boolean }) {
  const p = section.props;
  return (
    <section className={pad}>
      <Container>
        <div className="max-w-3xl">
          <Heading first={first}>{str(p, "overskrift")}</Heading>
          <div className="divide-y divide-[var(--c-muted)]/30 border-y border-[var(--c-muted)]/30">
            {list(p, "sporsmal").map((q, i) => (
              <details key={i} className="group py-4">
                <summary className="cursor-pointer list-none font-semibold">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                  {str(q, "sporsmal")}
                </summary>
                <div className="mt-3 pl-5">
                  <Paragraphs text={str(q, "svar")} />
                </div>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

function Tekst({ section, first }: { section: Section; first: boolean }) {
  const p = section.props;
  return (
    <section className={pad}>
      <Container>
        <div className="max-w-3xl">
          {str(p, "overskrift") && <Heading first={first}>{str(p, "overskrift")}</Heading>}
          <Paragraphs text={str(p, "brodtekst")} />
        </div>
      </Container>
    </section>
  );
}

function Tjenester({ section, first }: { section: Section; first: boolean }) {
  const p = section.props;
  const items = list(p, "tjenester");
  return (
    <section className={pad}>
      <Container>
        <Heading first={first}>{str(p, "overskrift")}</Heading>
        {section.variant === "liste" ? (
          <dl className="divide-y divide-[var(--c-muted)]/30 border-y border-[var(--c-muted)]/30">
            {items.map((item, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                <dt className="font-semibold">{str(item, "navn")}</dt>
                <dd>{str(item, "pris")}</dd>
                {str(item, "beskrivelse") && <dd className="w-full text-sm text-[var(--c-muted)]">{str(item, "beskrivelse")}</dd>}
              </div>
            ))}
          </dl>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <li key={i} className="ng-card p-6">
                <h3 className="ng-h3 text-lg">{str(item, "navn")}</h3>
                {str(item, "beskrivelse") && <p className="mt-2 text-[var(--c-muted)]">{str(item, "beskrivelse")}</p>}
                {str(item, "pris") && <p className="mt-4 font-semibold">{str(item, "pris")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

function Produkter({ section, ctx, first }: { section: Section; ctx: RenderContext; first: boolean }) {
  const p = section.props;
  if (!ctx.shop) return null;
  const all = ctx.products;
  const selection = str(p, "utvalg") || "utvalgte";
  const items = (
    selection === "nyeste"
      ? [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : selection === "salg"
        ? all.filter((x) => x.variants.some((v) => v.beforePriceOre))
        : selection === "lager"
          ? all.filter((x) => x.inStock)
          : all
  ).slice(0, section.variant === "karusell" ? 12 : 8);
  return (
    <section className={pad}>
      <Container>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <Heading first={first}>{str(p, "overskrift")}</Heading>
          {str(p, "knappTekst") && (
            <Link href={siteHref(ctx.basePath, "/produkter")} className="mb-6 font-semibold underline underline-offset-4">
              {str(p, "knappTekst")} →
            </Link>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-[var(--c-muted)]">Varene kommer snart.</p>
        ) : section.variant === "karusell" ? (
          <ProductCarousel products={items} basePath={ctx.basePath} />
        ) : (
          <ProductGrid products={items} basePath={ctx.basePath} />
        )}
      </Container>
    </section>
  );
}

function Fordeler({ section, first }: { section: Section; first: boolean }) {
  const p = section.props;
  const items = list(p, "punkter");
  const cards = section.variant === "kort";
  return (
    <section className={cards ? pad : "py-[calc(2rem*var(--space,1))]"}>
      <Container>
        {str(p, "overskrift") && <Heading first={first}>{str(p, "overskrift")}</Heading>}
        <ul className={`grid gap-6 ${items.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          {items.map((item, i) => (
            <li key={i} className={`flex gap-3 ${cards ? "ng-card p-6" : "items-start"}`}>
              <svg
                className="mt-0.5 shrink-0 text-[var(--c-accent)]"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <div>
                <p className="font-semibold">{str(item, "tittel")}</p>
                {str(item, "tekst") && <p className="mt-1 text-sm text-[var(--c-muted)]">{str(item, "tekst")}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Kategorikort({ section, basePath, first }: { section: Section; basePath: string; first: boolean }) {
  const p = section.props;
  const items = list(p, "kort").map((k) => ({
    tittel: str(k, "tittel"),
    tekst: str(k, "tekst"),
    lenke: str(k, "lenke"),
    bilde: image(k, "bilde"),
  }));
  const large = section.variant === "store";
  return (
    <section className={pad}>
      <Container>
        {str(p, "overskrift") && <Heading first={first}>{str(p, "overskrift")}</Heading>}
        <ul className={`grid gap-5 ${large ? "md:grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}`}>
          {items.map((k, i) => (
            <li key={i}>
              <a
                href={isSafeHref(k.lenke) ? siteHref(basePath, k.lenke) : "#"}
                className="group relative block overflow-hidden rounded-[var(--radius)]"
              >
                {k.bilde ? (
                  <Img
                    value={{ ...k.bilde, decorative: true }}
                    sizes={large ? imageSizes.half : imageSizes.quarter}
                    className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${large ? "aspect-[4/3]" : "aspect-[4/5]"}`}
                  />
                ) : (
                  <div className={`w-full bg-[var(--c-surface)] ${large ? "aspect-[4/3]" : "aspect-[4/5]"}`} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="ng-h3 text-xl">{k.tittel}</p>
                  {k.tekst && <p className="mt-1 text-sm text-white/90">{k.tekst}</p>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

const postDate = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" });

function Blogg({ section, ctx, first }: { section: Section; ctx: RenderContext; first: boolean }) {
  const p = section.props;
  const antall = str(p, "antall") || "3";
  const posts = (ctx.posts ?? []).slice(0, antall === "alle" ? undefined : Number(antall) || 3);
  const date = (post: PostSummary) => (
    <time dateTime={post.date} className="text-sm text-[var(--c-muted)]">
      {postDate.format(new Date(post.date))}
    </time>
  );
  return (
    <section className={pad}>
      <Container>
        {str(p, "overskrift") && <Heading first={first}>{str(p, "overskrift")}</Heading>}
        {posts.length === 0 ? (
          <p className="text-[var(--c-muted)]">Ingen innlegg ennå.</p>
        ) : section.variant === "liste" ? (
          <ul className="divide-y divide-[var(--c-muted)]/30 border-y border-[var(--c-muted)]/30">
            {posts.map((post) => (
              <li key={post.path} className="py-5">
                <a href={siteHref(ctx.basePath, post.path)} className="group block">
                  {date(post)}
                  <h3 className="ng-h3 mt-1 text-xl group-hover:underline">{post.title}</h3>
                  {post.excerpt && <p className="mt-2 max-w-3xl text-[var(--c-muted)]">{post.excerpt}</p>}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.path}>
                <a href={siteHref(ctx.basePath, post.path)} className="ng-card group block h-full overflow-hidden">
                  {post.image && <Img value={{ ...post.image, decorative: true }} sizes={imageSizes.third} className="aspect-[16/10] w-full object-cover" />}
                  <div className="p-5">
                    {date(post)}
                    <h3 className="ng-h3 mt-1 text-lg group-hover:underline">{post.title}</h3>
                    {post.excerpt && <p className="mt-2 text-sm text-[var(--c-muted)]">{post.excerpt}</p>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

/**
 * Bakgrunn per seksjon. Fargene byttes om lokalt med CSS-variabler, så alle seksjoner
 * og knapper fortsatt har godkjent kontrast (de samme fargeparene som er sjekket i temaet).
 */
function SectionBackground({ background, children }: { background?: string; children: ReactNode }) {
  if (background === "flate") {
    return <div style={{ background: "var(--c-surface)", "--c-surface": "var(--c-bg)" } as CSSProperties}>{children}</div>;
  }
  if (background === "fargerik") {
    return (
      <div
        style={
          {
            // De faste kopiene brukes, fordi --c-primary byttes om på samme element.
            background: "var(--c-primary-fixed)",
            color: "var(--c-on-primary-fixed)",
            "--c-text": "var(--c-on-primary-fixed)",
            "--c-muted": "var(--c-on-primary-fixed)",
            "--c-surface": "color-mix(in srgb, var(--c-on-primary-fixed) 12%, var(--c-primary-fixed))",
            "--c-primary": "var(--c-on-primary-fixed)",
            "--c-on-primary": "var(--c-primary-fixed)",
            "--c-accent": "var(--c-on-primary-fixed)",
          } as CSSProperties
        }
      >
        {children}
      </div>
    );
  }
  return <>{children}</>;
}

function Kontakt({ section, ctx, first }: { section: Section; ctx: RenderContext; first: boolean }) {
  const p = section.props;
  const { info } = ctx.site;
  const address = formatAddress(info);
  return (
    <section id="kontakt" className={`scroll-mt-20 ${pad}`}>
      <Container className="grid gap-10 md:grid-cols-2">
        <div>
          <Heading first={first}>{str(p, "overskrift")}</Heading>
          {str(p, "tekst") && <p className="mb-6 text-[var(--c-muted)]">{str(p, "tekst")}</p>}
          <address className="space-y-2 not-italic">
            {info.phone && (
              <p>
                Telefon:{" "}
                <a className="underline" href={`tel:${info.phone.replace(/\s/g, "")}`}>
                  {info.phone}
                </a>
              </p>
            )}
            {info.email && (
              <p>
                E-post:{" "}
                <a className="underline" href={`mailto:${info.email}`}>
                  {info.email}
                </a>
              </p>
            )}
            {address && <p>{address}</p>}
          </address>
          {info.openingHours.length > 0 && (
            <div className="mt-8">
              {first ? <h2 className="ng-h3 mb-3 text-xl">Åpningstider</h2> : <h3 className="ng-h3 mb-3 text-xl">Åpningstider</h3>}
              <dl className="max-w-sm space-y-1">
                {info.openingHours.map((h, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <dt>{h.day}</dt>
                    <dd>{h.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {section.variant === "skjema" && <ContactForm siteId={ctx.site.id} path={ctx.path} preview={ctx.preview} />}
      </Container>
    </section>
  );
}

function Cta({ section, basePath, first }: { section: Section; basePath: string; first: boolean }) {
  const p = section.props;
  return (
    <section className={pad}>
      <Container>
        <div className="ng-card px-8 py-12 text-center">
          <Heading first={first}>{str(p, "overskrift")}</Heading>
          {str(p, "tekst") && <p className="mx-auto mb-8 max-w-2xl text-[var(--c-muted)]">{str(p, "tekst")}</p>}
          <Button href={str(p, "knappLenke")} basePath={basePath}>
            {str(p, "knappTekst")}
          </Button>
        </div>
      </Container>
    </section>
  );
}

/**
 * Timebestilling: en knapp til bookingsystemet, eller bestillingen bygd inn når den besøkende ber om det.
 * Innbygging gjelder bare kjente systemer (lib/booking.ts). Andre lenker blir en knapp, også i varianten «Innebygd».
 */
function Bestill({ section, basePath, first }: { section: Section; basePath: string; first: boolean }) {
  const p = section.props;
  const link = str(p, "lenke");
  const host = section.variant === "innebygd" && isSafeHref(link) ? embeddableHost(link) : null;
  return (
    <section className={pad}>
      <Container>
        <div className="ng-card px-6 py-10 text-center sm:px-8 sm:py-12">
          <Heading first={first}>{str(p, "overskrift")}</Heading>
          {str(p, "tekst") && <p className="mx-auto mb-8 max-w-2xl text-[var(--c-muted)]">{str(p, "tekst")}</p>}
          {host ? (
            <BookingEmbed url={link} host={host} label={str(p, "knappTekst")} />
          ) : (
            <Button href={link} basePath={basePath}>
              {str(p, "knappTekst")}
            </Button>
          )}
        </div>
      </Container>
    </section>
  );
}

export type RenderContext = {
  site: { id: string; name: string; info: SiteInfo; schemaType: string };
  nav: { path: string; title: string }[];
  path: string;
  preview: boolean;
  /** Tom på eget domene, "/vis/<slug>" når nettstedet vises via plattformens adresse. */
  basePath: string;
  /** Nettbutikk: handlekurv i menyen og varer til «Utvalgte varer»-seksjonen. */
  shop: boolean;
  products: CatalogProduct[];
  layout: SiteLayout;
  /** Blogginnleggene (sidene under /blogg), nyeste først. Hentes bare når siden trenger dem. */
  posts?: PostSummary[];
};

export type PostSummary = { path: string; title: string; excerpt: string; image: ImageValue | null; date: string };

function SiteHeader({ ctx }: { ctx: RenderContext }) {
  const { layout, site } = ctx;
  const nav = ctx.nav.map((item) => ({ ...item, href: siteHref(ctx.basePath, item.path) }));
  return (
    <header className="sticky top-0 z-40 bg-[var(--c-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--c-bg)]/85">
      {(layout.announcement.text || layout.topLinks.length > 0) && (
        <div className="ng-announce bg-[var(--c-primary)] text-sm text-[var(--c-on-primary)]">
          <Container className="flex min-h-9 items-center justify-between gap-4 py-1.5">
            <p className="flex-1 text-center md:text-left">
              {layout.announcement.href && isSafeHref(layout.announcement.href) ? (
                <a href={siteHref(ctx.basePath, layout.announcement.href)} className="underline-offset-2 hover:underline">
                  {layout.announcement.text}
                </a>
              ) : (
                layout.announcement.text
              )}
            </p>
            {layout.topLinks.length > 0 && (
              <ul className="hidden gap-5 md:flex">
                {layout.topLinks.map((l) => (
                  <li key={l.label}>
                    <a href={siteHref(ctx.basePath, l.href)} className="hover:underline">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Container>
        </div>
      )}
      <div className="ng-header-bar border-b border-[var(--c-muted)]/15">
        <Container className="ng-header-row flex h-16 items-center gap-6 md:h-20">
          <MobileMenu items={nav} currentPath={ctx.path} siteName={site.name} />
          <Link
            href={siteHref(ctx.basePath, "/")}
            className="ng-logo mr-auto flex shrink-0 items-center text-xl md:mr-0"
          >
            {layout.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={layout.logo.src} alt={site.name} className="h-9 w-auto max-w-[180px] object-contain md:h-11" />
            ) : (
              site.name
            )}
          </Link>
          {nav.length > 1 && (
            <nav aria-label="Hovedmeny" className="ng-header-nav hidden flex-1 justify-center md:flex">
              <ul className="flex flex-wrap gap-x-8">
                {nav.map((item) => (
                  <li key={item.path}>
                    <Link
                      href={item.href}
                      aria-current={item.path === ctx.path ? "page" : undefined}
                      className="py-2 text-[0.95rem] underline-offset-8 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="ng-header-actions ml-auto flex items-center gap-4 md:ml-0">
            {ctx.shop ? (
              <CartDrawer siteId={site.id} basePath={ctx.basePath} />
            ) : (
              site.info.phone && (
                // På mobil står bare «Ring», så knappen får plass ved siden av menyen. Der trenger folk den mest.
                <a href={`tel:${site.info.phone.replace(/\s/g, "")}`} aria-label={`Ring ${site.info.phone}`} className="py-2 font-semibold">
                  Ring<span className="hidden sm:inline"> {site.info.phone}</span>
                </a>
              )
            )}
          </div>
        </Container>
      </div>
    </header>
  );
}

function SiteFooter({ ctx }: { ctx: RenderContext }) {
  const { info, name } = ctx.site;
  const { layout } = ctx;
  const address = formatAddress(info);
  const social = (Object.keys(socialLabels) as (keyof typeof socialLabels)[]).filter((k) => layout.social[k]);
  return (
    <footer className="mt-16 bg-[var(--c-surface)] text-sm">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="ng-logo text-lg">{name}</p>
          {layout.footerText && <p className="max-w-xs text-[var(--c-muted)]">{layout.footerText}</p>}
        </div>
        {layout.footerColumns.map((col) => (
          <div key={col.title}>
            <h2 className="mb-3 font-semibold">{col.title}</h2>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={siteHref(ctx.basePath, l.href)} className="text-[var(--c-muted)] hover:text-[var(--c-text)] hover:underline">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h2 className="mb-3 font-semibold">Kontakt</h2>
          <address className="space-y-1 not-italic text-[var(--c-muted)]">
            {info.phone && (
              <p>
                <a href={`tel:${info.phone.replace(/\s/g, "")}`} className="hover:underline">
                  {info.phone}
                </a>
              </p>
            )}
            {info.email && (
              <p>
                <a href={`mailto:${info.email}`} className="hover:underline">
                  {info.email}
                </a>
              </p>
            )}
            {address && <p>{address}</p>}
          </address>
          {social.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {social.map((k) => (
                <li key={k}>
                  <a href={layout.social[k]} rel="noopener" target="_blank" className="font-medium underline">
                    {socialLabels[k]}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
      <div className="border-t border-[var(--c-muted)]/20">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-[var(--c-muted)]">
          <p>
            © {new Date().getFullYear()} {name}
            {info.orgnr && ` · Org.nr. ${formatOrgnr(info.orgnr)}`}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            <li>
              <a href={siteHref(ctx.basePath, "/personvern")} className="hover:text-[var(--c-text)] hover:underline">
                Personvern
              </a>
            </li>
            {ctx.shop && (
              <li>
                <a href={siteHref(ctx.basePath, "/angrerett")} className="hover:text-[var(--c-text)] hover:underline">
                  Angrerett i 14 dager
                </a>
              </li>
            )}
          </ul>
        </Container>
      </div>
    </footer>
  );
}

/** Strukturerte data for Google og AI-søk. Escaper < slik at innhold aldri kan bryte ut av script-taggen. */
function StructuredData({ ctx, url }: { ctx: RenderContext; url?: string }) {
  const { info, name, schemaType } = ctx.site;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name,
    ...(url && { url }),
    ...(info.phone && { telephone: info.phone }),
    ...(info.email && { email: info.email }),
    ...(info.orgnr && { vatID: `NO${info.orgnr}MVA`, identifier: info.orgnr }),
    ...((info.street || info.city) && {
      address: {
        "@type": "PostalAddress",
        streetAddress: info.street || undefined,
        postalCode: info.postalCode || undefined,
        addressLocality: info.city || undefined,
        addressCountry: "NO",
      },
    }),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** Rammen rundt alle sider på nettstedet: tema, meny, bunntekst og «Hopp til innhold». */
export function SiteChrome({
  theme,
  ctx,
  children,
  canonicalUrl,
  embedded = false,
}: {
  theme: Theme;
  ctx: RenderContext;
  children: ReactNode;
  canonicalUrl?: string;
  /** Miniatyr inne i en annen side: uten «Hopp til innhold», landemerker og id-er som ellers ville blitt dobbelt. */
  embedded?: boolean;
}) {
  if (embedded) {
    return (
      <div {...themeRootProps(theme)} className="flex min-h-screen flex-col bg-[var(--c-bg)] font-[family-name:var(--f-body)] text-[var(--c-text)]">
        <SiteHeader ctx={ctx} />
        <div className="flex-1">{children}</div>
      </div>
    );
  }
  return (
    <div {...themeRootProps(theme)} className="flex min-h-screen flex-col bg-[var(--c-bg)] font-[family-name:var(--f-body)] text-[var(--c-text)]">
      <a
        href="#innhold"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--c-bg)] focus:p-3"
      >
        Hopp til innhold
      </a>
      {ctx.path === "/" && !ctx.preview && !ctx.basePath && <StructuredData ctx={ctx} url={canonicalUrl} />}
      <SiteHeader ctx={ctx} />
      <main id="innhold" className="flex-1">
        {children}
      </main>
      <SiteFooter ctx={ctx} />
    </div>
  );
}

export function PageRenderer({
  content,
  theme,
  ctx,
  canonicalUrl,
  editor,
  embedded,
}: {
  content: PageContent;
  theme: Theme;
  ctx: RenderContext;
  canonicalUrl?: string;
  /** Bare i redigereren: hver seksjon merkes, så et klikk i forhåndsvisningen kan velge den. */
  editor?: { selectedId: string | null };
  /** Miniatyr inne i en annen side (temagalleriet og salgssidene). */
  embedded?: boolean;
}) {
  return (
    <SiteChrome theme={theme} ctx={ctx} canonicalUrl={canonicalUrl} embedded={embedded}>
      {content.sections.map((section, i) => {
        const rendered = <SectionBackground background={section.background}>{renderSection(section, i, ctx)}</SectionBackground>;
        return editor ? (
          <div
            key={section.id}
            data-section-id={section.id}
            data-section-label={sectionRegistry[section.type].label}
            data-selected={editor.selectedId === section.id ? "" : undefined}
          >
            {rendered}
          </div>
        ) : (
          <Fragment key={section.id}>{rendered}</Fragment>
        );
      })}
    </SiteChrome>
  );
}

/** Én seksjon alene, med nettstedets farger og fonter. Brukes til bildene i seksjonsbiblioteket. */
export function SectionPreview({ section, theme, ctx }: { section: Section; theme: Theme; ctx: RenderContext }) {
  return (
    <div {...themeRootProps(theme)} className="bg-[var(--c-bg)] font-[family-name:var(--f-body)] text-[var(--c-text)]">
      <SectionBackground background={section.background}>{renderSection(section, 1, ctx)}</SectionBackground>
    </div>
  );
}

function renderSection(section: Section, i: number, ctx: RenderContext) {
  switch (section.type) {
    case "hero":
      return <Hero key={section.id} section={section} isFirst={i === 0} basePath={ctx.basePath} />;
    case "tekst":
      return <Tekst key={section.id} section={section} first={i === 0} />;
    case "bildetekst":
      return <BildeTekst key={section.id} section={section} first={i === 0} basePath={ctx.basePath} />;
    case "galleri":
      return <Galleri key={section.id} section={section} first={i === 0} />;
    case "omtaler":
      return <Omtaler key={section.id} section={section} first={i === 0} />;
    case "faq":
      return <Faq key={section.id} section={section} first={i === 0} />;
    case "tjenester":
      return <Tjenester key={section.id} section={section} first={i === 0} />;
    case "produkter":
      return <Produkter key={section.id} section={section} first={i === 0} ctx={ctx} />;
    case "kontakt":
      return <Kontakt key={section.id} section={section} first={i === 0} ctx={ctx} />;
    case "cta":
      return <Cta key={section.id} section={section} first={i === 0} basePath={ctx.basePath} />;
    case "fordeler":
      return <Fordeler key={section.id} section={section} first={i === 0} />;
    case "kategorikort":
      return <Kategorikort key={section.id} section={section} first={i === 0} basePath={ctx.basePath} />;
    case "blogg":
      return <Blogg key={section.id} section={section} first={i === 0} ctx={ctx} />;
    case "bestill":
      return <Bestill key={section.id} section={section} first={i === 0} basePath={ctx.basePath} />;
  }
}
