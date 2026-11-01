"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { openPortalAction } from "./actions";

/** Sender kunden til Stripe sin kundeportal og tilbake hit etterpå. */
export function PortalButton({ siteId, label }: { siteId: string; label: string }) {
  const [state, action, pending] = useActionState(openPortalAction.bind(null, siteId), null);
  return (
    <form action={action} className="mt-4 space-y-2">
      <button disabled={pending} className="rounded-md border border-[#173b6c] px-4 py-2 font-semibold disabled:opacity-60">
        {pending ? "Åpner Stripe..." : label}
      </button>
      <p className="text-sm text-neutral-600">Siden for kort og fakturaer ligger hos Stripe. Derfra kommer du tilbake hit.</p>
      <FormStatus state={state} />
    </form>
  );
}
