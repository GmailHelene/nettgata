"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { subscribeNewsletterAction } from "@/app/actions/newsletter";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2 text-[var(--c-text)] focus-visible:outline-2 focus-visible:outline-[var(--c-primary)]";

/**
 * Påmeldingsskjemaet i seksjonen «Nyhetsbrev». Samtykket står som tekst rett over knappen: det er å trykke på knappen
 * som er samtykket, og setningen lagres sammen med påmeldingen.
 */
export function NewsletterSignup({
  siteId,
  path,
  preview,
  sectionId,
  buttonText,
  consent,
  privacyHref,
}: {
  siteId: string;
  path: string;
  preview: boolean;
  sectionId: string;
  buttonText: string;
  consent: string;
  privacyHref: string;
}) {
  const [state, action, pending] = useActionState(subscribeNewsletterAction.bind(null, siteId), null);
  const ids = useId();
  const alertRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = `${ids}-feil`;
  const consentId = `${ids}-samtykke`;

  useEffect(() => {
    if (!state || state.ok) return;
    const field = state.field ? formRef.current?.querySelector<HTMLElement>(`[name="${state.field}"]`) : null;
    (field ?? alertRef.current)?.focus();
  }, [state]);
  const invalid = (name: string) => (state && !state.ok && state.field === name ? { "aria-invalid": true, "aria-describedby": `${errorId} ${consentId}` } : {});

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
      <input type="hidden" name="section" value={sectionId} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Ikke fyll ut dette feltet
          <input name="nettsted" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">E-post</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={state?.values?.email}
            aria-describedby={consentId}
            className={inputClass}
            {...invalid("email")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">
            Navn <span className="font-normal text-[var(--c-muted)]">(valgfritt)</span>
          </span>
          <input name="name" autoComplete="given-name" defaultValue={state?.values?.name} className={inputClass} {...invalid("name")} />
        </label>
      </div>
      <p id={consentId} className="text-sm">
        {consent}{" "}
        <a href={privacyHref} className="underline">
          Les om personvern
        </a>
        .
      </p>
      {state && !state.ok && (
        <p ref={alertRef} id={errorId} tabIndex={-1} role="alert" className="font-medium outline-none">
          {state.message}
        </p>
      )}
      <button
        disabled={pending || preview}
        className="rounded-[var(--radius)] bg-[var(--c-primary)] px-6 py-3 font-semibold text-[var(--c-on-primary)] disabled:opacity-60"
      >
        {preview ? "Påmeldingen er av i forhåndsvisning" : pending ? "Melder på..." : buttonText}
      </button>
    </form>
  );
}
