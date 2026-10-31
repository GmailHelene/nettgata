"use client";

import { useActionState } from "react";
import { verifyCodeAction } from "../../actions";

export function CodeForm() {
  const [state, action, pending] = useActionState(verifyCodeAction, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Kode fra appen eller reservekode</span>
        <input
          name="code"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={20}
          spellCheck={false}
          className="w-full rounded-md border border-neutral-400 px-3 py-2 text-lg tracking-widest"
        />
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="w-full rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-60">
        {pending ? "Sjekker koden..." : "Logg inn"}
      </button>
    </form>
  );
}
