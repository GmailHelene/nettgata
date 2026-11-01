"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { submitInquiry } from "@/app/actions/inquiry";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2 text-[var(--c-text)] focus-visible:outline-2 focus-visible:outline-[var(--c-primary)]";

export function ContactForm({ siteId, path, preview }: { siteId: string; path: string; preview: boolean }) {
  const [state, action, pending] = useActionState(submitInquiry.bind(null, siteId), null);

  const v = state?.values;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  // Feltet med feil får fokus og blir merket. Uten felt får meldingen fokus.
  useEffect(() => {
    if (!state || state.ok) return;
    const field = state.field ? formRef.current?.querySelector<HTMLElement>(`[name="${state.field}"]`) : null;
    (field ?? alertRef.current)?.focus();
  }, [state]);
  const invalid = (name: string) => (state && !state.ok && state.field === name ? { "aria-invalid": true, "aria-describedby": errorId } : {});

  if (state?.ok) {
    return (
      <p role="status" className="rounded-[var(--radius)] bg-[var(--c-surface)] p-6 font-semibold">
        {state.message}
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <input type="hidden" name="path" value={path} />
      {/* Skjult for mennesker, fanger opp roboter. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Ikke fyll ut dette feltet
          <input name="nettsted" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block font-medium">Navn</span>
        <input name="name" required autoComplete="name" defaultValue={v?.name} className={inputClass} {...invalid("name")} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">E-post</span>
          <input name="email" type="email" autoComplete="email" defaultValue={v?.email} className={inputClass} {...invalid("email")} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Telefon</span>
          <input name="phone" type="tel" autoComplete="tel" defaultValue={v?.phone} className={inputClass} {...invalid("phone")} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block font-medium">Hva kan vi hjelpe deg med?</span>
        <textarea name="message" required rows={5} defaultValue={v?.message} className={inputClass} {...invalid("message")} />
      </label>
      {state && !state.ok && (
        <p ref={alertRef} id={errorId} tabIndex={-1} role="alert" className="font-medium outline-none">
          {state.message}
        </p>
      )}
      <button
        disabled={pending || preview}
        className="rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-3 font-semibold text-[var(--c-on-primary)] disabled:opacity-60"
      >
        {preview ? "Skjemaet er av i forhåndsvisning" : pending ? "Sender..." : "Send melding"}
      </button>
    </form>
  );
}
