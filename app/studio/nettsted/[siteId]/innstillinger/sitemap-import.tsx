"use client";

import { useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "@/app/studio/actions";
import { importRedirectsAction, scanSitemapAction, type SitemapScan } from "@/app/studio/site-actions";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const field = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

/**
 * Henter gamle adresser fra sitemapen til den gamle nettsiden og foreslår hvilken ny side hver skal til.
 * Kunden ser over forslagene og lagrer. Ingenting lagres før det.
 */
export function SitemapImport({ siteId, currentText, onSaved }: { siteId: string; currentText: string; onSaved: (text: string) => void }) {
  const [url, setUrl] = useState("");
  const [scan, setScan] = useState<SitemapScan | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  const run = (source: { url: string } | { xml: string }) =>
    startTransition(async () => {
      setSaved(null);
      const result = await scanSitemapAction(siteId, source);
      setScan(result);
      setChoices(Object.fromEntries(result.rows.filter((r) => r.suggestion).map((r) => [r.from, r.suggestion!])));
    });

  const readFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setScan({ ok: false, message: "Filen er for stor (maks 5 MB)", rows: [], pages: [] });
      return;
    }
    run({ xml: await file.text() });
  };

  const selected = Object.entries(choices).filter(([, to]) => to);
  const rows = scan?.rows ?? [];

  return (
    <fieldset className="space-y-3 rounded-md border border-neutral-300 p-4">
      <legend className="px-1 text-sm font-medium">Hent gamle adresser fra sitemap</legend>
      <p className="text-sm text-neutral-600">
        De fleste nettsider har en liste over alle sidene sine, ofte på /sitemap.xml. Vi foreslår hvilken ny side hver gamle adresse skal til, så
        ser du over før noe lagres.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) run({ url: url.trim() });
        }}
      >
        <label className="block min-w-60 flex-1">
          <span className="mb-1 block text-sm">Adressen til den gamle sitemapen</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://gammelside.no/sitemap.xml" className={field} />
        </label>
        <button disabled={pending || !url.trim()} className="rounded-md border border-[#173b6c] px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {pending ? "Henter..." : "Hent adresser"}
        </button>
      </form>
      <label className="block text-sm">
        <span className="mb-1 block">Eller last opp sitemap.xml</span>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
            e.target.value = "";
          }}
        />
      </label>

      {scan && <FormStatus state={{ ok: scan.ok, message: scan.message }} />}

      {rows.length > 0 && scan && (
        <div className="space-y-3">
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Gamle adresser og ny side for hver</caption>
              <thead className="sticky top-0 bg-neutral-100">
                <tr>
                  <th scope="col" className="p-2 font-medium">
                    Gammel adresse
                  </th>
                  <th scope="col" className="p-2 font-medium">
                    Send til
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.from}>
                    <td className="break-all p-2 font-mono text-xs">{row.from}</td>
                    <td className="p-2">
                      {row.exists ? (
                        <span className="text-neutral-600">Finnes her allerede</span>
                      ) : (
                        <select
                          aria-label={`Send ${row.from} til`}
                          value={choices[row.from] ?? ""}
                          onChange={(e) => setChoices({ ...choices, [row.from]: e.target.value })}
                          className="w-full rounded-md border border-neutral-300 px-2 py-1"
                        >
                          <option value="">Ikke send videre</option>
                          {scan.pages.map((p) => (
                            <option key={p.path} value={p.path}>
                              {p.title} ({p.path})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={pending || selected.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await importRedirectsAction(
                  siteId,
                  currentText,
                  selected.map(([from, to]) => ({ from, to })),
                );
                setSaved(result.state);
                if (result.state?.ok) {
                  onSaved(result.text);
                  setScan(null);
                  setChoices({});
                }
              })
            }
            className="rounded-md bg-[#173b6c] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {selected.length === 1 ? "Lagre 1 omdirigering" : `Lagre ${selected.length} omdirigeringer`}
          </button>
        </div>
      )}
      <FormStatus state={saved} />
    </fieldset>
  );
}
