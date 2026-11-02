"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ui } from "@/components/studio/ui";
import { helpArticles, helpCategories, helpHref, searchHelp, type HelpCategory } from "@/lib/hjelp/artikler";

/**
 * Søk i hjelpen. Filtrerer mens du skriver. Uten JavaScript sender skjemaet ?q= til serveren,
 * som viser de samme treffene (initialQuery), så søket virker uansett.
 */
export function HelpSearch({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const id = useId();
  const results = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim() !== "";

  return (
    <div>
      <form role="search" method="get" className="mb-8" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={`${id}-q`} className={ui.label}>
          Søk i hjelpen
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${id}-q`}
            name="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For eksempel domene, kort eller nyhetsbrev"
            autoComplete="off"
            aria-describedby={`${id}-antall`}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#8a96a1] bg-white px-3.5 py-2"
          />
          <noscript>
            <button className={ui.button}>Søk</button>
          </noscript>
        </div>
        <p id={`${id}-antall`} aria-live="polite" className={`mt-2 text-sm ${ui.muted}`}>
          {searching ? (results.length === 0 ? "Ingen treff." : `${results.length} treff.`) : `${helpArticles.length} artikler.`}
        </p>
      </form>

      {searching ? (
        results.length > 0 && <ArticleList articles={results} />
      ) : (
        <div className="space-y-10">
          {(Object.keys(helpCategories) as HelpCategory[]).map((category) => (
            <section key={category} aria-labelledby={`${id}-${category}`}>
              <h2 id={`${id}-${category}`} className="mb-3 text-xl font-semibold">
                {helpCategories[category]}
              </h2>
              <ArticleList articles={helpArticles.filter((a) => a.category === category)} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleList({ articles }: { articles: typeof helpArticles }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {articles.map((a) => (
        <li key={a.slug} className={`${ui.card} p-4`}>
          <Link href={helpHref(a.slug)} className={`${ui.link} font-semibold`}>
            {a.title}
          </Link>
          <p className={`mt-1 text-sm ${ui.muted}`}>{a.summary}</p>
        </li>
      ))}
    </ul>
  );
}
