"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import type { BringSetupView } from "@/lib/bring/config";
import type { BringEnvironment } from "@/lib/bring/state";
import type { ActionState } from "../../../../actions";
import { removeBringKeysAction, saveBringKeysAction, testBringConnectionAction } from "./actions";

type Account = NonNullable<BringSetupView["account"]>;

const fields = [
  {
    name: "uid",
    label: "Mybring-bruker (e-post)",
    type: "email",
    hint: "E-postadressen du logger inn i Mybring med.",
  },
  {
    name: "apiKey",
    label: "API-nøkkel",
    type: "password",
    hint: "Lages under API i Mybring. Nøkkelen hører til brukeren over.",
  },
  {
    name: "customerNumber",
    label: "Kundenummer hos Bring",
    type: "text",
    hint: "Kundenummeret butikken har hos Bring. Det gir dine egne priser og står på sendingene.",
  },
] as const;

function when(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function Status({ view }: { view: Account | null }) {
  if (!view) return <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-800">Ikke koblet til</span>;
  if (view.ready) {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-900">Koblet til{view.environment === "test" ? " (testmodus)" : ""}</span>;
  }
  return <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-900">Ikke i bruk før testen lykkes</span>;
}

/**
 * Kobler butikkens egen Mybring-konto til kassen. Nøklene skrives inn her og sendes til serveren, men kommer aldri
 * tilbake: studioet ser bare om Bring er koblet til, miljø, kundenummer og brukeren med det meste skjult.
 */
export function BringAccountForm({ siteId, view, canEdit }: { siteId: string; view: Account | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [environment, setEnvironment] = useState<BringEnvironment>(view?.environment ?? "test");
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const showForm = canEdit && (editing || view === null);

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      setState(await action());
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveBringKeysAction(siteId, { ...values, environment });
      setState(result);
      // Er nøklene lagret (også når testen feilet), ligger de ikke igjen i skjemaet.
      if (result.saved) {
        setValues({});
        setEditing(false);
      }
    });

  return (
    <section aria-labelledby="bring-konto-tittel" className="space-y-4 rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="bring-konto-tittel" className="text-lg font-semibold">
          Koble til Bring
        </h3>
        <Status view={view} />
      </div>
      <p className="text-sm text-neutral-700">
        Du bruker din egen Mybring-konto og ditt eget kundenummer. Vi tester nøklene ved å spørre Bring om en pris, uten å bestille noe.
      </p>

      {view && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Miljø</dt>
          <dd>{view.environment === "test" ? "Testmodus" : "Produksjon"}</dd>
          <dt className="text-neutral-600">Mybring-bruker</dt>
          <dd className="font-mono">{view.hint}</dd>
          <dt className="text-neutral-600">Kundenummer</dt>
          <dd className="font-mono">{view.customerNumber}</dd>
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
          Bring står i testmodus. Prisene i kassen er ekte, men etiketter du lager, er testbestillinger: Bring henter ikke pakken og sender ingen faktura.
          Bytt til produksjon før butikken åpner.
        </p>
      )}

      {canEdit && view && !editing && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => testBringConnectionAction(siteId))}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
            className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Bytt nøkler
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Fjerne nøklene til Bring? Bring forsvinner fra kassen med en gang, og du kan ikke lage nye etiketter herfra før du kobler til igjen.")) {
                run(() => removeBringKeysAction(siteId));
              }
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
                  <input type="radio" name="bring-miljo" value={env} checked={environment === env} onChange={() => setEnvironment(env)} />
                  {env === "test" ? "Testmodus (Bring henter ikke pakkene og fakturerer ikke)" : "Produksjon (ekte sendinger)"}
                </label>
              ))}
            </div>
          </fieldset>

          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-sm font-medium">{f.label}</span>
              <input
                type={f.type}
                required
                value={values[f.name] ?? ""}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                autoComplete={f.type === "password" ? "new-password" : "off"}
                spellCheck={false}
                autoCapitalize="none"
                aria-describedby={`bring-${f.name}-hjelp`}
                className={`${inputClass} font-mono`}
              />
              <span id={`bring-${f.name}-hjelp`} className="mt-1 block text-xs text-neutral-600">
                {f.hint}
              </span>
            </label>
          ))}

          <p className="text-xs text-neutral-600">
            API-nøkkelen lagres kryptert og vises aldri igjen, heller ikke for deg. Vil du bytte den senere, fyller du inn alle feltene på nytt.
          </p>
          <div className="flex flex-wrap gap-3">
            <button disabled={pending} className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-60">
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
                className="rounded-md border border-neutral-900 px-5 py-3 font-semibold disabled:opacity-60"
              >
                Avbryt
              </button>
            )}
          </div>
        </form>
      )}

      <FormStatus state={state} />

      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Hvor finner jeg dette i Mybring?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Butikken må være kunde hos Bring og ha et kundenummer. Har dere ikke det, tar du kontakt med Bring kundeservice.</li>
          <li>Logg inn på mybring.com med brukeren som skal brukes. Brukeren må ha tilgang til kundenummeret, også til priser (økonomitilgang).</li>
          <li>Åpne innstillingene for API under kontoen din, og lag en API-nøkkel. Kopier den hit med en gang.</li>
          <li>Velg testmodus først. Da kan du lage etiketter uten at Bring henter pakken eller sender faktura. Bytt til produksjon når alt virker.</li>
        </ol>
        <p className="mt-2">Bytter du API-nøkkel eller sletter brukeren i Mybring, slutter koblingen å virke til du legger inn den nye nøkkelen her.</p>
      </details>
    </section>
  );
}
