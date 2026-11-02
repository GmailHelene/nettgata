"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import {
  confirmEmailAction,
  registerAction,
  requestResetAction,
  resendOwnVerificationAction,
  resendVerificationAction,
  resetPasswordAction,
  type AccountState,
} from "@/app/studio/registrer/actions";
import { inputClass } from "./info-fields";
import { ui } from "./ui";

/*
 * Skjemaene for selvbetjent konto: registrering, ny bekreftelse, glemt passord og nytt passord.
 * Feil kobles til feltet med aria-describedby og aria-invalid, og fokus flyttes til feltet med feil eller til
 * meldingen, så tastatur og skjermleser får med seg svaret (WCAG 3.3.1, 3.3.3 og 2.4.3).
 */

type Field = NonNullable<NonNullable<AccountState>["field"]>;

/** Flytter fokus til feltet med feil, eller til meldingen når svaret kommer. */
function useFocusOnResult(state: AccountState, form: React.RefObject<HTMLFormElement | null>, message: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!state) return;
    const field = state.field && form.current?.querySelector<HTMLElement>(`[data-field="${state.field}"]`);
    (field || message.current)?.focus();
  }, [state, form, message]);
}

function Message({ state, id, refEl }: { state: AccountState; id: string; refEl: React.RefObject<HTMLParagraphElement | null> }) {
  if (!state) return null;
  return (
    <p ref={refEl} id={id} tabIndex={-1} role={state.ok ? "status" : "alert"} className={`whitespace-pre-line outline-none ${state.ok ? ui.success : ui.error}`}>
      {state.message}
    </p>
  );
}

/** Feltet med feil får meldingen som beskrivelse. Andre felt beholder hjelpeteksten sin. */
function fieldProps(state: AccountState, field: Field, messageId: string, hintId?: string) {
  const invalid = Boolean(state && !state.ok && state.field === field);
  const describedBy = [hintId, invalid ? messageId : null].filter(Boolean).join(" ") || undefined;
  return { "data-field": field, "aria-invalid": invalid || undefined, "aria-describedby": describedBy };
}

/** Skjult for mennesker, fanger opp roboter. Samme navn som i skjemaet på nettgata.no. */
function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Ikke fyll ut dette feltet
        <input name="nettsted" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

type TurnstileApi = {
  render(el: HTMLElement, options: { sitekey: string; language?: string; "response-field-name"?: string }): string;
  reset(id: string): void;
  remove(id: string): void;
};

/**
 * Cloudflare Turnstile, bare når nøkkelen er satt (lib/selvbetjening/turnstile.ts). Svaret legges i skjemaet som
 * cf-turnstile-response. Det kan brukes én gang, så utfordringen lages på nytt etter hvert svar fra serveren.
 */
