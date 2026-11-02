"use client";

import { useId, useRef, useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import type { ActionState } from "../../../actions";
import { removeFaviconAction, saveFaviconAction } from "../../../media-actions";

/** Samme liste som FAVICON_ACCEPT i lib/favicon.ts. Den filen kan ikke hentes inn her, fordi den snakker med databasen. */
const ACCEPT = "image/png,image/webp,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico";

/** Tegner bildet kvadratisk (midten beholdes) i ønsket størrelse og gir en PNG. */
function squarePng(image: HTMLImageElement, size: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas"));
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = (image.naturalWidth - side) / 2;
  const sy = (image.naturalHeight - side) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bilde"));
    };
    image.src = url;
  });
}

/**
 * Ikonet i nettleserfanen (favicon). Nettleseren lager PNG på 180 og 48 px, så serveren slipper å tegne om bilder.
 * Uten eget ikon brukes forbokstaven i navnet i temafargene.
 */
export function FaviconForm({ siteId, current, fallback }: { siteId: string; current: string | null; fallback: string }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const upload = (file: File) =>
    startTransition(async () => {
      if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
        setState({ ok: false, message: "SVG kan ikke brukes. Velg et PNG-, WebP-, ICO- eller JPEG-bilde." });
        return;
      }
      try {
        const image = await loadImage(file);
        if (image.naturalWidth < 48 || image.naturalHeight < 48) {
          setState({ ok: false, message: "Bildet er for lite. Det må være minst 48 x 48 piksler, helst 180 x 180 eller større." });
          return;
        }
        const form = new FormData();
        form.set("icon", await squarePng(image, 180), "ikon.png");
        form.set("small", await squarePng(image, 48), "ikon-48.png");
        setState(await saveFaviconAction(siteId, form));
      } catch {
        setState({ ok: false, message: "Bildet kunne ikke leses. Velg et PNG-, WebP-, ICO- eller JPEG-bilde." });
      } finally {
        if (input.current) input.current.value = "";
      }
    });

  return (
    <section className="mt-8 space-y-3 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Ikon i nettleserfanen</h2>
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current ?? fallback} alt="" width={48} height={48} className="h-12 w-12 rounded border border-neutral-300" />
        <p id={hintId} className="max-w-md text-sm text-neutral-600">
          {current
            ? "Dette ikonet vises i fanen og når noen legger nettstedet på hjemskjermen."
            : "Nå vises forbokstaven i navnet i fargene fra temaet. Last opp et kvadratisk bilde, for eksempel logoen, på minst 180 x 180 piksler."}
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{current ? "Bytt ikon" : "Last opp ikon"} (PNG, WebP, ICO eller JPEG)</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          disabled={pending}
          aria-describedby={hintId}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          className="block text-sm"
        />
      </label>
      {pending && <p role="status" className="text-sm">Lagrer ikonet...</p>}
      <FormStatus state={state} />
      {current && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setState(await removeFaviconAction(siteId)))}
          className="text-sm underline disabled:opacity-40"
        >
          Fjern ikonet og bruk forbokstaven
        </button>
      )}
    </section>
  );
}
