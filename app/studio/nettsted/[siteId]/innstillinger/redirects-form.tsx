"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "@/app/studio/actions";
import { saveRedirectsAction } from "@/app/studio/site-actions";
import type { Redirect } from "@/lib/redirects";

/**
 * Flytting fra en gammel nettside: gamle adresser sendes videre til de nye med 301, så lenker og plassering i Google
 * blir med. Én omdirigering per linje, gammel adresse først.
 */
export function RedirectsForm({ siteId, initial }: { siteId: string; initial: Redirect[] }) {
  const [text, setText] = useState(() => initial.map((r) => `${r.from} ${r.to}`).join("\n"));
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-8 space-y-3 rounded-lg border bg-white p-5">
      <div>
        <h2 className="font-semibold">Flytter du fra en gammel nettside?</h2>
        <p className="text-sm text-neutral-600">
          Skriv gammel adresse og ny adresse på hver linje. Besøkende og Google sendes da videre, så du ikke mister plasseringen i søk. Hele
          adresser fra den gamle nettsiden går fint.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Omdirigeringer</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={"/om-oss.html /om-oss\nhttps://gammelside.no/?page_id=12 /tjenester"}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm"
        />
      </label>
      <FormStatus state={state} />
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await saveRedirectsAction(siteId, text)))}
        className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Lagrer..." : "Lagre omdirigeringer"}
      </button>
    </section>
  );
}
