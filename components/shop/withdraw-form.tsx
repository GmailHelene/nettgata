"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { submitWithdrawal } from "@/app/actions/angre";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2 text-[var(--c-text)] focus-visible:outline-2 focus-visible:outline-[var(--c-primary)]";

/** Skjemaet på /angre-avtalen. Knappteksten følger angrerettloven § 20 a. */
export function WithdrawForm({ siteId, basePath, order }: { siteId: string; basePath: string; order: string }) {
  const [state, action, pending] = useActionState(submitWithdrawal.bind(null, siteId), null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const errorId = useId();
  const aboutHelp = useId();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      doneRef.current?.focus();
      return;
    }
    const field = state.field ? formRef.current?.querySelector<HTMLElement>(`[name="${state.field}"]`) : null;
    (field ?? alertRef.current)?.focus();
  }, [state]);

  if (state?.ok) {
    const r = state.receipt;
    return (
      <div role="status" className="rounded-[var(--radius)] bg-[var(--c-surface)] p-6">
        <h2 ref={doneRef} tabIndex={-1} className="text-xl font-semibold outline-none">
          Vi har fått beskjeden
        </h2>
        <p className="mt-2">Du har brukt angreretten. Dette er kvitteringen din:</p>
        <dl className="mt-4 space-y-2">
          <div>
            <dt className="font-semibold">Sendt</dt>
            <dd>{r.at}</dd>
          </div>
          <div>
            <dt className="font-semibold">Navn</dt>
            <dd>{r.name}</dd>
          </div>
          <div>
            <dt className="font-semibold">Gjelder</dt>
            <dd>{r.about}</dd>
          </div>
        </dl>
        <p className="mt-4">
          {r.emailed
            ? `Kvitteringen er også sendt til ${r.email}.`
            : `Vi fikk ikke sendt kvitteringen til ${r.email}. Beskjeden din er likevel registrert. Ta vare på denne siden, for eksempel med et skjermbilde.`}
        </p>
        <p className="mt-4">
          Send varen tilbake senest 14 dager etter denne meldingen.{" "}
          <Link href={`${basePath}/angrerett`} className="underline">
            Se hvordan du returnerer
          </Link>
        </p>
      </div>
    );
  }

  const v = state?.values;
  const invalid = (name: string) => (state && state.field === name ? { "aria-invalid": true, "aria-describedby": errorId } : {});

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
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
      <label className="block">
        <span className="mb-1 block font-medium">Hvilket kjøp gjelder det?</span>
        <input
          name="about"
          required
          maxLength={300}
          defaultValue={v?.about ?? (order ? `Ordre ${order}` : undefined)}
          aria-describedby={aboutHelp}
          className={inputClass}
          {...invalid("about")}
        />
        <span id={aboutHelp} className="mt-1 block text-sm text-[var(--c-muted)]">
          Skriv ordrenummeret, eller hva du kjøpte og omtrent når.
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">E-post til kvitteringen</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={v?.email} className={inputClass} {...invalid("email")} />
      </label>
      {state && !state.ok && (
        <p ref={alertRef} id={errorId} tabIndex={-1} role="alert" className="font-medium outline-none">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-[var(--radius)] bg-[var(--c-primary)] px-5 py-3 font-semibold text-[var(--c-on-primary)] disabled:opacity-60"
      >
        {pending ? "Sender..." : "Bekreft bruk av angrerett"}
      </button>
    </form>
  );
}
