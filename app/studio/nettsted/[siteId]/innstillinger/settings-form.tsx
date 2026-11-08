"use client";

import { useActionState, useState } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { InfoFields, inputClass } from "@/components/studio/info-fields";
import type { SiteInfo } from "@/lib/site-info";
import { updateSettingsAction } from "../../../site-actions";

type Props = { siteId: string; name: string; info: SiteInfo };

export function SettingsForm({ siteId, name, info: initialInfo }: Props) {
  const [state, action, pending] = useActionState(updateSettingsAction.bind(null, siteId), null);
  const [info, setInfo] = useState(initialInfo);

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Navn, kontaktinfo og åpningstider</h2>
        <p className="text-sm text-neutral-600">Ett sted for alt: endringer her oppdaterer meny, bunntekst, kontaktsiden og Google.</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Navn</span>
          <input name="name" defaultValue={name} required className={inputClass} />
        </label>
        <InfoFields value={info} onChange={setInfo} />
      </section>
      {/* Skjemaet er langt, så lagreknappen følger med nederst i vinduet. Over bunnmenyen på mobil. */}
      <div className="sticky bottom-16 z-20 -mx-1 flex flex-wrap items-center gap-4 rounded-lg border bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:bottom-3">
        <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? "Lagrer..." : "Lagre"}
        </button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
