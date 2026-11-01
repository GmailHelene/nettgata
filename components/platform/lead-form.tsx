"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { submitLead } from "@/app/actions/lead";
import { needs, type Need } from "@/lib/leads";
import { trackLead } from "./consent";

const input =
  "w-full rounded-lg border border-[#173b6c]/30 bg-white px-3 py-2.5 text-[#173b6c] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#173b6c]";

/** «Få nettside» på nettgata.no. Henvendelsen havner i Nettgata sin innboks i studioet. */
export function LeadForm({ source, need = "nettside", bransje = "", sendTo }: { source: string; need?: Need; bransje?: string; sendTo?: string }) {
  const [state, action, pending] = useActionState(submitLead, null);
  const v = state?.values;

  const done = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  const invalid = (name: string) => (state && !state.ok && state.field === name ? { "aria-invalid": true, "aria-describedby": errorId } : {});

  useEffect(() => {
    if (state?.saved && state.id) trackLead(state.id, sendTo);
    // Skjemaet forsvinner og siden blir kortere, så bekreftelsen hentes fram og får fokus.
    if (state?.ok) {
      done.current?.scrollIntoView({ block: "center" });
      done.current?.focus();
    } else if (state) {
      // Feltet med feil får fokus. Uten felt får meldingen fokus.
      const field = state.field ? formRef.current?.querySelector<HTMLElement>(`[name="${state.field}"]`) : null;
      (field ?? alertRef.current)?.focus();
    }
  }, [state, sendTo]);

  if (state?.ok) {
    return (
      <p ref={done} tabIndex={-1} role="status" className="rounded-xl bg-[#e4ede8] p-6 text-lg font-semibold text-[#1e3d30] outline-none">
        {state.message}
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <input type="hidden" name="source" value={source} />
      {/* Skjult for mennesker, fanger opp roboter. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Ikke fyll ut dette feltet
          <input name="nettsted" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-2 font-semibold">Hva trenger du?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(needs) as Need[]).map((key) => (
            <label
              key={key}
              className="cursor-pointer rounded-full border border-[#173b6c]/30 bg-white px-4 py-2 has-[:checked]:border-[#173b6c] has-[:checked]:bg-[#173b6c] has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#173b6c]"
            >
              <input type="radio" name="need" value={key} defaultChecked={(v?.need ?? need) === key} className="sr-only" />
              {needs[key]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-medium">Navn</span>
          <input name="name" required autoComplete="name" defaultValue={v?.name} className={input} {...invalid("name")} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Bedrift eller org.nr.</span>
          <input name="company" autoComplete="organization" defaultValue={v?.company} className={input} {...invalid("company")} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">E-post</span>
          <input name="email" type="email" required autoComplete="email" defaultValue={v?.email} className={input} {...invalid("email")} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">
            Telefon <span className="font-normal text-[#47525c]">(valgfritt)</span>
          </span>
          <input name="phone" type="tel" autoComplete="tel" defaultValue={v?.phone} className={input} {...invalid("phone")} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block font-medium">
          Bransje <span className="font-normal text-[#47525c]">(valgfritt)</span>
        </span>
        <input name="bransje" defaultValue={v?.bransje ?? bransje} placeholder="For eksempel frisør eller rørlegger" className={input} {...invalid("bransje")} />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">
          Noe mer jeg bør vite? <span className="font-normal text-[#47525c]">(valgfritt)</span>
        </span>
        <textarea name="message" rows={4} defaultValue={v?.message} className={input} {...invalid("message")} />
      </label>
      {state && !state.ok && (
        <p ref={alertRef} id={errorId} tabIndex={-1} role="alert" className="font-semibold text-[#9b1c1c] outline-none">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending} className="rounded-lg bg-[#173b6c] px-6 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? "Sender..." : "Send, så tar jeg kontakt"}
        </button>
        <p className="text-sm text-[#47525c]">
          Jeg bruker opplysningene bare til å svare deg.{" "}
          <Link href="/personvern" className="underline">
            Personvern
          </Link>
        </p>
      </div>
    </form>
  );
}
