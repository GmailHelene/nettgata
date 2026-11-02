import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { heading } from "@/components/brand";
import { StudioTopBar } from "@/components/studio/top-bar";
import { ui } from "@/components/studio/ui";
import { getHelpArticle, helpCategories, helpHref } from "@/lib/hjelp/artikler";
import { requireUser } from "@/lib/session";
import { HelpContact } from "../contact";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = getHelpArticle((await params).slug);
  return { title: article ? `${article.title} | Hjelp` : "Hjelp" };
}

export default async function HelpArticlePage({ params }: Props) {
  const user = await requireUser();
  const article = getHelpArticle((await params).slug);
  if (!article) notFound();
  const related = (article.related ?? []).map(getHelpArticle).filter((a) => a !== null);

  return (
    <>
      <StudioTopBar email={user.email} active="hjelp" />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <nav aria-label="Brødsmuler" className="text-sm">
          <Link href="/studio/hjelp" className={ui.link}>
            Hjelp
          </Link>
          <span className={ui.muted}> / {helpCategories[article.category]}</span>
        </nav>
        <article className="mt-4">
          <h1 className={`${heading} text-[2rem] leading-tight sm:text-4xl`}>{article.title}</h1>
          <p className={`mt-3 text-lg ${ui.muted}`}>{article.summary}</p>
          {article.intro?.map((p, i) => (
            <p key={i} className="mt-4">
              {p}
            </p>
          ))}
          {article.steps && (
            <section aria-labelledby="steg" className="mt-8">
              <h2 id="steg" className="mb-3 text-xl font-semibold">
                Slik gjør du
              </h2>
              <ol className="list-decimal space-y-2 pl-6">
                {article.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}
          {article.notes && (
            <section aria-labelledby="greit" className="mt-8">
              <h2 id="greit" className="mb-3 text-xl font-semibold">
                Greit å vite
              </h2>
              <ul className="list-disc space-y-2 pl-6">
                {article.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </article>
        {related.length > 0 && (
          <section aria-labelledby="relatert" className="mt-10">
            <h2 id="relatert" className="mb-2 font-semibold">
              Les også
            </h2>
            <ul className="space-y-1">
              {related.map((a) => (
                <li key={a.slug}>
                  <Link href={helpHref(a.slug)} className={ui.link}>
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <HelpContact subject={`Hjelp: ${article.title}`} />
      </main>
    </>
  );
}
