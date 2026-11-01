"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import { acceptInvitationAction } from "@/app/studio/access-actions";

export function AcceptForm({ token, mode, email, owner }: { token: string; mode: "new" | "existing"; email: string; owner: boolean }) {
  const [state, action, pending] = useActionState(acceptInvitationAction.bind(null, token), null);
  return (
    <form action={action} className="space-y-4">
      {mode === "new" && (
        <>
          <p className="text-sm text-neutral-700">Lag passord for {email}.</p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Navn</span>
            <input name="name" required autoComplete="name" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Passord (minst 12 tegn)</span>
            <input name="password" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Gjenta passordet</span>
            <input name="password2" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
          </label>
        </>
      )}
      {owner && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="vilkar" value="ja" required className="mt-1" />
          <span>
            Jeg godtar{" "}
            <a href="/vilkar" target="_blank" className="underline">
              vilkårene
            </a>{" "}
            og{" "}
            <a href="/databehandleravtale" target="_blank" className="underline">
              databehandleravtalen
            </a>{" "}
            for Nettgata på vegne av virksomheten.
          </span>
        </label>
      )}
      <FormStatus state={state} />
      <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Et øyeblikk..." : mode === "new" ? "Lag bruker og gå videre" : "Godta invitasjonen"}
      </button>
    </form>
  );
}
