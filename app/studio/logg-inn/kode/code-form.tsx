"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/studio/info-fields";
import { ui } from "@/components/studio/ui";
import { verifyCodeAction } from "../../actions";

export function CodeForm() {
  const [state, action, pending] = useActionState(verifyCodeAction, null);
  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className={ui.label}>Kode fra appen eller reservekode</span>
        <input
          name="code"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={20}
          spellCheck={false}
          className={`${inputClass} text-lg tracking-widest`}
        />
      </label>
      {state && !state.ok && (
        <p role="alert" className={ui.error}>
          {state.message}
        </p>
      )}
      <button disabled={pending} className={`${ui.button} w-full`}>
        {pending ? "Sjekker koden..." : "Logg inn"}
      </button>
    </form>
  );
}
