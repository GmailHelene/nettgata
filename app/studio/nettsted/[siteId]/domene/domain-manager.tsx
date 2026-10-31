"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { DomainView } from "@/lib/domains";
import type { ActionState } from "../../../actions";
import { addDomainAction, checkDomainsAction, dropApexAction, removeDomainAction, setPrimaryDomainAction } from "../../../domain-actions";

/** Sjekk automatisk mens siden er åpen og noe venter, opptil 10 minutter. */
const POLL_MS = 20_000;
const POLL_ROUNDS = 30;

const statusChip = {
  active: { text: "Aktiv", className: "bg-green-100 text-green-900" },
  pending: { text: "Venter på DNS", className: "bg-amber-100 text-amber-900" },
  problem: { text: "Peker ikke hit lenger", className: "bg-red-100 text-red-900" },
} as const;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border border-neutral-400 px-2 py-0.5 text-xs"
    >
      <span aria-live="polite">{copied ? "Kopiert" : "Kopier"}</span>
    </button>
  );
}

function checkedTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
}

function Records({ view }: { view: DomainView }) {
  const www = view.hosts.find((h) => h.kind === "www");
  const apex = view.hosts.find((h) => h.kind === "apex");
  const sub = view.hosts.find((h) => h.kind === "sub");
  const rows = [
    ...(www ? [{ what: www.label, type: "CNAME", name: "www", value: view.target }] : []),
    ...(apex ? [{ what: `${apex.label} (uten www)`, type: "ANAME eller ALIAS", name: "tomt eller @", value: view.target }] : []),
    ...(sub ? [{ what: sub.label, type: "CNAME", name: sub.label, value: view.target }] : []),
  ];
  return (
    <div>
      {/* Ett kort per peker i stedet for en tabell, så den lange adressen kan leses og kopieres på telefon. */}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.what} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{r.what}</p>
            <dl className="mt-2 grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-neutral-600">Type</dt>
              <dd>{r.type}</dd>
              <dt className="text-neutral-600">Navn</dt>
              <dd className="font-mono">{r.name}</dd>
              <dt className="text-neutral-600">Verdi</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="break-all font-mono">{r.value}</span>
                <CopyButton value={r.value} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      {apex && (
        <p className="mt-2 text-sm text-neutral-600">
          Har ikke forhandleren ANAME eller ALIAS, sett opp videresending fra {apex.label} til https://www.{apex.label} i stedet, og trykk «Jeg bruker
          videresending».
        </p>
      )}
    </div>
  );
}

function Guides({ target }: { target: string }) {
  return (
    <div className="space-y-2 text-sm">
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer font-medium">Slik gjør du det hos Domeneshop</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Logg inn på domeneshop.no og gå til «Mine domener».</li>
          <li>Velg domenet og åpne «DNS-pekere».</li>
          <li>Slett gamle pekere for www og for domenet uten www, hvis de finnes.</li>
          <li>
            Legg til en peker med vertsnavn <span className="font-mono">www</span>, type CNAME og data <span className="font-mono break-all">{target}</span>.
          </li>
          <li>Legg til en peker der vertsnavnet står tomt, med samme adresse. Domeneshop lager da en ANAME for deg.</li>
        </ol>
      </details>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer font-medium">Slik gjør du det hos Webhuset</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Gå til Kundesenteret, velg «Domene» og domenet ditt.</li>
          <li>Åpne «DNS» og så «DNS-oppføringer».</li>
          <li>
            Klikk «Ny oppføring», velg CNAME, skriv <span className="font-mono">www</span> som navn og <span className="font-mono break-all">{target}</span> som
            verdi.
          </li>
          <li>Finner du ikke ANAME eller ALIAS for domenet uten www, sett opp videresending til www i stedet.</li>
        </ol>
      </details>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer font-medium">Andre forhandlere</summary>
        <p className="mt-2">
          Se etter «DNS», «DNS-innstillinger» eller «Navnetjener» i kontrollpanelet. Legg inn pekerne i tabellen over. Står du fast, send skjermbilde av
          DNS-siden til oss, så hjelper vi deg.
        </p>
      </details>
    </div>
  );
}

