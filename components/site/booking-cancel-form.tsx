"use client";

import { useActionState, useEffect, useRef } from "react";
import { cancelBookingAction } from "@/app/actions/booking";

/** Knappen som avbestiller. Svaret leses opp og får fokus, så skjermleseren sier hva som skjedde. */
export function BookingCancelForm({ siteId, token, label }: { siteId: string; token: string; label: string }) {
  const [state, action, pending] = useActionState(cancelBookingAction.bind(null, siteId), null);
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
        {pending ? "Avbestiller..." : label}
      </button>
    </form>
  );
}
