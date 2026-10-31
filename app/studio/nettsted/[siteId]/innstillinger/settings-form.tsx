"use client";

import { useActionState, useState } from "react";
import { DesignPicker, type DesignOption } from "@/components/studio/design-picker";
import { FormStatus } from "@/components/studio/form-status";
import { InfoFields, inputClass } from "@/components/studio/info-fields";
import type { SiteInfo } from "@/lib/site-info";
import { updateSettingsAction } from "../../../site-actions";

type Props = { siteId: string; name: string; info: SiteInfo; designs: DesignOption[]; currentDesign?: string };

export function SettingsForm({ siteId, name, info: initialInfo, designs, currentDesign }: Props) {
  const [state, action, pending] = useActionState(updateSettingsAction.bind(null, siteId), null);
  const [info, setInfo] = useState(initialInfo);

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Navn og kontaktinfo</h2>
        <p className="text-sm text-neutral-600">Ett sted for alt: endringer her oppdaterer meny, bunntekst, kontaktsiden og Google.</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Navn</span>
          <input name="name" defaultValue={name} required className={inputClass} />
        </label>
        <InfoFields value={info} onChange={setInfo} />
      </section>
      {designs.length > 0 && (
        <section className="rounded-lg border bg-white p-5">
          <DesignPicker designs={designs} defaultValue={currentDesign} />
        </section>
      )}
      <FormStatus state={state} />
      <button disabled={pending} className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Lagrer..." : "Lagre"}
      </button>
    </form>
  );
}
