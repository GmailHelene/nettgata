"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import type { ProviderView } from "@/lib/payments/config";
import type { KeyProvider, PaymentEnvironment } from "@/lib/payments/state";
import type { ActionState } from "../../../actions";
import { removePaymentKeysAction, savePaymentKeysAction, testPaymentConnectionAction } from "./actions";

type Field = { name: string; label: string; secret?: boolean; numeric?: boolean; hint?: string };

const setup: Record<KeyProvider, { name: string; intro: string; hintLabel: string; testLabel: string; fields: Field[]; help: React.ReactNode }> = {
  vipps: {
    name: "Vipps",
    intro: "Kunden godkjenner betalingen i Vipps-appen. Beløpet reserveres med en gang og trekkes når du markerer ordren som sendt eller hentet.",
    hintLabel: "Client ID",
    testLabel: "Test (apitest.vipps.no)",
    fields: [
      { name: "clientId", label: "Client ID (client_id)" },
      { name: "clientSecret", label: "Client secret (client_secret)", secret: true },
      { name: "subscriptionKey", label: "Abonnementsnøkkel (Ocp-Apim-Subscription-Key)", secret: true },
      { name: "msn", label: "Salgsstednummer (MSN)", numeric: true, hint: "Tallet som viser hvilket salgssted betalingene går til, vanligvis seks siffer." },
    ],
    help: (
      <>
        <p>Du trenger en avtale med Vipps MobilePay om Vipps på nett.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Logg inn på portal.vippsmobilepay.com.</li>
          <li>Åpne For utviklere, og velg Test eller Produksjon.</li>
          <li>Finn salgsstedet ditt og trykk Vis nøkler.</li>
          <li>Kopier client_id, client_secret, Ocp-Apim-Subscription-Key og salgsstednummeret (MSN) hit, ett felt om gangen.</li>
        </ol>
        <p className="mt-2">For å betale i testmiljøet trenger du Vipps sin egen testapp og en testbruker. Den vanlige Vipps-appen virker bare i produksjon.</p>
      </>
    ),
  },
  klarna: {
    name: "Klarna",
    intro: "Kunden velger kort, faktura eller delbetaling hos Klarna. Kortet belastes eller fakturaen sendes når du markerer ordren som sendt eller hentet.",
    hintLabel: "Brukernavn",
    testLabel: "Test (Klarna playground)",
    fields: [
      { name: "username", label: "Brukernavn (Key ID)" },
      { name: "password", label: "Passord (Secret)", secret: true },
    ],
    help: (
      <>
        <p>Du trenger en avtale med Klarna for butikken.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Logg inn i Klarna Merchant Portal på portal.klarna.com. Testnøkler lager du i testportalen på portal.playground.klarna.com.</li>
          <li>Gå til betalingsinnstillingene og velg Klarna API keys.</li>
          <li>Lag en ny nøkkel. Du får et brukernavn (Key ID) og et passord (Secret).</li>
          <li>Lim inn begge her med en gang. Klarna viser passordet bare én gang.</li>
        </ol>
      </>
    ),
  },
  kustom: {
    name: "Kustom",
    intro:
      "Kustom er en ferdig kasse (tidligere Klarna Checkout) der kunden velger betalingsmåte inne i Kustom. Beløpet trekkes når du markerer ordren som sendt eller hentet.",
    hintLabel: "API-brukernavn",
    testLabel: "Test (Kustom playground)",
    fields: [
      { name: "username", label: "API-brukernavn" },
      { name: "password", label: "API-passord", secret: true },
    ],
    help: (
      <>
        <p>Du trenger en avtale med Kustom for butikken.</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Logg inn i Kustom Portal. Testnøkler lager du i playground-portalen.</li>
          <li>Gå til API-innstillingene (Developers, API) og trykk Generate new.</li>
          <li>Du får et API-brukernavn og et API-passord. Testpassordet begynner med kco_test_api_.</li>
          <li>Lim inn begge her med en gang. Kustom viser passordet bare én gang.</li>
        </ol>
      </>
    ),
  },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function Status({ view }: { view: ProviderView | null }) {
  if (!view) return <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-800">Ikke koblet til</span>;
  if (view.ready) {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-900">
        Koblet til{view.environment === "test" ? " (testmiljø)" : ""}
      </span>
    );
  }
  return <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-900">Ikke i bruk før testen lykkes</span>;
}

/**
 * Ett kort per betalingsløsning. Nøklene skrives inn her og sendes til serveren, men kommer aldri tilbake:
 * studioet ser bare om løsningen er koblet til, hvilket miljø og de fire siste tegnene.
 */
