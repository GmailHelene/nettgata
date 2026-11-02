"use client";

import { useContext, useRef, useState } from "react";
import type { FileValue } from "@/lib/content/fields";
import { MAX_FILE_BYTES } from "@/lib/media-types";
import { SiteIdContext } from "./image-input";
import { deleteOldFileAction } from "@/app/studio/media-actions";

/** Laster opp én PDF til nettstedets lager. Filtypen sjekkes igjen på serveren. */
async function uploadFile(siteId: string, file: File): Promise<FileValue> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Filen er større enn 10 MB");
  const form = new FormData();
  form.set("siteId", siteId);
  form.set("file", file, file.name);
  const res = await fetch("/studio/api/fil", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { src?: string; name?: string; size?: number; error?: string };
  if (!res.ok || !data.src) throw new Error(data.error ?? "Opplastingen feilet");
  return { src: data.src, name: data.name ?? file.name, size: data.size };
}

/**
 * PDF-felt, for eksempel menyen. Én knapp laster opp eller bytter filen. Når menyen endres,
 * laster kunden opp den nye, og lenken på nettstedet peker dit etter neste publisering.
 */
export function FileInput({
  label,
  value,
  optional,
  onChange,
}: {
  label: string;
  value: FileValue | null | undefined;
  optional?: boolean;
  onChange: (v: FileValue | null) => void;
}) {
  const siteId = useContext(SiteIdContext);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Filen som ble byttet ut. Kunden får tilbud om å slette den, så lageret ikke fylles med gamle menyer. */
  const [replaced, setReplaced] = useState<FileValue | null>(null);
  const [cleanup, setCleanup] = useState<{ ok: boolean; message: string } | null>(null);

  const upload = async (file: File) => {
    if (!siteId) return;
    setBusy(true);
    setError(null);
    setCleanup(null);
    try {
      const previous = value?.src ? value : null;
      onChange(await uploadFile(siteId, file));
      setReplaced(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opplastingen feilet");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <fieldset className="rounded-md border border-neutral-300 p-3">
      <legend className="px-1 text-sm font-medium">
        {label}
        {optional && <span className="font-normal text-neutral-600"> (valgfritt)</span>}
      </legend>
      <p className="mb-2 text-sm text-neutral-700">
        {value?.src ? (
          <>
            Nå:{" "}
            <a href={value.src} target="_blank" rel="noopener" className="underline">
              {value.name || "PDF"}
              <span className="sr-only"> (åpnes i ny fane)</span>
            </a>
          </>
        ) : (
          "Ingen fil ennå. Bare PDF, maks 10 MB."
        )}
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="cursor-pointer rounded-md border border-[#173b6c] px-3 py-1.5 font-semibold has-[:focus-visible]:outline-2">
          {busy ? "Laster opp..." : value?.src ? "Bytt fil" : "Last opp PDF"}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={busy || !siteId}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        {value?.src && (
          <button type="button" className="underline" onClick={() => onChange(null)}>
            Fjern
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {replaced && (
        <div role="status" className="mt-3 rounded-md bg-neutral-100 p-3 text-sm">
          <p>Den gamle filen «{replaced.name || "PDF"}» ligger fortsatt i biblioteket. Vil du slette den?</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className="font-semibold underline"
              onClick={async () => {
                if (!siteId) return;
                setBusy(true);
                const result = await deleteOldFileAction(siteId, replaced.src).catch(() => ({ ok: false, message: "Noe gikk galt. Prøv igjen." }));
                setBusy(false);
                setCleanup(result);
                if (result?.ok) setReplaced(null);
              }}
            >
              Slett den gamle filen
            </button>
            <button type="button" className="underline" onClick={() => setReplaced(null)}>
              Behold den
            </button>
          </div>
        </div>
      )}
      {cleanup && (
        <p role={cleanup.ok ? "status" : "alert"} className={`mt-2 text-sm ${cleanup.ok ? "text-green-800" : "text-red-800"}`}>
          {cleanup.message}
        </p>
      )}
    </fieldset>
  );
}