function Turnstile({ siteKey, state }: { siteKey: string | null; state: AccountState }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const render = () => {
    const api = (window as { turnstile?: TurnstileApi }).turnstile;
    if (!siteKey || !api || !box.current || widget.current) return;
    widget.current = api.render(box.current, { sitekey: siteKey, language: "nb" });
  };
  useEffect(() => {
    render();
    return () => {
      const api = (window as { turnstile?: TurnstileApi }).turnstile;
      if (api && widget.current) api.remove(widget.current);
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  useEffect(() => {
    const api = (window as { turnstile?: TurnstileApi }).turnstile;
    if (state && api && widget.current) api.reset(widget.current);
  }, [state]);
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
      <div ref={box} />
    </>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button disabled={pending} className={`${ui.button} w-full`}>
      {pending ? busy : idle}
    </button>
  );
}

export function RegisterForm({ siteKey }: { siteKey: string | null }) {
  const [state, action, pending] = useActionState(registerAction, null);
  const form = useRef<HTMLFormElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const messageId = useId();
  const passwordHint = useId();
  useFocusOnResult(state, form, message);

  if (state?.ok) {
    return (
      <div className="space-y-6">
        <Message state={state} id={messageId} refEl={message} />
        <ResendForm email={state.email ?? ""} />
      </div>
    );
  }

  return (
    <form ref={form} action={action} className="space-y-5" noValidate>
      <Honeypot />
      <label className="block">
        <span className={ui.label}>Navn</span>
        <input name="name" autoComplete="name" required maxLength={100} className={inputClass} {...fieldProps(state, "name", messageId)} />
      </label>
      <label className="block">
        <span className={ui.label}>E-post</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className={inputClass} {...fieldProps(state, "email", messageId)} />
      </label>
      <label className="block">
        <span className={ui.label}>Passord</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className={inputClass}
          {...fieldProps(state, "password", messageId, passwordHint)}
        />
        <span id={passwordHint} className={`mt-1.5 block text-sm ${ui.muted}`}>
          Minst 12 tegn. Gjerne noen ord etter hverandre som bare du kjenner.
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input name="terms" type="checkbox" value="ja" required className="mt-1 size-5 shrink-0 accent-[#173b6c]" {...fieldProps(state, "terms", messageId)} />
        <span className="text-sm">
          Jeg godtar{" "}
          <Link href="/vilkar" target="_blank" className={ui.link}>
            vilkårene
          </Link>{" "}
          og{" "}
          <Link href="/databehandleravtale" target="_blank" className={ui.link}>
            databehandleravtalen
          </Link>{" "}
          for virksomheten. Les også{" "}
          <Link href="/personvern" target="_blank" className={ui.link}>
            personvernerklæringen
          </Link>
          .<span className="sr-only"> Lenkene åpnes i en ny fane.</span>
        </span>
      </label>
      <Turnstile siteKey={siteKey} state={state} />
      <Message state={state} id={messageId} refEl={message} />
      <Submit pending={pending} idle="Lag konto" busy="Lager kontoen..." />
    </form>
  );
}

/** «Send lenken på nytt», under svaret etter registreringen og på siden for en lenke som er gått ut. */
export function ResendForm({ email = "" }: { email?: string }) {
  const [state, action, pending] = useActionState(resendVerificationAction, null);
  const form = useRef<HTMLFormElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const messageId = useId();
  useFocusOnResult(state, form, message);
  return (
    <form ref={form} action={action} className={`${ui.card} space-y-4 p-4`}>
      <p className="text-sm font-semibold">Fikk du ingen e-post?</p>
      <label className="block">
        <span className={ui.label}>E-post</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={email} className={inputClass} {...fieldProps(state, "email", messageId)} />
      </label>
      <Message state={state} id={messageId} refEl={message} />
      <button disabled={pending} className={`${ui.buttonGhost} w-full`}>
        {pending ? "Sender..." : "Send lenken på nytt"}
      </button>
    </form>
  );
}

/** For den som er logget inn uten å ha bekreftet e-posten. */
export function ResendOwnButton() {
  const [state, action, pending] = useActionState(resendOwnVerificationAction, null);
  const message = useRef<HTMLParagraphElement>(null);
  const messageId = useId();
  useEffect(() => {
    if (state) message.current?.focus();
  }, [state]);
  return (
    <form action={action} className="space-y-3">
      <button disabled={pending} className={ui.buttonGhost}>
        {pending ? "Sender..." : "Send lenken på nytt"}
      </button>
      <Message state={state} id={messageId} refEl={message} />
    </form>
  );
}

/** Knappen på siden bak bekreftelseslenken. */
export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmEmailAction.bind(null, token), null);
  const message = useRef<HTMLParagraphElement>(null);
  const messageId = useId();
  useEffect(() => {
    if (state) message.current?.focus();
  }, [state]);
  return (
    <div className="space-y-6">
      <form action={action}>
        <Submit pending={pending} idle="Bekreft e-posten" busy="Bekrefter..." />
      </form>
      <Message state={state} id={messageId} refEl={message} />
      {state && !state.ok && <ResendForm />}
    </div>
  );
}

export function ResetRequestForm({ siteKey }: { siteKey: string | null }) {
  const [state, action, pending] = useActionState(requestResetAction, null);
  const form = useRef<HTMLFormElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const messageId = useId();
  useFocusOnResult(state, form, message);
  return (
    <form ref={form} action={action} className="space-y-5" noValidate>
      <Honeypot />
      <label className="block">
        <span className={ui.label}>E-post</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={state?.email} className={inputClass} {...fieldProps(state, "email", messageId)} />
      </label>
      <Turnstile siteKey={siteKey} state={state} />
      <Message state={state} id={messageId} refEl={message} />
      <Submit pending={pending} idle="Send lenke" busy="Sender..." />
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, token), null);
  const form = useRef<HTMLFormElement>(null);
  const message = useRef<HTMLParagraphElement>(null);
  const messageId = useId();
  const hint = useId();
  useFocusOnResult(state, form, message);
  return (
    <form ref={form} action={action} className="space-y-5" noValidate>
      <label className="block">
        <span className={ui.label}>Nytt passord</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={12} className={inputClass} {...fieldProps(state, "password", messageId, hint)} />
        <span id={hint} className={`mt-1.5 block text-sm ${ui.muted}`}>
          Minst 12 tegn.
        </span>
      </label>
      <label className="block">
        <span className={ui.label}>Skriv passordet en gang til</span>
        <input name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </label>
      <Message state={state} id={messageId} refEl={message} />
      <Submit pending={pending} idle="Lagre nytt passord" busy="Lagrer..." />
    </form>
  );
}

export function AccountLinks({ children }: { children: ReactNode }) {
  return <div className={`mt-10 space-y-2 text-sm ${ui.muted}`}>{children}</div>;
}
