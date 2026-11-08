"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import type { FikenOverview, FikenPeriod, FikenPeriodKey } from "@/lib/fiken/send";
import { fikenMethods, type FikenAccount, type FikenMethod, type FikenSettings, type FikenView } from "@/lib/fiken/state";
import type { ActionState } from "../../../actions";
import {
  chooseFikenCompanyAction,
  disconnectFikenAction,
  saveFikenSettingsAction,
  sendOrdersToFikenAction,
  startFikenConnectAction,
  testFikenAction,
} from "./fiken-actions";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173b6c]";
const primaryButton = `rounded-md bg-[#173b6c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${focus}`;
const secondaryButton = `rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60 ${focus}`;
const dangerButton = `rounded-md border border-red-800 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-60 ${focus}`;

/** Tekstene per betalingsmåte. hint står under de som ofte allerede er ført i regnskapet på en annen måte. */
const methodText: Record<FikenMethod, { checkbox: string; account: string; short: string; hint?: string }> = {
  vipps: { checkbox: "Ordre betalt med Vipps", account: "Konto i Fiken for Vipps", short: "Vipps" },
  klarna: { checkbox: "Ordre betalt med Klarna", account: "Konto i Fiken for Klarna", short: "Klarna" },
  faktura: {
    checkbox: "Ordre betalt med faktura",
    account: "Konto i Fiken for faktura",
    short: "faktura",
    hint: "Lager du fakturaen i Fiken, er salget allerede ført der. Send dem bare hvis du lager fakturaen et annet sted, ellers blir salget ført to ganger.",
  },
  "ved-henting": {
    checkbox: "Ordre betalt ved henting",
    account: "Konto i Fiken for betaling ved henting",
    short: "betaling ved henting",
    hint: "Tar du betalt i et kassesystem når kunden henter, er salget ført der. Send dem bare hvis salget ikke føres noe annet sted.",
  },
};