export function DomainManager({ siteId, views, canAdd, simulated }: { siteId: string; views: DomainView[]; canAdd: boolean; simulated: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const waiting = views.some((v) => v.status !== "active" || v.hosts.some((h) => !h.active));

  useEffect(() => {
    if (!waiting) return;
    let rounds = 0;
    const timer = setInterval(() => {
      if (document.hidden || rounds >= POLL_ROUNDS) return;
      rounds++;
      checkDomainsAction(siteId).then(() => router.refresh());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, siteId, router]);

  const run = (action: () => Promise<ActionState>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      setState(result);
      if (result?.ok) after?.();
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {simulated && (
        <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-950">
          Testmodus på denne maskinen: Cloudflare og DNS er simulert. Hver sjekk tar domenet ett steg videre. Domener som begynner med «ledig» oppfører seg
          som om de ikke er kjøpt.
        </p>
      )}

      {canAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addDomainAction(siteId, input), () => setInput(""));
          }}
          className="rounded-lg border bg-white p-5"
        >
          <label htmlFor="domene" className="mb-1 block font-semibold">
            Koble til et domene du eier
          </label>
          <p className="mb-3 text-sm text-neutral-600">
            Har du ikke domene ennå? Kjøp det hos en norsk forhandler, for eksempel{" "}
            <a href="https://www.domeneshop.no" target="_blank" rel="noreferrer" className="underline">
              Domeneshop
            </a>
            . Domenet skal stå i ditt eller bedriftens navn, så det alltid er ditt.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              id="domene"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="firmanavn.no"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-neutral-400 px-3 py-2"
            />
            <button disabled={pending || !input.trim()} className="rounded-md bg-neutral-900 px-5 py-2 font-semibold text-white disabled:opacity-60">
              {pending ? "Kobler til..." : "Koble til"}
            </button>
          </div>
        </form>
      )}

      {state && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-md p-3 text-sm ${state.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
          {state.message}
        </p>
      )}

      {views.map((view) => {
        const chip = statusChip[view.status];
        const primary = view.hosts.find((h) => h.primary && h.active);
        const lastCheck = checkedTime(view.hosts.map((h) => h.checkedAt).filter(Boolean).sort().at(-1) ?? null);
        return (
          <section key={view.root} className="rounded-lg border bg-white p-5" aria-labelledby={`domene-${view.root}`}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 id={`domene-${view.root}`} className="mr-auto text-lg font-semibold">
                {view.rootLabel}
              </h3>
              <span className={`rounded-full px-3 py-1 text-sm ${chip.className}`}>{chip.text}</span>
            </div>

            {primary && (
              <p className="mb-3 text-green-900">
                Nettstedet ditt er live på{" "}
                <a href={`https://${primary.hostname}`} target="_blank" rel="noreferrer" className="font-semibold underline">
                  {primary.label}
                </a>
                . Andre adresser sender besøkende videre hit.
              </p>
            )}

            <ul className="mb-4 space-y-2 text-sm">
              {view.hosts.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span aria-hidden="true">{h.active && !h.failing ? "✓" : "○"}</span>
                  <span className="font-medium">{h.label}</span>
                  <span className="text-neutral-700">
                    {h.active ? (h.primary ? "Hovedadresse" : h.kind === "apex" ? "Sender videre til hovedadressen" : "Aktiv") : (h.message ?? "Venter på første sjekk")}
                    {h.active && h.message && <span className="block text-red-800">{h.message}</span>}
                  </span>
                  {h.active && !h.primary && h.kind !== "apex" && (
                    <button type="button" disabled={pending} onClick={() => run(() => setPrimaryDomainAction(siteId, h.id))} className="underline">
                      Gjør til hovedadresse
                    </button>
                  )}
                  {!h.active && h.kind === "apex" && (
                    <button type="button" disabled={pending} onClick={() => run(() => dropApexAction(siteId, h.id))} className="underline">
                      Jeg bruker videresending
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {view.status === "active" && view.hosts.every((h) => h.active) ? (
              <details className="mb-4 text-sm">
                <summary className="cursor-pointer text-neutral-600 underline">Vis DNS-pekerne</summary>
                <div className="mt-2">
                  <Records view={view} />
                </div>
              </details>
            ) : (
              <div className="mb-4 space-y-4">
                <div>
                  <h4 className="mb-1 font-semibold">Legg inn dette hos domeneforhandleren din</h4>
                  <p className="mb-2 text-sm text-neutral-600">
                    Pekeren er laget bare for ditt nettsted. Det tar vanligvis fra noen minutter til noen timer før endringen synes. Vi sjekker automatisk og
                    kobler til så snart den er på plass.
                  </p>
                  <Records view={view} />
                </div>
                <Guides target={view.target} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => checkDomainsAction(siteId))}
                className="rounded-md border border-neutral-900 px-4 py-2 font-semibold disabled:opacity-60"
              >
                Sjekk nå
              </button>
              {lastCheck && <span className="text-neutral-600">Sist sjekket kl. {lastCheck}</span>}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Fjerne ${view.rootLabel} fra nettstedet? Siden blir liggende på gratisadressen.`)) return;
                  run(() => removeDomainAction(siteId, view.hosts[0].id));
                }}
                className="ml-auto underline"
              >
                Fjern domenet
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
