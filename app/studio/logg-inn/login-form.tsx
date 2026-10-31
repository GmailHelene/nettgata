"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">E-post</span>
        <input name="email" type="email" autoComplete="email" required className="w-full rounded-md border border-neutral-400 px-3 py-2" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Passord</span>
        <input name="password" type="password" autoComplete="current-password" required className="w-full rounded-md border border-neutral-400 px-3 py-2" />
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="w-full rounded-md bg-neutral-900 px-4 py-2 font-semibold text-white disabled:opacity-60">
        {pending ? "Logger inn..." : "Logg inn"}
      </button>
    </form>
  );
}
