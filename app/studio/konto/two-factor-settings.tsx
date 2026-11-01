"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionState } from "../actions";
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  renewRecoveryCodesAction,
  resetTwoFactorAction,
  startTwoFactorAction,
} from "../account-actions";

const inputClass = "w-full rounded-md border border-neutral-400 bg-white px-3 py-2";
const primary = "rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";
const secondary = "rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60";

function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`rounded-md p-3 text-sm ${state.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
      {state.message}
    </p>
  );
}

/** Reservekodene vises bare én gang. Kan kopieres eller lastes ned som tekstfil. */
function RecoveryCodes({ email, codes, onDone }: { email: string; codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Reservekoder for Nettgata (${email})\n\n${codes.join("\n")}\n\nHver kode kan brukes én gang hvis du ikke har telefonen.\n`;
  return (
    <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold">Ta vare på reservekodene</p>
      <p className="text-sm">
        Har du ikke telefonen, kan du logge inn med en av disse. Hver kode virker én gang. De vises ikke igjen, så lagre dem i Bitwarden
        eller skriv dem ut.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-base">
        {codes.map((code) => (
          <li key={code} className="rounded bg-white px-3 py-1.5 text-center">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={secondary}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Kopiert" : "Kopier kodene"}
        </button>
        <a className={secondary} href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="nettgata-reservekoder.txt">
          Last ned som tekstfil
        </a>
        <button type="button" className={primary} onClick={onDone}>
          Jeg har tatt vare på kodene
        </button>
      </div>
    </div>
  );
}

/** Kodefelt som går igjen: slå av, nye reservekoder og bekreftelse av oppsettet. */
function CodeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="one-time-code"
        maxLength={20}
        spellCheck={false}
        className={`${inputClass} max-w-48 text-lg tracking-widest`}
      />
    </label>
  );
}

export function TwoFactorSettings({ email, enabled, recoveryLeft }: { email: string; enabled: boolean; recoveryLeft: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionState>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");

  const finish = () => {
    setCodes(null);
    setSetup(null);
    setCode("");
    router.refresh();
  };

  if (codes) return <section className="mt-10"><RecoveryCodes email={email} codes={codes} onDone={finish} /></section>;

  return (
    <section aria-labelledby="tofaktor" className="mt-10 space-y-4 rounded-lg border border-neutral-300 bg-white p-5">
      <h2 id="tofaktor" className="text-lg font-semibold">
        Tofaktorinnlogging
      </h2>

      {enabled ? (
        <>
          <p className="text-sm">
            <span className="mr-2 rounded bg-green-100 px-2 py-0.5 font-semibold text-green-900">På</span>
            Du logger inn med passord og en kode fra appen. {recoveryLeft === 1 ? "1 reservekode" : `${recoveryLeft} reservekoder`} igjen.
          </p>
          <p className="text-sm text-neutral-700">Skriv inn koden fra appen for å lage nye reservekoder eller slå av tofaktor.</p>
          <CodeField id="kode-endre" label="Kode fra appen" value={code} onChange={setCode} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending || !code.trim()}
              className={secondary}
              onClick={() =>
                startTransition(async () => {
                  const result = await renewRecoveryCodesAction(code);
                  if (result.ok) setCodes(result.codes);
                  else setStatus(result);
                })
              }
            >
              Lag nye reservekoder
            </button>
            <button
              type="button"
              disabled={pending || !code.trim()}
              className="rounded-md px-4 py-2 text-sm font-semibold text-red-800 underline disabled:opacity-60"
              onClick={() => {
                if (!confirm("Slå av tofaktorinnlogging? Da holder passordet alene for å logge inn.")) return;
                startTransition(async () => {
                  const result = await disableTwoFactorAction(code);
                  setStatus(result);
                  if (result?.ok) finish();
                });
              }}
            >
              Slå av tofaktor
            </button>
          </div>
        </>
      ) : setup ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Åpne Google Authenticator, Microsoft Authenticator, 1Password eller en annen kodeapp.</li>
            <li>Velg å legge til en konto, og skann QR-koden.</li>
            <li>Skriv inn den sekssifrede koden appen viser.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR-koden lages på serveren som SVG */}
          <img src={setup.qr} alt="QR-kode for å legge til Nettgata i kodeappen" width={208} height={208} className="rounded border border-neutral-200" />
          <p className="text-sm">
            Kan du ikke skanne? Skriv inn denne nøkkelen i appen:{" "}
            <code className="break-all rounded bg-neutral-100 px-2 py-1 font-mono">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </p>
          <CodeField id="kode-bekreft" label="Kode fra appen" value={code} onChange={setCode} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending || !code.trim()}
              className={primary}
              onClick={() =>
                startTransition(async () => {
                  const result = await confirmTwoFactorAction(code);
                  if (result.ok) {
                    setStatus(null);
                    setCodes(result.codes);
                  } else setStatus(result);
                })
              }
            >
              Bekreft og slå på
            </button>
            <button type="button" className={secondary} onClick={() => setSetup(null)}>
              Avbryt
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-700">
            Med tofaktor trenger du både passordet og en kode fra telefonen for å logge inn. Selv om noen får tak i passordet, kommer de
            ikke inn. Vi anbefaler det for alle, og særlig for nettbutikker.
          </p>
          <button
            type="button"
            disabled={pending}
            className={primary}
            onClick={() =>
              startTransition(async () => {
                const result = await startTwoFactorAction();
                if (result.ok) {
                  setStatus(null);
                  setSetup({ secret: result.secret, qr: result.qr });
                } else setStatus(result);
              })
            }
          >
            Slå på tofaktorinnlogging
          </button>
        </>
      )}
      <Status state={status} />
    </section>
  );
}

/** Plattformadmin: nullstill tofaktor for en kunde som har mistet både telefon og reservekoder. */
export function AdminReset() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionState>(null);
  return (
    <section aria-labelledby="nullstill" className="mt-10 space-y-3 rounded-lg border border-neutral-300 bg-white p-5">
      <h2 id="nullstill" className="text-lg font-semibold">
        Nullstill tofaktor for en kunde
      </h2>
      <p className="text-sm text-neutral-700">
        Bare når kunden har mistet både telefonen og reservekodene. Sjekk at det faktisk er kunden som spør, før du gjør det.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("email") ?? "");
          if (!confirm(`Nullstille tofaktor for ${email}?`)) return;
          startTransition(async () => setStatus(await resetTwoFactorAction(email)));
        }}
      >
        <label className="block min-w-64 flex-1">
          <span className="mb-1 block text-sm font-medium">Kundens e-post</span>
          <input name="email" type="email" required className={inputClass} />
        </label>
        <button disabled={pending} className={secondary}>
          Nullstill
        </button>
      </form>
      <Status state={status} />
    </section>
  );
}
