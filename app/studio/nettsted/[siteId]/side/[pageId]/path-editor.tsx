"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "@/app/studio/actions";
import { changePagePathAction } from "@/app/studio/site-actions";
import { inputClass } from "./fields";

/**
 * Adressen til siden. Endringen gjelder med en gang, ikke ved publisering, fordi den flytter siden.
 * Er siden publisert, sender den gamle adressen besøkende videre (301), så Google og gamle lenker følger med.
 */
export function PathEditor({ siteId, pageId, path, published }: { siteId: string; pageId: string; path: string; published: boolean }) {
  const [value, setValue] = useState(path);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const id = useId();
  if (path === "/") return null;

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-adresse`} className="block text-sm font-medium">
        Adressen til siden
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${id}-adresse`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={`${id}-hjelp`}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} max-w-sm flex-1 font-mono`}
        />
        <button
          type="button"
          disabled={pending || value.trim() === path}
          onClick={() =>
            start(async () => {
              const result = await changePagePathAction(siteId, pageId, value);
              setState(result);
              if (result.ok) {
                if (result.path) setValue(result.path);
                router.refresh();
              }
            })
          }
          className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Endrer..." : "Endre adresse"}
        </button>
      </div>
      <p id={`${id}-hjelp`} className="text-xs text-neutral-600">
        Små bokstaver, tall og bindestrek, for eksempel /om-oss. Gjelder med en gang.
        {published && " Den gamle adressen sender besøkende hit, så lenker og plasseringen i Google følger med."}
      </p>
      <div aria-live="polite">
        <FormStatus state={state} />
      </div>
    </div>
  );
}
