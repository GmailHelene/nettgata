"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { NotificationSettings } from "@/lib/notifications";
import type { ActionState } from "../../../actions";
import { saveNotificationsAction } from "../../../site-actions";

export function NotificationsForm({
  siteId,
  initial,
  contactEmail,
  shop,
  emailEnabled,
}: {
  siteId: string;
  initial: NotificationSettings;
  contactEmail: string;
  shop: boolean;
  /** false når e-post ikke er slått på i plattformen ennå. Da lagres varslene bare i loggen. */
  emailEnabled: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const toggle = (key: "newOrder" | "newInquiry" | "shipped") => setSettings((s) => ({ ...s, [key]: !s[key] }));

  return (
    <section className="mt-8 space-y-4 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Varsler på e-post</h2>
      {!emailEnabled && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
          E-post er ikke slått på i plattformen ennå. Varslene lagres i loggen og sendes ikke før det er på plass.
        </p>
      )}
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium">Send varsler til</span>
        <input
          type="email"
          value={settings.email}
          onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}
          placeholder={contactEmail || "navn@firma.no"}
          className="w-full rounded-md border border-neutral-400 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-neutral-600">
          {contactEmail ? `La feltet stå tomt for å bruke kontaktadressen (${contactEmail}).` : "Legg inn en adresse her eller under kontaktinfo, ellers får du ingen varsler."}
        </span>
      </label>
      <fieldset className="space-y-2">
        <legend className="sr-only">Hvilke varsler</legend>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={settings.newInquiry} onChange={() => toggle("newInquiry")} className="mt-1" />
          <span>Når noen sender en melding via kontaktskjemaet</span>
        </label>
        {shop && (
          <>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={settings.newOrder} onChange={() => toggle("newOrder")} className="mt-1" />
              <span>Når det kommer en ny ordre</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={settings.shipped} onChange={() => toggle("shipped")} className="mt-1" />
              <span>E-post til kunden når du markerer ordren som sendt, med sporing hvis du har lagt den inn</span>
            </label>
          </>
        )}
      </fieldset>
      {shop && <p className="text-sm text-neutral-600">Kunden får alltid ordrebekreftelse på e-post når de bestiller.</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await saveNotificationsAction(siteId, settings)))}
        className="rounded-md bg-[#173b6c] px-5 py-2 font-semibold text-white disabled:opacity-60"
      >
        Lagre varsler
      </button>
      <FormStatus state={state} />
    </section>
  );
}
