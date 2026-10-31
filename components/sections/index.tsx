import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { PageContent, Section } from "@/lib/content/types";
import { isSafeHref } from "@/lib/content/fields";
import { formatAddress, formatOrgnr, type SiteInfo } from "@/lib/site-info";
import { ContactForm } from "./contact-form";

type Props = Record<string, unknown>;
const str = (p: Props, key: string) => (typeof p[key] === "string" ? (p[key] as string) : "");
const list = (p: Props, key: string) => (Array.isArray(p[key]) ? (p[key] as Props[]) : []);

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

function Button({ href, children }: { href: string; children: ReactNode }) {
  if (!href || !isSafeHref(href)) return null;
  return (
    <a
      href={href}
      className="inline-block rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-3 font-semibold text-[var(--c-on-primary)] outline-offset-4 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--c-text)]"
    >
      {children}
    </a>
  );
}

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-5xl px-5 ${className}`}>{children}</div>;
}

function Heading({ children, level = 2 }: { children: ReactNode; level?: 1 | 2 }) {
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag
      className={`font-[family-name:var(--f-heading)] font-bold tracking-tight ${level === 1 ? "text-4xl md:text-5xl" : "mb-6 text-3xl"}`}
    >
      {children}
    </Tag>
  );
}

function Hero({ section, isFirst }: { section: Section; isFirst: boolean }) {
  const p = section.props;
  const centered = section.variant === "sentrert";
  return (
    <section className="py-20 md:py-28">
      <Container className={centered ? "text-center" : ""}>
        <div className={centered ? "mx-auto max-w-3xl" : "max-w-3xl"}>
          <Heading level={isFirst ? 1 : 2}>{str(p, "overskrift")}</Heading>
          {str(p, "undertekst") && <p className="mt-5 text-lg text-[var(--c-muted)]">{str(p, "undertekst")}</p>}
          {str(p, "knappTekst") && (
            <div className="mt-8">
              <Button href={str(p, "knappLenke")}>{str(p, "knappTekst")}</Button>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

function Tekst({ section }: { section: Section }) {
  const p = section.props;
  return (
    <section className="py-14">
      <Container>
        <div className="max-w-3xl">
          {str(p, "overskrift") && <Heading>{str(p, "overskrift")}</Heading>}
          <Paragraphs text={str(p, "brodtekst")} />
        </div>
      </Container>
    </section>
  );
}

function Tjenester({ section }: { section: Section }) {
  const p = section.props;
  const items = list(p, "tjenester");
  return (
    <section className="py-14">
      <Container>
        <Heading>{str(p, "overskrift")}</Heading>
        {section.variant === "liste" ? (
          <dl className="divide-y divide-[var(--c-muted)]/30 border-y border-[var(--c-muted)]/30">
            {items.map((item, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                <dt className="font-semibold">{str(item, "navn")}</dt>
                <dd>{str(item, "pris")}</dd>
                {str(item, "beskrivelse") && (
                  <dd className="w-full text-sm text-[var(--c-muted)]">{str(item, "beskrivelse")}</dd>
                )}
              </div>
            ))}
          </dl>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <li key={i} className="rounded-[var(--radius)] bg-[var(--c-surface)] p-6">
                <h3 className="text-lg font-semibold">{str(item, "navn")}</h3>
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

function Kontakt({ section, ctx }: { section: Section; ctx: RenderContext }) {
  const p = section.props;
  const { info } = ctx.site;
  const address = formatAddress(info);
  return (
    <section id="kontakt" className="scroll-mt-20 py-14">
      <Container className="grid gap-10 md:grid-cols-2">
        <div>
          <Heading>{str(p, "overskrift")}</Heading>
          {str(p, "tekst") && <p className="mb-6 text-[var(--c-muted)]">{str(p, "tekst")}</p>}
          <address className="space-y-2 not-italic">
            {info.phone && (
              <p>
                Telefon: <a className="underline" href={`tel:${info.phone.replace(/\s/g, "")}`}>{info.phone}</a>
              </p>
            )}
            {info.email && (
              <p>
                E-post: <a className="underline" href={`mailto:${info.email}`}>{info.email}</a>
              </p>
            )}
            {address && <p>{address}</p>}
          </address>
          {info.openingHours.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-xl font-semibold">Åpningstider</h3>
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

function Cta({ section }: { section: Section }) {
  const p = section.props;
  return (
    <section className="py-14">
      <Container>
        <div className="rounded-[var(--radius)] bg-[var(--c-surface)] px-8 py-12 text-center">
          <Heading>{str(p, "overskrift")}</Heading>
          {str(p, "tekst") && <p className="mx-auto mb-8 max-w-2xl text-[var(--c-muted)]">{str(p, "tekst")}</p>}
          <Button href={str(p, "knappLenke")}>{str(p, "knappTekst")}</Button>
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
};

function SiteHeader({ ctx }: { ctx: RenderContext }) {
  return (
    <header className="border-b border-[var(--c-muted)]/20">
      <Container className="flex flex-wrap items-center justify-between gap-4 py-4">
        <Link href="/" className="font-[family-name:var(--f-heading)] text-xl font-bold">
          {ctx.site.name}
        </Link>
        {ctx.nav.length > 1 && (
          <nav aria-label="Hovedmeny">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {ctx.nav.map((item) => (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    aria-current={item.path === ctx.path ? "page" : undefined}
                    className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {ctx.site.info.phone && (
          <a href={`tel:${ctx.site.info.phone.replace(/\s/g, "")}`} className="font-semibold">
            Ring {ctx.site.info.phone}
          </a>
        )}
      </Container>
    </header>
  );
}

function SiteFooter({ ctx }: { ctx: RenderContext }) {
  const { info, name } = ctx.site;
  const address = formatAddress(info);
  return (
    <footer className="mt-10 bg-[var(--c-surface)] py-10 text-sm">
      <Container className="flex flex-wrap justify-between gap-6">
        <div className="space-y-1">
          <p className="font-semibold">{name}</p>
          {address && <p>{address}</p>}
          {info.orgnr && <p>Org.nr. {formatOrgnr(info.orgnr)}</p>}
        </div>
        <div className="space-y-1">
          {info.phone && <p>{info.phone}</p>}
          {info.email && <p>{info.email}</p>}
        </div>
      </Container>
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

export function PageRenderer({
  content,
  style,
  ctx,
  canonicalUrl,
}: {
  content: PageContent;
  style: CSSProperties;
  ctx: RenderContext;
  canonicalUrl?: string;
}) {
  return (
    <div style={style} className="flex min-h-screen flex-col bg-[var(--c-bg)] font-[family-name:var(--f-body)] text-[var(--c-text)]">
      <a href="#innhold" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[var(--c-bg)] focus:p-3">
        Hopp til innhold
      </a>
      {ctx.path === "/" && !ctx.preview && <StructuredData ctx={ctx} url={canonicalUrl} />}
      <SiteHeader ctx={ctx} />
      <main id="innhold" className="flex-1">
        {content.sections.map((section, i) => {
          switch (section.type) {
            case "hero":
              return <Hero key={section.id} section={section} isFirst={i === 0} />;
            case "tekst":
              return <Tekst key={section.id} section={section} />;
            case "tjenester":
              return <Tjenester key={section.id} section={section} />;
            case "kontakt":
              return <Kontakt key={section.id} section={section} ctx={ctx} />;
            case "cta":
              return <Cta key={section.id} section={section} />;
          }
        })}
      </main>
      <SiteFooter ctx={ctx} />
    </div>
  );
}
