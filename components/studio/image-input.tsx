"use client";

import { createContext, useContext, useRef, useState } from "react";
import { EXAMPLE_IMAGE_SRC, type ImageValue } from "@/lib/content/fields";
import { MediaPicker } from "./media-picker";

/** Nettstedet bildene lastes opp til. Settes én gang rundt redigereren i stedet for å sendes gjennom alle felt. */
export const SiteIdContext = createContext<string | null>(null);

const MAX_SIDE = 2000;

/**
 * Krymper til maks 2000 px og gjør om til WebP før opplasting. Et mobilbilde på 4-8 MB
 * blir vanligvis 200-500 KB. GIF sendes uendret, så animasjoner beholdes.
 */
async function prepare(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (file.type === "image/gif") return { blob: file, width, height };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("Kunne ikke behandle bildet");
  return { blob, width, height };
}

/** Krymper og laster opp ett bilde til nettstedets bibliotek. Returnerer stien som brukes i innholdet. */
export async function uploadImage(siteId: string, file: File): Promise<string> {
  const { blob, width, height } = await prepare(file);
  const form = new FormData();
  form.set("siteId", siteId);
  form.set("file", blob, file.name);
  form.set("width", String(width));
  form.set("height", String(height));
  const res = await fetch("/studio/api/media", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
  if (!res.ok || !data.src) throw new Error(data.error ?? "Opplastingen feilet");
  return data.src;
}

export function ImageInput({
  label,
  value,
  optional,
  onChange,
}: {
  label: string;
  value: ImageValue | null | undefined;
  optional?: boolean;
  onChange: (v: ImageValue | null) => void;
}) {
  const siteId = useContext(SiteIdContext);
  const isExample = value?.src === EXAMPLE_IMAGE_SRC;
  const hasImage = Boolean(value?.src) && !isExample;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const upload = async (file: File) => {
    if (!siteId) return;
    setBusy(true);
    setError(null);
    try {
      const src = await uploadImage(siteId, file);
      // Alt-teksten følger bare med når et ekte bilde byttes, ikke fra eksempelbildet.
      onChange({ src, alt: hasImage ? (value?.alt ?? "") : "" });
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
      <div className="flex flex-wrap items-start gap-4">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- forhåndsvisning av eget opplastet bilde
          <img src={value?.src} alt="" className="h-24 w-32 rounded object-cover" />
        ) : (
          <div className="flex h-24 w-32 items-center justify-center rounded bg-neutral-100 text-xs text-neutral-600">
            {isExample ? "Eksempelbilde" : "Ingen bilde"}
          </div>
        )}
        <div className="min-w-48 flex-1 space-y-2">
          {isExample && <p className="text-sm text-amber-900">Bytt ut eksempelbildet med et eget bilde før du publiserer.</p>}
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="cursor-pointer rounded-md border border-neutral-900 px-3 py-1.5 font-semibold has-[:focus-visible]:outline-2">
              {busy ? "Laster opp..." : hasImage ? "Bytt bilde" : "Last opp bilde"}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="sr-only"
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
            </label>
            {siteId && (
              <button type="button" className="rounded-md border border-neutral-400 px-3 py-1.5" onClick={() => setPicking(true)}>
                Velg fra biblioteket
              </button>
            )}
            {value?.src && (
              <button type="button" className="underline" onClick={() => onChange(null)}>
                Fjern
              </button>
            )}
          </div>
          {hasImage && value && (
            <>
              <label className="block">
                <span className="block text-sm">Beskrivelse av bildet (alt-tekst)</span>
                <span className="mb-1 block text-xs text-neutral-600">Brukes av skjermlesere og Google. Én kort setning holder.</span>
                <input
                  value={value.alt}
                  disabled={value.decorative}
                  onChange={(e) => onChange({ ...value, alt: e.target.value })}
                  placeholder="F.eks. Rørlegger monterer ny servant på bad"
                  className="w-full rounded-md border border-neutral-400 bg-white px-3 py-2 disabled:bg-neutral-100"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.decorative ?? false}
                  onChange={(e) => onChange({ ...value, decorative: e.target.checked, alt: e.target.checked ? "" : value.alt })}
                />
                Bildet er bare pynt og trenger ingen beskrivelse
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      </div>
      {picking && siteId && (
        <MediaPicker
          siteId={siteId}
          // Beskrivelsen fra biblioteket følger med, så den bare trenger å skrives én gang.
          onPick={(item) => onChange({ src: item.src, alt: item.alt })}
          onClose={() => setPicking(false)}
        />
      )}
    </fieldset>
  );
}
