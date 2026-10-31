"use client";

import { useEffect, useRef, useState } from "react";
import { listMediaAction } from "@/app/studio/media-actions";
import type { MediaItem } from "@/lib/media";

const dateFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" });

/** Velg et bilde som allerede er lastet opp, i stedet for å laste opp det samme bildet på nytt. */
export function MediaPicker({
  siteId,
  onPick,
  onClose,
}: {
  siteId: string;
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    let cancelled = false;
    listMediaAction(siteId).then(
      (list) => {
        if (!cancelled) setItems(list);
      },
      () => {
        if (!cancelled) setError("Fikk ikke hentet bildene. Lukk og prøv igjen.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="bildevelger-tittel"
      className="m-auto max-h-[85vh] w-[min(900px,calc(100%-1.5rem))] overflow-hidden rounded-xl p-0 backdrop:bg-black/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center gap-4 border-b px-5 py-4">
          <h2 id="bildevelger-tittel" className="mr-auto text-lg font-semibold">
            Velg bilde
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-md border border-neutral-900 px-3 py-1.5 text-sm font-semibold"
          >
            Lukk
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          {error ? (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          ) : !items ? (
            <p className="text-sm text-neutral-600">Henter bildene...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-700">Ingen bilder ennå. Last opp et bilde, så havner det her og kan brukes flere steder.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(item);
                      ref.current?.close();
                    }}
                    className="group block w-full rounded-md text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- bilder fra eget lager, allerede krympet ved opplasting */}
                    <img
                      src={item.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-md border border-neutral-300 object-cover group-hover:opacity-90"
                    />
                    <span className="mt-1 block truncate text-xs text-neutral-700">
                      {item.alt || `Lastet opp ${dateFormat.format(new Date(item.createdAt))}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
