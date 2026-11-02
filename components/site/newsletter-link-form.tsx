"use client";

import { useActionState, useEffect, useRef } from "react";
import { confirmNewsletterAction, unsubscribeNewsletterAction } from "@/app/actions/newsletter";

const actions = { bekreft: confirmNewsletterAction, avmeld: unsubscribeNewsletterAction } as const;

/** Knappen på bekreftelses- og avmeldingssiden. Svaret får fokus, så skjermleseren sier hva som skjedde. */
export function NewsletterLinkForm({ kind, siteId, token, label, pendingLabel }: { kind: keyof typeof actions; siteId: string; token: string; label: string; pendingLabel: string }) {
  const [state, action, pending] = useActionState(actions[kind].bind(null, siteId), null);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state) ref.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <p ref={ref} tabIndex={-1} role="status" className="rounded-[var(--radius)] bg-[var(--c-surface)] p-5 font-semibold outline-none">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      {state && (
        <p ref={ref} tabIndex={-1} role="alert" className="font-medium outline-none">
          {state.message}
        </p>
      )}
      <button className="ng-btn" disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
