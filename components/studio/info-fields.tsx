"use client";

import type { SiteInfo } from "@/lib/site-info";

/** Feltene i hele studioet. Kanten (#7d8a96) synes godt mot hvitt, og fokus får gateblå ring fra studiorammen. */
export const inputClass =
  "w-full min-h-11 rounded-lg border border-[#7d8a96] bg-white px-3.5 py-2.5 text-[#1b232b] transition-colors placeholder:text-[#6b7783] hover:border-[#47525c] focus:border-[#173b6c]";

function Text({ name, label, value, onChange, ...rest }: { name: string; label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "name">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...rest} />
    </label>
  );
}

/**
 * Kontaktinfo og åpningstider. Kontrollert, slik at Brreg-oppslaget kan fylle feltene.
 * Feltnavnene matcher infoFromForm() i site-actions.
 */
export function InfoFields({ value, onChange, hideOrgnr = false }: { value: SiteInfo; onChange: (v: SiteInfo) => void; hideOrgnr?: boolean }) {
  const set = (key: keyof SiteInfo) => (v: string) => onChange({ ...value, [key]: v });
  const hours = value.openingHours;
  const setHours = (next: SiteInfo["openingHours"]) => onChange({ ...value, openingHours: next });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="phone" label="Telefon" type="tel" value={value.phone} onChange={set("phone")} />
        <Text name="email" label="E-post" type="email" value={value.email} onChange={set("email")} />
      </div>
      <Text name="street" label="Gateadresse" value={value.street} onChange={set("street")} />
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Text name="postalCode" label="Postnr." inputMode="numeric" maxLength={4} value={value.postalCode} onChange={set("postalCode")} />
        <Text name="city" label="Poststed" value={value.city} onChange={set("city")} />
      </div>
      {!hideOrgnr && <Text name="orgnr" label="Org.nr." inputMode="numeric" value={value.orgnr} onChange={set("orgnr")} />}

      <fieldset className="rounded-md border border-neutral-300 p-3">
        <legend className="px-1 text-sm font-medium">Åpningstider</legend>
        <ol className="space-y-2">
          {hours.map((h, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Text name="hoursDay" label="Dag" value={h.day} onChange={(v) => setHours(hours.map((x, j) => (j === i ? { ...x, day: v } : x)))} />
              <Text name="hoursTime" label="Tid" value={h.time} onChange={(v) => setHours(hours.map((x, j) => (j === i ? { ...x, time: v } : x)))} />
              <button type="button" className="mb-2 text-sm underline" onClick={() => setHours(hours.filter((_, j) => j !== i))}>
                Fjern
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="mt-2 text-sm underline" onClick={() => setHours([...hours, { day: "", time: "" }])}>
          + Legg til dag
        </button>
      </fieldset>
    </div>
  );
}
