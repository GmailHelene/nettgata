"use client";

import { Fragment, useState, type ReactNode } from "react";
import { bransjeLabel, findBransje, genres, lowerLabel, searchBransjer, type BransjeMatch, type GenreIcon } from "@/lib/genres";
import { getPack } from "@/lib/packs";

/** Enkle strekikoner, tegnet for sjangrene. 24 x 24, farge fra teksten rundt. */
const icons: Record<GenreIcon, ReactNode> = {
  hammer: <path d="M3.5 20.5l8.5-8.5M12.6 3.4l8 8-3.2 3.2-8-8zM9.8 6.2l-2.3 2.3 2.4 2.4" />,
  saks: (
    <>
      <circle cx="6" cy="17.5" r="2.8" />
      <circle cx="18" cy="17.5" r="2.8" />
      <path d="M8.2 15.6L18.5 4M15.8 15.6L5.5 4" />
    </>
  ),
  hjerte: <path d="M12 20.5s-7.5-4.6-7.5-10.4A4.1 4.1 0 0112 7.6a4.1 4.1 0 017.5 2.5c0 5.8-7.5 10.4-7.5 10.4zM8 12h2.2l1.3-2.3 2 4.3 1.3-2H16" />,
  kopp: <path d="M4.5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5zM15.5 10.5h1.8a2.2 2.2 0 010 4.4h-1.8M8 3.5v2.5M12 3.5v2.5" />,
  pose: <path d="M5 8.5h14l-1.2 12H6.2zM9 8.5V6.8a3 3 0 016 0v1.7" />,
  koffert: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V5.8A1.8 1.8 0 0110.8 4h2.4A1.8 1.8 0 0115 5.8v1.7M3.5 13h17" />
    </>
  ),
  pensel: (
    <>
      <path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.6-1 1.2-1.9-.5-1.1.3-2.3 1.5-2.3h2.1a3.7 3.7 0 003.7-3.7C20.5 7.6 16.7 3.5 12 3.5z" />
      <circle cx="7.8" cy="11.5" r="1" />
      <circle cx="10.5" cy="7.6" r="1" />
      <circle cx="15" cy="8" r="1" />
    </>
  ),
  manual: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  fjell: (
    <>
      <path d="M2.5 20l6.5-11 4 6.5 2.2-3.3 6.3 7.8z" />
      <circle cx="17" cy="6" r="2" />
    </>
  ),
  folk: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0112 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.6 14.1A4.8 4.8 0 0121 19" />
    </>
  ),
  nokkel: <path d="M14.8 6.2a4 4 0 00-5.3 5.3L3.5 17.5l3 3 6-6a4 4 0 005.3-5.3L15.3 11.7l-2.4-.6-.6-2.4z" />,
};

function Icon({ name }: { name: GenreIcon }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

/**
 * Bransjevalget i «Nytt nettsted»: brede sjangre med ikon og eksempler, og bransjene inni hver sjanger.
 * Søket tåler både «frisør» og «frisor», og forslaget fra Brønnøysund kan tas i bruk med ett klikk.
 */
export function GenrePicker({
  value,
  onChange,
  suggestion,
}: {
  /** Nøkkelen til bransjepakken som er valgt, eller tom. */
  value: string;
  onChange: (pack: string) => void;
  suggestion: BransjeMatch | null;
}) {
  const [query, setQuery] = useState("");
  const [openGenre, setOpenGenre] = useState(() => findBransje(value)?.genre.key ?? suggestion?.genre.key ?? null);
  const results = query.trim().length >= 2 ? searchBransjer(query) : [];
  const chosen = value ? findBransje(value) : null;

  const choose = (m: BransjeMatch) => {
    onChange(m.bransje.pack);
    setOpenGenre(m.genre.key);
  };

  return (
    <div className="space-y-5">
      {suggestion && suggestion.bransje.pack !== value && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p>
            Ut fra Brønnøysundregistrene ser det ut som dere driver med <strong>{lowerLabel(bransjeLabel(suggestion.bransje))}</strong>.
          </p>
          <button type="button" onClick={() => choose(suggestion)} className="rounded-md bg-emerald-900 px-3 py-1.5 font-semibold text-white">
            Bruk forslaget
          </button>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Søk etter bransje</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="For eksempel frisør, rørlegger eller kafé"
          className="w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>
      {query.trim().length >= 2 && (
        <div aria-live="polite">
          {results.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {results.map((m) => (
                <li key={m.bransje.pack}>
                  <button
                    type="button"
                    aria-pressed={m.bransje.pack === value}
                    onClick={() => choose(m)}
                    className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm aria-pressed:border-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white"
                  >
                    <span className="font-semibold">{bransjeLabel(m.bransje)}</span>
                    <span className="ml-1 opacity-75">· {m.genre.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-700">
              Fant ingen bransje med det navnet. Velg «Annen bedrift» under Service og annet, så kan du tilpasse alt selv.
            </p>
          )}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {genres.map((genre) => {
          const open = openGenre === genre.key;
          const holdsValue = chosen?.genre.key === genre.key;
          return (
            <Fragment key={genre.key}>
              <li>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={open ? `sjanger-${genre.key}` : undefined}
                  onClick={() => setOpenGenre(open ? null : genre.key)}
                  className={`flex h-full w-full items-start gap-3 rounded-lg border bg-white p-4 text-left transition-colors hover:border-neutral-900 ${
                    open || holdsValue ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"
                  }`}
                >
                  <span className="mt-0.5 shrink-0 text-neutral-800">
                    <Icon name={genre.icon} />
                  </span>
                  <span>
                    <span className="block font-semibold">{genre.label}</span>
                    <span className="mt-0.5 block text-sm text-neutral-600">{genre.description}</span>
                    {holdsValue && chosen && <span className="mt-2 block text-sm font-semibold text-emerald-800">Valgt: {bransjeLabel(chosen.bransje)}</span>}
                  </span>
                </button>
              </li>
              {open && (
                <li id={`sjanger-${genre.key}`} className="rounded-lg border border-neutral-300 bg-neutral-50 p-4 sm:col-span-2 lg:col-span-3">
                  <p className="mb-3 text-sm font-medium">Hva passer best for dere?</p>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {genre.bransjer.map((bransje) => {
                      const pack = getPack(bransje.pack);
                      const selected = value === bransje.pack;
                      return (
                        <li key={bransje.pack}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChange(bransje.pack)}
                            className="h-full w-full rounded-md border border-neutral-300 bg-white p-3 text-left hover:border-neutral-900 aria-pressed:border-neutral-900 aria-pressed:bg-neutral-900 aria-pressed:text-white"
                          >
                            <span className="block font-semibold">{bransjeLabel(bransje)}</span>
                            {pack && <span className="mt-0.5 block text-sm opacity-80">{pack.description}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
