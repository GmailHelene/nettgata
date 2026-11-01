"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { GenrePicker } from "@/components/studio/genre-picker";
import { InfoFields, inputClass } from "@/components/studio/info-fields";
import { ThemeGallery, type ThemeChoice } from "@/components/studio/theme-gallery";
import { bransjeLabel, findBransje, lowerLabel, suggestFromBrreg, type BransjeMatch } from "@/lib/genres";
import { packPreview } from "@/lib/pack-preview";
import { getPack } from "@/lib/packs";
import { readSiteInfo, type SiteInfo } from "@/lib/site-info";
import { getThemeDef } from "@/lib/themes";
import { createSiteAction, lookupOrgnrAction } from "../site-actions";

const steps = ["Bedriften", "Bransje", "Design", "Kontakt"] as const;

/**
 * Veiviseren for nytt nettsted. Alle feltene står i samme skjema hele veien (skjulte steg er bare gjemt),
 * så det som er fylt inn blir med når nettstedet lages til slutt.
 */
export function NewSiteForm() {
  const [state, action, pending] = useActionState(createSiteAction, null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [info, setInfo] = useState<SiteInfo>(readSiteInfo({}));
  const [lookup, setLookup] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();
  const [packKey, setPackKey] = useState("");
  const [suggestion, setSuggestion] = useState<BransjeMatch | null>(null);
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  // Bytter kunden bransje før hun har valgt tema selv, følger temaet bransjens anbefaling.
  const [themeTouched, setThemeTouched] = useState(false);

  const pack = getPack(packKey);
  // Ved stegbytte flyttes fokus til overskriften i det nye steget, så tastatur og skjermleser følger med (WCAG 2.4.3).
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headings.current[step]?.focus();
  }, [step]);
  const preview = useMemo(() => (pack ? packPreview(pack, { name, info }) : null), [pack, name, info]);
  const previewPages = useMemo(() => preview?.pages.map((p) => ({ path: p.path, title: p.title, content: p.content })) ?? [], [preview]);

  const choosePack = (key: string) => {
    setPackKey(key);
    const next = getPack(key);
    if (next && !themeTouched) {
      const def = getThemeDef(next.themes[0]);
      if (def) setChoice({ theme: def.key, palette: def.palettes[0].key });
    }
  };

  const fetchCompany = () =>
    startLookup(async () => {
      const company = await lookupOrgnrAction(info.orgnr);
      if (!company) {
        setLookup("Fant ikke org.nr. i Enhetsregisteret. Sjekk nummeret eller fyll inn selv.");
        return;
      }
      setName(company.name);
      setInfo({ ...info, orgnr: company.orgnr, street: company.street, postalCode: company.postalCode, city: company.city });
      // Enkeltpersonforetak er ofte registrert på hjemmeadressen. Den blir synlig på nettstedet, så det må stå her.
      setLookup(
        `Hentet fra Brønnøysund: ${company.name}${company.industry ? `, ${lowerLabel(company.industry)}` : ""}. ` +
          "Adressen blir synlig på nettstedet. Er det hjemmeadressen din, kan du fjerne gateadressen i siste steg.",
      );
      const suggested = suggestFromBrreg(company.industryCode, company.industry);
      setSuggestion(suggested);
      if (suggested && !packKey) choosePack(suggested.bransje.pack);
    });

  const canContinue = [name.trim().length >= 2, Boolean(pack), Boolean(choice), true][step];
  const chosen = packKey ? findBransje(packKey) : null;
  const themeDef = choice ? getThemeDef(choice.theme) : null;

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="pack" value={packKey} />
      <input type="hidden" name="theme" value={choice?.theme ?? ""} />
      <input type="hidden" name="palette" value={choice?.palette ?? ""} />

      <nav aria-label="Steg">
        <ol className="flex flex-wrap gap-2 text-sm">
          {steps.map((label, i) => {
            const reachable = i <= step || (i === step + 1 && canContinue);
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!reachable || i === step}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => setStep(i)}
                  className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 font-medium aria-[current=step]:border-neutral-900 aria-[current=step]:bg-neutral-900 aria-[current=step]:text-white disabled:opacity-100 disabled:[&:not([aria-current])]:text-neutral-400"
                >
                  <span aria-hidden="true">{i < step ? "✓" : i + 1}</span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section hidden={step !== 0} className="max-w-3xl space-y-3 rounded-lg border bg-white p-5">
        <h2 ref={(el) => void (headings.current[0] = el)} tabIndex={-1} className="text-lg font-semibold outline-none">Bedriften</h2>
        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium">Org.nr.</span>
            <input name="orgnr" value={info.orgnr} onChange={(e) => setInfo({ ...info, orgnr: e.target.value })} inputMode="numeric" className={inputClass} />
          </label>
          <button
            type="button"
            onClick={fetchCompany}
            disabled={looking || info.orgnr.replace(/\s/g, "").length !== 9}
            className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {looking ? "Henter..." : "Hent fra Brreg"}
          </button>
        </div>
        {lookup && <p className="text-sm text-neutral-700">{lookup}</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Navn på nettstedet</span>
          <input name="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Ønsket adresse (valgfritt)</span>
          <input name="slug" placeholder="lages fra navnet" className={inputClass} />
          <span className="mt-1 block text-xs text-neutral-600">Blir til navn.nettgata.no. Eget domene kobles senere.</span>
        </label>
      </section>

      <section hidden={step !== 1} className="space-y-4">
        <div>
          <h2 ref={(el) => void (headings.current[1] = el)} tabIndex={-1} className="text-lg font-semibold outline-none">Hva driver dere med?</h2>
          <p className="text-sm text-neutral-600">Bransjen bestemmer sidene og tekstutkastene. Utseendet velger du i neste steg, og alt kan endres senere.</p>
        </div>
        <GenrePicker value={packKey} onChange={choosePack} suggestion={suggestion} />
      </section>

      <section hidden={step !== 2} className="space-y-4">
        <div>
          <h2 ref={(el) => void (headings.current[2] = el)} tabIndex={-1} className="text-lg font-semibold outline-none">Velg design</h2>
          <p className="text-sm text-neutral-600">
            Hvert tema har egne fonter, knapper, menyer og fargevarianter. Miniatyrene viser {name.trim() || "nettstedet ditt"} med innholdet for{" "}
            {chosen ? lowerLabel(bransjeLabel(chosen.bransje)) : "bransjen"}. Trykk «Forhåndsvis» for å se hele siden, også på mobil.
          </p>
        </div>
        {/* Galleriet tegnes først når steget vises, så 12 miniatyrer ikke lages før de trengs. */}
        {step === 2 && pack && preview && (
          <ThemeGallery
            recommended={pack.themes}
            value={choice}
            pages={previewPages}
            ctx={preview.ctx}
            onChoose={(c) => {
              setChoice(c);
              setThemeTouched(true);
            }}
          />
        )}
      </section>

      <section hidden={step !== 3} className="max-w-3xl space-y-3 rounded-lg border bg-white p-5">
        <h2 ref={(el) => void (headings.current[3] = el)} tabIndex={-1} className="text-lg font-semibold outline-none">Kontaktinfo</h2>
        <p className="text-sm text-neutral-600">Dette vises i menyen, bunnteksten, kontaktsiden og i Google.</p>
        <InfoFields value={info} onChange={setInfo} hideOrgnr />
      </section>

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-neutral-200 bg-neutral-50/95 px-5 py-4 backdrop-blur">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="rounded-md border border-neutral-900 px-5 py-3 font-semibold">
            Tilbake
          </button>
        )}
        {/* Egne nøkler gir to ulike knapper. Ellers gjenbruker React samme knapp, typen blir «submit»
            midt i klikket på «Neste», og nettleseren sender skjemaet før kunden har sett siste steg. */}
        {step < steps.length - 1 ? (
          <button
            key="neste"
            type="button"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
            className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            Neste
          </button>
        ) : (
          <button key="send" type="submit" disabled={pending || !pack || !choice} className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-60">
            {pending ? "Lager nettstedet..." : "Lag nettstedet som kladd"}
          </button>
        )}
        {!canContinue && step < steps.length - 1 && (
          <p className="text-sm text-neutral-700">{["Skriv navnet på nettstedet for å gå videre.", "Velg en bransje for å gå videre.", "Velg et tema for å gå videre."][step]}</p>
        )}
        <p className="text-sm text-neutral-700">
          {[name.trim(), chosen && bransjeLabel(chosen.bransje), themeDef && `${themeDef.label}, ${themeDef.palettes.find((p) => p.key === choice?.palette)?.label ?? ""}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="w-full empty:hidden">
          <FormStatus state={state} />
        </div>
      </div>
    </form>
  );
}
