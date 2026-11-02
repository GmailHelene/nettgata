"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MediaFile, MediaUsage } from "@/lib/media";
import type { ActionState } from "../../../actions";
import { deleteFileAction } from "../../../media-actions";

type Item = MediaFile & { usedIn: MediaUsage[] };

const dateFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" });

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * PDF-filene (meny, brosjyre) med størrelse og hvor de brukes. Lastes opp fra feltet på siden, ikke her.
 * En fil kan slettes for godt når ingen side bruker den, samme regel som for bildene.
 */
export function FileList({ siteId, items }: { siteId: string; items: Item[] }) {
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);

  const remove = (item: Item) => {
    if (!confirm(`Slette «${item.name}» for godt? Det kan ikke angres.`)) return;
    startTransition(async () => setStatus(await deleteFileAction(siteId, item.id)));
  };

  return (
    <section aria-labelledby="filer-overskrift" className="mt-12">
      <h2 id="filer-overskrift" className="text-lg font-semibold">
        Filer
      </h2>
      <p className="mb-4 text-sm text-neutral-700">
        {items.length === 0
          ? "Ingen PDF-filer ennå. Du laster opp en meny eller brosjyre fra seksjonen «Filer og PDF-meny» når du redigerer en side."
          : `${items.length === 1 ? "1 fil" : `${items.length} filer`} · ${formatBytes(totalBytes)}. En fil kan slettes når ingen side bruker den.`}
      </p>
      {status && (
        <p
          role="status"
          className={`mb-4 whitespace-pre-line rounded-md p-3 text-sm ${status.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
        >
          {status.message}
        </p>
      )}
      {items.length > 0 && (
        <ul className="divide-y rounded-lg border border-neutral-300 bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="mr-auto min-w-0">
                <a href={item.src} target="_blank" rel="noopener" className="font-medium underline">
                  {item.name}
                  <span className="sr-only"> (PDF, åpnes i ny fane)</span>
                </a>
                <p className="text-xs text-neutral-600">
                  {formatBytes(item.size)} · {dateFormat.format(new Date(item.createdAt))}
                </p>
                <p className="mt-1 text-sm">
                  {item.usedIn.length ? (
                    <>
                      <span className="font-medium">Brukes på: </span>
                      {item.usedIn.map((use, i) => (
                        <span key={use.href + use.label}>
                          {i > 0 && ", "}
                          <Link href={use.href} className="underline">
                            {use.label}
                          </Link>
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-neutral-700">Ikke i bruk</span>
                  )}
                </p>
              </div>
              {item.usedIn.length === 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(item)}
                  aria-label={`Slett ${item.name} for godt`}
                  className="text-sm text-red-800 underline"
                >
                  Slett for godt
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
