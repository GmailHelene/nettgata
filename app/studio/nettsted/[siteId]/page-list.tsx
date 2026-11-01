"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import type { ActionState } from "../../actions";
import { createPageAction, createPostAction, deletePageAction, movePageAction, publishAllAction, setMenuAction } from "../../site-actions";

type PageRow = { id: string; title: string; path: string; showInMenu: boolean; published: boolean };

export function PageList({ siteId, pages }: { siteId: string; pages: PageRow[] }) {
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, creating] = useActionState(createPageAction.bind(null, siteId), null);
  const [postState, postAction, posting] = useActionState(createPostAction.bind(null, siteId), null);
  const unpublished = pages.filter((p) => !p.published).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Sider</h2>
          {unpublished > 0 && (
            <button
              disabled={pending}
              onClick={() => startTransition(async () => setStatus(await publishAllAction(siteId)))}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Publiser alle sider ({unpublished} ikke publisert)
            </button>
          )}
        </div>
        <FormStatus state={status} />
        <ul className="mt-3 divide-y rounded-lg border bg-white">
          {pages.map((page, i) => (
            <li key={page.id} className="flex flex-wrap items-center gap-3 p-4">
              <Link href={`/studio/nettsted/${siteId}/side/${page.id}`} className="mr-auto hover:underline">
                <span className="font-medium">{page.title}</span> <span className="text-sm text-neutral-600">{page.path}</span>
              </Link>
              <span className={`text-sm ${page.published ? "text-green-800" : "text-amber-800"}`}>
                {page.published ? "Publisert" : "Ikke publisert"}
              </span>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={page.showInMenu}
                  disabled={pending}
                  onChange={(e) => {
                    const show = e.target.checked;
                    startTransition(() => setMenuAction(siteId, page.id, show));
                  }}
                />
                I menyen
              </label>
              <button
                aria-label={`Flytt ${page.title} opp`}
                disabled={pending || i === 0}
                onClick={() => startTransition(() => movePageAction(siteId, page.id, -1))}
                className="text-sm underline disabled:opacity-40"
              >
                Opp
              </button>
              <button
                aria-label={`Flytt ${page.title} ned`}
                disabled={pending || i === pages.length - 1}
                onClick={() => startTransition(() => movePageAction(siteId, page.id, 1))}
                className="text-sm underline disabled:opacity-40"
              >
                Ned
              </button>
              {page.path !== "/" && (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Slette «${page.title}»? Siden og alle versjonene forsvinner.`)) return;
                    startTransition(async () => setStatus(await deletePageAction(siteId, page.id)));
                  }}
                  aria-label={`Slett ${page.title}`}
                  className="text-sm text-red-800 underline"
                >
                  Slett
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 font-semibold">Ny side</h2>
        <form action={createAction} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Tittel</span>
            <input name="title" required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Adresse (valgfritt)</span>
            <input name="path" placeholder="/om-oss" className={inputClass} />
          </label>
          <button disabled={creating} className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold">
            Lag side
          </button>
        </form>
        <div className="mt-3">
          <FormStatus state={createState} />
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Nytt blogginnlegg</h2>
        <p className="mb-3 text-sm text-neutral-600">
          Innleggene havner under /blogg. Første gang lages også bloggsiden med oversikten, og den legges i menyen.
        </p>
        <form action={postAction} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Tittel på innlegget</span>
            <input name="title" required maxLength={120} className={inputClass} />
          </label>
          <button disabled={posting} className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold">
            Lag innlegg
          </button>
        </form>
        <div className="mt-3">
          <FormStatus state={postState} />
        </div>
      </section>
    </div>
  );
}