/** «Vipps, Klarna og faktura» */
const listText = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} og ${items[items.length - 1]}`);

function when(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function Status({ view }: { view: FikenView | null }) {
  if (!view) return <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-800">Ikke koblet til</span>;
  if (view.needsReconnect) return <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-900">Må kobles til på nytt</span>;
  if (!view.companySlug) return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">Velg selskap</span>;
  if (view.lastError) return <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-900">Må sjekkes</span>;
  return <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-900">Koblet til{view.testCompany ? " (testselskap)" : ""}</span>;
}

/**
 * Fiken på Betaling-siden. Eieren kobler til med «Koble til Fiken» og logger inn hos Fiken (OAuth2). Nøklene blir på
 * serveren: studioet ser bare selskapet, kontoene og når koblingen sist virket.
 */
export function FikenSection({
  siteId,
  view,
  canEdit,
  configured,
  notice,
  periods,
  overview,
}: {
  siteId: string;
  view: FikenView | null;
  canEdit: boolean;
  /** Fiken-appen er registrert (FIKEN_CLIENT_ID og FIKEN_CLIENT_SECRET satt). Uten den kan ingen koble til. */
  configured: boolean;
  /** Resultatet etter at Fiken sendte eieren tilbake hit. */
  notice: ActionState;
  periods: FikenPeriod[];
  overview: FikenOverview | null;
}) {
  const [state, setState] = useState<ActionState>(notice);
  const [pending, startTransition] = useTransition();
  const ready = view !== null && !view.needsReconnect && view.companySlug !== null;
  const choosing = canEdit && view !== null && !view.needsReconnect && view.companySlug === null;
  const showTools = canEdit && ready;

  const run = (action: () => Promise<ActionState>) =>
    startTransition(async () => {
      setState(await action());
    });

  return (
    <section aria-labelledby="fiken-tittel" className="space-y-4 rounded-lg border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="fiken-tittel" className="text-lg font-semibold">
          Regnskap: Fiken
        </h2>
        <Status view={view} />
      </div>
      <p className="text-sm text-neutral-700">
        Send betalte ordre fra nettbutikken til regnskapet ditt i Fiken. Hver ordre blir et salg der, med én linje per MVA-sats. Frakten fordeles på
        satsene akkurat som i kassen og i MVA-rapporten.
      </p>
      <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
        API-modulen i Fiken koster 99 kr i måneden pluss mva per selskap. Den betaler du til Fiken, ikke til Nettgata, og du bestiller den i Fiken for
        selskapet ordrene skal til.
      </p>
      {!configured && (
        <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">
          Bare plattformadmin ser dette. Fiken-appen er ikke registrert ennå, så ingen kan koble til. Legg inn FIKEN_CLIENT_ID og FIKEN_CLIENT_SECRET
          først (se docs/FIKEN.md).
        </p>
      )}

      {ready && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Selskap</dt>
          <dd>
            {view.companyName}
            {view.organizationNumber ? ` (org.nr. ${view.organizationNumber})` : ""}
          </dd>
          <dt className="text-neutral-600">MVA</dt>
          <dd>{view.vatRegistered ? "Registrert for MVA" : "Ikke MVA-registrert. Salget føres uten MVA."}</dd>
          <dt className="text-neutral-600">Koblet til</dt>
          <dd>{when(view.savedAt)}</dd>
          <dt className="text-neutral-600">Testet</dt>
          <dd>{view.testedAt ? `Virket ${when(view.testedAt)}` : "Ikke testet etter siste feil"}</dd>
        </dl>
      )}
      {view?.lastError && (
        <p role={view.needsReconnect ? "alert" : undefined} className="rounded-md bg-red-100 p-3 text-sm text-red-900">
          <strong>{view.needsReconnect ? "Fiken er koblet fra:" : "Siste kontakt med Fiken feilet:"}</strong> {view.lastError}
        </p>
      )}
      {!canEdit && <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-800">Bare eieren av butikken kan koble til Fiken og sende ordre dit.</p>}

      {canEdit && (!view || view.needsReconnect) && <ConnectButton siteId={siteId} disabled={!configured} again={view !== null} onResult={setState} />}
      {choosing && <CompanyChoice siteId={siteId} view={view} onResult={setState} />}

      {showTools && (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => run(() => testFikenAction(siteId))} className={primaryButton}>
            {pending ? "Vent litt..." : "Test tilkoblingen"}
          </button>
          <ConnectButton siteId={siteId} disabled={!configured || pending} again secondary onResult={setState} />
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const ok = confirm("Koble Fiken fra Nettgata? Nettgata mister tilgangen til regnskapet ditt. Ordre som allerede er sendt, blir liggende i Fiken.");
              if (ok) run(() => disconnectFikenAction(siteId));
            }}
            className={dangerButton}
          >
            Koble fra
          </button>
        </div>
      )}
      {canEdit && view && !showTools && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("Fjerne Fiken-koblingen fra Nettgata?")) run(() => disconnectFikenAction(siteId));
          }}
          className={dangerButton}
        >
          Koble fra
        </button>
      )}
      <FormStatus state={state} />

      {showTools && <SettingsForm siteId={siteId} view={view} />}
      {showTools && <SendForm siteId={siteId} periods={periods} view={view} />}

      {view && overview?.lastBatch && (
        <p className="text-sm text-neutral-700">
          Sist sendt {when(overview.lastBatch.at)}. {overview.lastBatch.sent} ordre gikk til Fiken
          {overview.lastBatch.failed > 0 ? `, og ${overview.lastBatch.failed} feilet` : ""}.
        </p>
      )}
      {overview && overview.needsCredit.length > 0 && (
        <div className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <p className="font-semibold">Før kreditnota for disse i Fiken</p>
          <p className="mt-1">
            Ordrene er sendt til Fiken, men kansellert eller refundert etterpå. Kreditnotaen fra Nettgata sendes ikke til Fiken, så du fører den selv
            der, med samme beløp og MVA som kreditnotaen i Nettgata.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {overview.needsCredit.map((o) => (
              <li key={o.number}>
                Ordre {o.number}, {o.status === "refunded" ? "refundert" : "kansellert"}
                {o.saleId ? ` (salg ${o.saleId} i Fiken)` : ""}
                {o.creditNoteNumber ? `, kreditnota ${o.creditNoteNumber} i Nettgata` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-md border p-3 text-sm">
        <summary className={`cursor-pointer font-medium ${focus}`}>Slik kobler du til</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Bestill API-modulen i Fiken for selskapet, under modultilgang i innstillingene. Den koster 99 kr i måneden pluss mva per selskap.</li>
          <li>Trykk «Koble til Fiken». Du sendes til Fiken, logger inn der og godtar at Nettgata får tilgang.</li>
          <li>Har du flere selskaper i Fiken, velger du hvilket ordrene skal til når du kommer tilbake hit.</li>
        </ol>
        <p className="mt-2">
          Du gir aldri passordet ditt til Nettgata. Tilgangen kan du trekke tilbake her med «Koble fra», eller i Fiken under Rediger konto, Sikkerhet.
        </p>
        <p className="mt-2">
          Har du en egen bankkonto i Fiken for Vipps eller Klarna, velger du den. Da kan du avstemme utbetalingene fra dem mot salget i Fiken.
        </p>
      </details>
      <details className="rounded-md border p-3 text-sm">
        <summary className={`cursor-pointer font-medium ${focus}`}>Hva koblingen gjør, og hva den ikke gjør</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Ordrene sendes bare når du trykker på knappen. Ingenting sendes av seg selv.</li>
          <li>Hver ordre blir ett betalt salg i Fiken, med ordrenummeret som salgsnummer. Navnet og adressen til kunden sendes ikke.</li>
          <li>Samme ordre sendes aldri to ganger, heller ikke om du kobler fra og til igjen.</li>
          <li>Gebyrene fra Vipps og Klarna, og utbetalingene til banken, fører du selv i Fiken.</li>
          <li>Kreditnotaer sendes ikke. Kansellerer eller refunderer du en ordre som er sendt, fører du kreditnotaen i Fiken. Ordrene det gjelder, vises her.</li>
          <li>Ordre betalt i testmiljøet hos Vipps eller Klarna sendes bare til et testselskap i Fiken.</li>
        </ul>
      </details>
    </section>
  );
}

/** Sender eieren til Fiken. Adressen lages på serveren, med en state som bare virker for denne eieren og denne butikken. */
function ConnectButton({
  siteId,
  disabled,
  again,
  secondary,
  onResult,
}: {
  siteId: string;
  disabled: boolean;
  again: boolean;
  secondary?: boolean;
  onResult: (state: ActionState) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startFikenConnectAction(siteId);
          if (result.ok && result.url) {
            window.location.assign(result.url);
            return;
          }
          onResult({ ok: false, message: result.message });
        })
      }
      className={secondary ? secondaryButton : primaryButton}
    >
      {pending ? "Sender deg til Fiken..." : again ? "Koble til Fiken på nytt" : "Koble til Fiken"}
    </button>
  );
}

function CompanyChoice({ siteId, view, onResult }: { siteId: string; view: FikenView; onResult: (state: ActionState) => void }) {
  const companies = view.companyChoices;
  const [chosen, setChosen] = useState((companies.find((c) => c.hasApiAccess) ?? companies[0])?.slug ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 rounded-md border border-neutral-300 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          onResult(await chooseFikenCompanyAction(siteId, chosen));
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Hvilket selskap skal ordrene til?</legend>
        <div className="space-y-2">
          {companies.map((c) => (
            <label key={c.slug} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="fiken-selskap"
                value={c.slug}
                checked={chosen === c.slug}
                onChange={() => setChosen(c.slug)}
                className={`mt-1 ${focus}`}
              />
              <span>
                {c.name}
                {c.organizationNumber ? ` (org.nr. ${c.organizationNumber})` : ""}
                {c.testCompany ? ", testselskap" : ""}
                {!c.hasApiAccess && <span className="block text-xs text-red-800">Fiken sier at API-modulen ikke er aktivert for dette selskapet.</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button disabled={pending || !chosen} className={primaryButton}>
        {pending ? "Kobler til..." : "Bruk valgt selskap"}
      </button>
    </form>
  );
}

function AccountSelect({
  id,
  label,
  value,
  accounts,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  accounts: FikenAccount[];
  onChange: (code: string) => void;
}) {
  const known = accounts.some((a) => a.code === value);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${focus}`}>
        {!known && <option value={value}>{value} (finnes ikke i Fiken nå)</option>}
        {accounts.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name} ({a.code})
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingsForm({ siteId, view }: { siteId: string; view: FikenView }) {
  const [settings, setSettings] = useState<FikenSettings>(view.settings);
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const firstBank = view.bankAccounts[0]?.code;

  const toggle = (method: FikenMethod, on: boolean) =>
    setSettings((s) => {
      const paymentAccounts = { ...s.paymentAccounts };
      if (on && firstBank) paymentAccounts[method] = paymentAccounts[method] ?? firstBank;
      else delete paymentAccounts[method];
      return { ...s, paymentAccounts };
    });

  return (
    <form
      aria-labelledby="fiken-valg-tittel"
      className="space-y-4 rounded-md border border-neutral-300 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setState(await saveFikenSettingsAction(siteId, settings));
        });
      }}
    >
      <h3 id="fiken-valg-tittel" className="font-semibold">
        Hvilke ordre som sendes
      </h3>
      <p className="text-sm text-neutral-700">Velg betalingsmåtene som skal sendes, og kontoen i Fiken pengene kommer inn på.</p>
      {view.bankAccounts.length === 0 && (
        <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900">
          Fant ingen bankkontoer i Fiken. Lag en bankkonto i Fiken, og trykk Test tilkoblingen for å hente den hit.
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="sr-only">Betalingsmåter som sendes til Fiken</legend>
        {fikenMethods.map((m) => {
          const on = settings.paymentAccounts[m] !== undefined;
          const text = methodText[m];
          return (
            <div key={m} className="space-y-2">
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!firstBank && !on}
                  onChange={(e) => toggle(m, e.target.checked)}
                  aria-describedby={text.hint ? `fiken-hint-${m}` : undefined}
                  className={`mt-1 ${focus}`}
                />
                {text.checkbox}
              </label>
              {text.hint && (
                <p id={`fiken-hint-${m}`} className="pl-6 text-xs text-neutral-600">
                  {text.hint}
                </p>
              )}
              {on && (
                <div className="pl-6">
                  <AccountSelect
                    id={`fiken-konto-${m}`}
                    label={text.account}
                    value={settings.paymentAccounts[m]!}
                    accounts={view.bankAccounts}
                    onChange={(code) => setSettings((s) => ({ ...s, paymentAccounts: { ...s.paymentAccounts, [m]: code } }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      <details className="rounded-md border p-3 text-sm">
        <summary className={`cursor-pointer font-medium ${focus}`}>Inntektskontoer</summary>
        <div className="mt-3 space-y-3">
          <p className="text-neutral-700">De fleste trenger ikke endre dette. Er du usikker, spør regnskapsføreren din.</p>
          <AccountSelect
            id="fiken-inntekt"
            label="Salg med MVA (25, 15 og 12 %)"
            value={settings.incomeAccount}
            accounts={view.incomeAccounts}
            onChange={(code) => setSettings((s) => ({ ...s, incomeAccount: code }))}
          />
          <AccountSelect
            id="fiken-inntekt-null"
            label="Varer med 0 % MVA"
            value={settings.zeroVatIncomeAccount}
            accounts={view.incomeAccounts}
            onChange={(code) => setSettings((s) => ({ ...s, zeroVatIncomeAccount: code }))}
          />
        </div>
      </details>

      <button disabled={pending} className={primaryButton}>
        {pending ? "Lagrer..." : "Lagre valgene"}
      </button>
      <FormStatus state={state} />
    </form>
  );
}

function SendForm({ siteId, periods, view }: { siteId: string; periods: FikenPeriod[]; view: FikenView }) {
  const [period, setPeriod] = useState<FikenPeriodKey>(periods[0]?.key ?? "maned");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const enabled = fikenMethods.filter((m) => view.settings.paymentAccounts[m]).map((m) => methodText[m].short);

  return (
    <form
      aria-labelledby="fiken-send-tittel"
      className="space-y-4 rounded-md border border-neutral-300 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setState(await sendOrdersToFikenAction(siteId, period));
        });
      }}
    >
      <h3 id="fiken-send-tittel" className="font-semibold">
        Send ordre til Fiken
      </h3>
      <p className="text-sm text-neutral-700">
        Ordre som er betalt eller sendt, og som ikke har vært sendt til Fiken før, blir med. Kansellerte og refunderte ordre sendes ikke.{" "}
        {enabled.length > 0
          ? `Betalingsmåtene som sendes nå, er ${listText(enabled)}.`
          : "Du har ikke valgt noen betalingsmåter ennå. Velg dem over, og lagre valgene."}
      </p>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Periode</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {periods.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="fiken-periode" value={p.key} checked={period === p.key} onChange={() => setPeriod(p.key)} className={focus} />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button disabled={pending || enabled.length === 0} className={primaryButton}>
        {pending ? "Sender til Fiken..." : "Send betalte ordre til Fiken"}
      </button>
      <FormStatus state={state} />
    </form>
  );
}