export function ProviderForm({ siteId, provider, view, canEdit }: { siteId: string; provider: KeyProvider; view: ProviderView | null; canEdit: boolean }) {
  const info = setup[provider];
  const [editing, setEditing] = useState(false);
  const [environment, setEnvironment] = useState<PaymentEnvironment>(view?.environment ?? "test");
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const id = (field: string) => `${provider}-${field}`;
  const showForm = canEdit && (editing || view === null);

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      setState(await action());
    });

  const save = () =>
    startTransition(async () => {
      const result = await savePaymentKeysAction(siteId, provider, { ...values, environment });
      setState(result);
      // Er nøklene lagret (også når testen feilet), ligger de ikke igjen i skjemaet.
      if (result.saved) {
        setValues({});
        setEditing(false);
      }
    });

  return (
    <section aria-labelledby={id("tittel")} className="space-y-4 rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id("tittel")} className="text-lg font-semibold">
          {info.name}
        </h2>
        <Status view={view} />
      </div>
      <p className="text-sm text-neutral-700">{info.intro}</p>

      {view && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Miljø</dt>
          <dd>{view.environment === "test" ? "Test" : "Produksjon"}</dd>
          <dt className="text-neutral-600">{info.hintLabel}</dt>
          <dd>
            Slutter på <span className="font-mono">{view.hint}</span>
          </dd>
          <dt className="text-neutral-600">Testet</dt>
          <dd>{view.testedAt ? `Virket ${when(view.testedAt)}` : "Ikke testet ennå"}</dd>
        </dl>
      )}
      {view?.lastError && (
        <p className="rounded-md bg-red-100 p-3 text-sm text-red-900">
          <strong>Siste test feilet:</strong> {view.lastError}
        </p>
      )}
      {view?.ready && view.environment === "test" && (
        <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          {info.name} står i testmiljøet. Kassen viser at ingen ekte penger trekkes. Lim inn nøklene for produksjon før butikken åpner.
        </p>
      )}

      {canEdit && view && !editing && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => testPaymentConnectionAction(siteId, provider))}
            className="rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Vent litt..." : "Test tilkoblingen"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setState(null);
              setEnvironment(view.environment);
              setEditing(true);
            }}
            className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Bytt nøkler
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const ok = confirm(
                `Fjerne nøklene til ${info.name}? ${info.name} forsvinner fra kassen med en gang. Ordre som er betalt med ${info.name}, kan ikke trekkes eller refunderes herfra før du kobler til igjen.`,
              );
              if (ok) run(() => removePaymentKeysAction(siteId, provider));
            }}
            className="rounded-md border border-red-800 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60"
          >
            Fjern
          </button>
        </div>
      )}

      {showForm && (
        <form
          className="space-y-4 rounded-md border border-neutral-300 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Miljø</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(["test", "production"] as const).map((env) => (
                <label key={env} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={id("miljo")} value={env} checked={environment === env} onChange={() => setEnvironment(env)} />
                  {env === "test" ? info.testLabel : "Produksjon (ekte betalinger)"}
                </label>
              ))}
            </div>
          </fieldset>

          {info.fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-sm font-medium">{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                required
                value={values[f.name] ?? ""}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                autoComplete={f.secret ? "new-password" : "off"}
                spellCheck={false}
                autoCapitalize="none"
                inputMode={f.numeric ? "numeric" : undefined}
                aria-describedby={f.hint ? id(`${f.name}-hint`) : undefined}
                className={`${inputClass} font-mono`}
              />
              {f.hint && (
                <span id={id(`${f.name}-hint`)} className="mt-1 block text-xs text-neutral-600">
                  {f.hint}
                </span>
              )}
            </label>
          ))}

          <p className="text-xs text-neutral-600">
            Nøklene lagres kryptert og vises aldri igjen, heller ikke for deg. Vil du bytte dem senere, limer du inn alle feltene på nytt.
          </p>
          <div className="flex flex-wrap gap-3">
            <button disabled={pending} className="rounded-md bg-[#173b6c] px-5 py-3 font-semibold text-white disabled:opacity-60">
              {pending ? "Lagrer og tester..." : "Lagre og test tilkoblingen"}
            </button>
            {view && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setValues({});
                  setEditing(false);
                }}
                className="rounded-md border border-[#173b6c] px-5 py-3 font-semibold disabled:opacity-60"
              >
                Avbryt
              </button>
            )}
          </div>
        </form>
      )}

      <FormStatus state={state} />

      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Hvor finner jeg nøklene til {info.name}?</summary>
        <div className="mt-2">{info.help}</div>
      </details>
    </section>
  );
}
