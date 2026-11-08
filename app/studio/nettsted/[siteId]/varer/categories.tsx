"use client";

import { useActionState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import { createCategoryAction, deleteCategoryAction } from "../../../shop-actions";

export function Categories({ siteId, categories }: { siteId: string; categories: { id: string; name: string }[] }) {
  const [state, action, creating] = useActionState(createCategoryAction.bind(null, siteId), null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-10 rounded-lg border bg-white p-5">
      <h2 className="mb-1 font-semibold">Samlinger</h2>
      <p className="mb-3 text-sm text-neutral-600">Samle varene i grupper. Kundene kan filtrere på dem, og du kan vise en samling i en vareseksjon på forsiden.</p>
      {categories.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-full bg-neutral-100 py-1 pl-3 pr-1 text-sm">
              {c.name}
              <button
                type="button"
                disabled={pending}
                aria-label={`Slett samlingen ${c.name}`}
                className="rounded-full px-2 hover:bg-neutral-300"
                onClick={() => {
                  if (confirm(`Slette samlingen «${c.name}»? Varene blir ikke slettet.`)) {
                    startTransition(() => deleteCategoryAction(siteId, c.id));
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex items-end gap-2">
        <label className="block flex-1">
          <span className="mb-1 block text-sm font-medium">Ny samling</span>
          <input name="name" placeholder="F.eks. Julepynt" className={inputClass} />
        </label>
        <button disabled={creating} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold">
          Legg til
        </button>
      </form>
      <div className="mt-3">
        <FormStatus state={state} />
      </div>
    </section>
  );
}
