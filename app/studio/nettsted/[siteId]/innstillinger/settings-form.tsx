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
        <h2 className="font-semibold">Navn og kontaktinfo</h2>
        <p className="text-sm text-neutral-600">Ett sted for alt: endringer her oppdaterer meny, bunntekst, kontaktsiden og Google.</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Navn</span>
          <input name="name" defaultValue={name} required className={inputClass} />
        </label>
        <InfoFields value={info} onChange={setInfo} />
      </section>
      <section aria-labelledby="search-console" className="space-y-3 rounded-lg border bg-white p-5">
        <h2 id="search-console" className="font-semibold">
          Koble til Google Search Console
        </h2>
        <p className="text-sm text-neutral-700">
          Search Console er gratis og viser hva folk søker på når de finner deg, og om Google har problemer med sidene. Tittel,
          beskrivelse, sitemap og strukturerte data lager vi for deg.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          <li>Gå til search.google.com/search-console og legg til nettstedet med «Prefiks for nettadresse».</li>
          <li>Velg å bekrefte med HTML-tagg, og kopier taggen.</li>
          <li>Lim den inn her og trykk Lagre. Trykk så Bekreft hos Google.</li>
          <li>Under Sitemaper skriver du sitemap.xml og sender inn.</li>
        </ol>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Taggen eller koden fra Google</span>
          <input
            name="googleVerification"
            defaultValue={info.googleVerification ?? ""}
            placeholder={'<meta name="google-site-verification" content="...">'}
            className={inputClass}
          />
        </label>
      </section>
      <FormStatus state={state} />
      <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Lagrer..." : "Lagre"}
      </button>
    </form>
  );
}
