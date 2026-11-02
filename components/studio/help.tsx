import Link from "next/link";
import { getHelpArticle, helpHref } from "@/lib/hjelp/artikler";
import { ui } from "./ui";

/**
 * Hjelp der funksjonen brukes. Korte tekster, og «Les mer» til kunnskapsbasen (/studio/hjelp) for resten.
 * Virker uten JavaScript: «Slik gjør du» er vanlig details/summary, som tastatur og skjermlesere kan åpne.
 */

/** «Les mer» med artikkelens tittel for skjermlesere, så lenken gir mening også alene i en lenkeliste. */
export function HelpLink({ slug, children = "Les mer" }: { slug: string; children?: React.ReactNode }) {
  const article = getHelpArticle(slug);
  if (!article) return null;
  return (
    <Link href={helpHref(slug)} className={ui.link}>
      {children}
      <span className="sr-only"> i hjelpen: {article.title}</span>
    </Link>
  );
}

/** Én linje under overskriften som sier hva skjermen er til. */
export function PageIntro({ children, article, className = "mb-6" }: { children: React.ReactNode; article?: string; className?: string }) {
  return (
    <p className={`${className} max-w-2xl text-sm ${ui.muted}`}>
      {children}
      {article && (
        <>
          {" "}
          <HelpLink slug={article} />
        </>
      )}
    </p>
  );
}

/** Utvidbar «Slik gjør du» på skjermer med flere steg. Stegene er en nummerert liste. */
export function HowTo({
  title = "Slik gjør du",
  steps,
  children,
  article,
  className = "mb-6",
}: {
  title?: string;
  steps?: React.ReactNode[];
  children?: React.ReactNode;
  article?: string;
  className?: string;
}) {
  return (
    <details className={`${ui.card} ${className} p-4 text-sm`}>
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className={`mt-3 space-y-2 ${ui.muted}`}>
        {steps && (
          <ol className="list-decimal space-y-1 pl-5">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
        {children}
        {article && (
          <p>
            <HelpLink slug={article} />
          </p>
        )}
      </div>
    </details>
  );
}

/** Hint under et felt. Gi feltet aria-describedby med samme id, så skjermlesere leser hintet. */
export function FieldHint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className={`mt-1 block text-sm ${ui.muted}`}>
      {children}
    </span>
  );
}
