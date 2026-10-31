import type { Theme } from "@/lib/theme";

export type DesignOption = { key: string; label: string; theme: Theme };

/** Viser designretningene som små forhåndsvisninger, slik at valget ikke bare er et navn. */
export function DesignPicker({ designs, defaultValue }: { designs: DesignOption[]; defaultValue?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Designretning</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {designs.map((d, i) => (
          <label key={d.key} className="cursor-pointer rounded-lg border-2 border-transparent has-[:checked]:border-neutral-900 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-700">
            <input type="radio" name="design" value={d.key} defaultChecked={defaultValue ? d.key === defaultValue : i === 0} className="sr-only" />
            <span className="block rounded-md p-4" style={{ background: d.theme.background, color: d.theme.text }}>
              <span className="block font-bold">{d.label}</span>
              <span className="mt-2 block text-sm" style={{ color: d.theme.muted }}>
                Eksempeltekst
              </span>
              <span className="mt-3 inline-block rounded px-3 py-1 text-sm font-semibold" style={{ background: d.theme.primary, color: d.theme.onPrimary }}>
                Knapp
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
