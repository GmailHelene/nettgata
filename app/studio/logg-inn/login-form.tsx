"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/studio/info-fields";
import { ui } from "@/components/studio/ui";
import { login } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className={ui.label}>E-post</span>
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="block">
        <span className={ui.label}>Passord</span>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      {state && !state.ok && (
        <p role="alert" className={ui.error}>
          {state.message}
        </p>
      )}
      <button disabled={pending} className={`${ui.button} w-full`}>
        {pending ? "Logger inn..." : "Logg inn"}
      </button>
    </form>
  );
}
