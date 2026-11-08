"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import { saveGoogleVerificationAction } from "../../../../site-actions";

/** Search Console-koden. Eget skjema, så det ikke blandes med kontaktinfo og åpningstider. */
export function GoogleForm({ siteId, code }: { siteId: string; code: string }) {
  const [state, action, pending] = useActionState(saveGoogleVerificationAction.bind(null, siteId), null);

  return (
    <form action={action} aria-labelledby="search-console" className="space-y-3 rounded-lg border bg-white p-5">
      <h2 id="search-console" className="font-semibold">
        Koble til Google Search Console
      </h2>
      <p className="text-sm text-neutral-700">
        Search Console er gratis og viser hva folk søker på når de finner deg, og om Google har problemer med sidene.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
        <li>Gå til search.google.com/search-console og legg til nettstedet med «Prefiks for nettadresse».</li>
        <li>Velg å bekrefte med HTML-tagg, og kopier taggen.</li>
        <li>Lim den inn her og trykk Lagre. Trykk så Bekreft hos Google.</li>
        <li>Under Sitemaper skriver du sitemap.xml og sender inn.</li>
      </ol>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Taggen eller koden fra Google</span>
        <input name="googleVerification" defaultValue={code} placeholder={'<meta name="google-site-verification" content="...">'} className={inputClass} />
      </label>
      <FormStatus state={state} />
      <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Lagrer..." : "Lagre"}
      </button>
    </form>
  );
}
