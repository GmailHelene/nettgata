import type { CSSProperties, ReactNode } from "react";
import type { PageContent, Section } from "@/lib/content/types";
import { isSafeHref } from "@/lib/content/fields";

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

function Kontakt({ section }: { section: Section }) {
  const p = section.props;
  const hours = list(p, "apningstider");
  const phone = str(p, "telefon");
  const email = str(p, "epost");
  return (
    <section className="py-14">
      <Container className="grid gap-10 md:grid-cols-2">
        <div>
          <Heading>{str(p, "overskrift")}</Heading>
          <address className="space-y-2 not-italic">
            {phone && (
              <p>
                Telefon: <a className="underline" href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>
              </p>
            )}
            {email && (
              <p>
                E-post: <a className="underline" href={`mailto:${email}`}>{email}</a>
              </p>
            )}
            {str(p, "adresse") && <p>{str(p, "adresse")}</p>}
          </address>
        </div>
        {hours.length > 0 && (
          <div>
            <h3 className="mb-4 text-xl font-semibold">Åpningstider</h3>
            <dl className="space-y-1">
              {hours.map((h, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt>{str(h, "dag")}</dt>
                  <dd>{str(h, "tid")}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
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

export function PageRenderer({ content, style }: { content: PageContent; style: CSSProperties }) {
  return (
    <div
      style={style}
      className="min-h-screen bg-[var(--c-bg)] font-[family-name:var(--f-body)] text-[var(--c-text)]"
    >
      <main id="innhold">
        {content.sections.map((section, i) => {
          switch (section.type) {
            case "hero":
              return <Hero key={section.id} section={section} isFirst={i === 0} />;
            case "tekst":
              return <Tekst key={section.id} section={section} />;
            case "tjenester":
              return <Tjenester key={section.id} section={section} />;
            case "kontakt":
              return <Kontakt key={section.id} section={section} />;
            case "cta":
              return <Cta key={section.id} section={section} />;
          }
        })}
      </main>
    </div>
  );
}
