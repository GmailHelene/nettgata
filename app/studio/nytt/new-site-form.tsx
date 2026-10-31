"use client";

import { useActionState, useState, useTransition } from "react";
import { DesignPicker, type DesignOption } from "@/components/studio/design-picker";
import { FormStatus } from "@/components/studio/form-status";
import { InfoFields, inputClass } from "@/components/studio/info-fields";
import { readSiteInfo, type SiteInfo } from "@/lib/site-info";
import { createSiteAction, lookupOrgnrAction } from "../site-actions";

type PackOption = { key: string; label: string; description: string; designs: DesignOption[] };

export function NewSiteForm({ packs }: { packs: PackOption[] }) {
  const [state, action, pending] = useActionState(createSiteAction, null);
  const [packKey, setPackKey] = useState(packs[0]?.key ?? "");
  const [name, setName] = useState("");
  const [info, setInfo] = useState<SiteInfo>(readSiteInfo({}));
  const [lookup, setLookup] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();
  const pack = packs.find((p) => p.key === packKey) ?? packs[0];

  const fetchCompany = () =>
    startLookup(async () => {
      const company = await lookupOrgnrAction(info.orgnr);
      if (!company) {
        setLookup("Fant ikke org.nr. i Enhetsregisteret. Sjekk nummeret eller fyll inn selv.");
        return;
      }
      setName(company.name);
      setInfo({ ...info, orgnr: company.orgnr, street: company.street, postalCode: company.postalCode, city: company.city });
      setLookup(`Hentet fra Brønnøysund: ${company.name}${company.industry ? `, ${company.industry.toLowerCase()}` : ""}`);
    });

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">1. Bedriften</h2>
        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-sm font-medium">Org.nr.</span>
            <input name="orgnr" value={info.orgnr} onChange={(e) => setInfo({ ...info, orgnr: e.target.value })} inputMode="numeric" className={inputClass} />
          </label>
          <button type="button" onClick={fetchCompany} disabled={looking || info.orgnr.replace(/\s/g, "").length !== 9} className="rounded-md border border-neutral-900 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {looking ? "Henter..." : "Hent fra Brreg"}
          </button>
        </div>
        {lookup && <p className="text-sm text-neutral-700">{lookup}</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Navn på nettstedet</span>
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Ønsket adresse (valgfritt)</span>
          <input name="slug" placeholder="lages fra navnet" className={inputClass} />
          <span className="mt-1 block text-xs text-neutral-600">Blir til navn.helene.cloud. Eget domene kobles senere.</span>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">2. Bransje og design</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {packs.map((p) => (
            <label key={p.key} className="cursor-pointer rounded-md border p-3 has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-100">
              <input type="radio" name="pack" value={p.key} checked={p.key === packKey} onChange={() => setPackKey(p.key)} className="mr-2" />
              <span className="font-medium">{p.label}</span>
              <span className="mt-1 block text-sm text-neutral-600">{p.description}</span>
            </label>
          ))}
        </div>
        {pack && <DesignPicker key={pack.key} designs={pack.designs} />}
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">3. Kontaktinfo</h2>
        <p className="text-sm text-neutral-600">Dette vises i menyen, bunnteksten, kontaktsiden og i Google.</p>
        <InfoFields value={info} onChange={setInfo} hideOrgnr />
      </section>

      <FormStatus state={state} />
      <button disabled={pending} className="rounded-md bg-neutral-900 px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Lager nettstedet..." : "Lag nettstedet som kladd"}
      </button>
    </form>
  );
}
