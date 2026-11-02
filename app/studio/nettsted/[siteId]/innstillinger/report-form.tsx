"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ReportPrefs } from "@/lib/rapport/mottakere";
import type { ActionState } from "../../../actions";
import { saveReportPrefsAction } from "./report-actions";

/** Rapportene på e-post. Valget gjelder bare den som er logget inn, ikke de andre på nettstedet. */
export function ReportForm({ siteId, initial, email }: { siteId: string; initial: ReportPrefs; email: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const toggle = (key: keyof ReportPrefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <section aria-labelledby="rapporter-epost" className="mt-8 space-y-4 rounded-lg border bg-white p-5">
      <h2 id="rapporter-epost" className="font-semibold">
        Rapporter på e-post
      </h2>
      <p className="text-sm text-neutral-600">Gjelder bare deg. E-postene går til {email}.</p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Hvilke rapporter du vil ha</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={prefs.monthlyReport} onChange={() => toggle("monthlyReport")} className="mt-1" />
          <span>Månedsrapport den 1. i måneden, med besøk, henvendelser og det som bør fikses</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={prefs.aiEmail} onChange={() => toggle("aiEmail")} className="mt-1" />
          <span>Beskjed når AI-teamet har nye forslag i den ukentlige rapporten</span>
        </label>
      </fieldset>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await saveReportPrefsAction(siteId, prefs)))}
        className="rounded-md bg-[#173b6c] px-5 py-2 font-semibold text-white disabled:opacity-60"
      >
        Lagre
      </button>
      <FormStatus state={state} />
    </section>
  );
}
