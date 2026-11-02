"use client";

import { useEffect, useId, useRef, useState } from "react";
import { startInquiryImageUpload } from "@/app/actions/inquiry";
import type { FormField } from "@/lib/content/form-fields";

/** Samme tall som i lib/henvendelser/bilder.ts. Den filen bruker databasen og kan ikke lastes i nettleseren. */
const MAX_IMAGES = 5;
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 2000;

type Item = { key: string; name: string; status: "laster" | "ferdig" | "feil"; id?: string; preview?: string; error?: string };

/**
 * Krymper til maks 2000 px og lagrer som JPEG, som i studioet. Et mobilbilde på 4-8 MB blir vanligvis under 1 MB.
 * Når bildet tegnes på nytt, forsvinner også det som er lagret i filen, som hvor bildet er tatt.
 */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    // Hvit bakgrunn, så gjennomsiktige PNG-er ikke blir svarte i JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("jpeg");
    return blob;
  } finally {
    bitmap.close();
  }
}

const bilder = (n: number) => `${n} ${n === 1 ? "bilde" : "bilder"}`;

/**
 * Bildefeltet i kontaktskjemaet. Bildene lastes opp med en gang de er valgt, og skjemaet sender bare id-ene og
 * nøkkelen (bilde-nokkel og bilder). Feltet «bilder-venter» stopper innsending mens noe fortsatt lastes opp.
 * Filvelgeren har ikke name, så selve filene aldri sendes med skjemaet.
 */
export function InquiryImages({
  siteId,
  path,
  sectionId,
  field,
  name,
  preview,
  invalid,
}: {
  siteId: string;
  path: string;
  sectionId: string;
  field: FormField;
  /** Feltnavnet («felt-2»). Brukes når serveren sier at noe er galt med bildene, så fokus kan flyttes hit. */
  name: string;
  preview: boolean;
  invalid: Record<string, unknown>;
}) {
  const inputId = useId();
  const hintId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("");
  // Én nøkkel for alle bildene i skjemaet. Løftet deles, så bilder som velges samtidig ikke får hver sin nøkkel.
  const tokenRequest = useRef<Promise<string> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const previews = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);

  // Forhåndsvisningene frigjøres når skjemaet forsvinner.
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Knappen som ble trykket, forsvinner med bildet. Fokus går da til filvelgeren, ikke til toppen av siden.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    inputRef.current?.focus();
  }, [items]);

  const update = (key: string, patch: Partial<Item>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function getToken(): Promise<string> {
    tokenRequest.current ??= startInquiryImageUpload(siteId, path, sectionId).then((res) => {
      if (!res.ok) {
        // Neste forsøk spør på nytt, for eksempel når grensen er nådd og det har gått litt tid.
        tokenRequest.current = null;
        throw new Error(res.message);
      }
      setToken(res.token);
      return res.token;
    });
    return tokenRequest.current;
  }

  async function upload(item: Item, file: File) {
    try {
      if (file.size > MAX_ORIGINAL_BYTES) throw new Error(`«${file.name}» er større enn 10 MB`);
      let blob: Blob;
      try {
        blob = await shrink(file);
      } catch {
        throw new Error(`Vi klarte ikke å lese «${file.name}». Bruk et bilde i JPG, PNG eller WebP.`);
      }
      const url = URL.createObjectURL(blob);
      previews.current.push(url);
      update(item.key, { preview: url });
      const form = new FormData();
      form.set("token", await getToken());
      form.set("file", blob, "bilde.jpg");
      const res = await fetch("/api/henvendelse/bilde", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Opplastingen feilet");
      update(item.key, { status: "ferdig", id: data.id });
      return true;
    } catch (err) {
      update(item.key, { status: "feil", error: err instanceof Error ? err.message : "Opplastingen feilet" });
      return false;
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - items.filter((i) => i.status !== "feil").length;
    const chosen = files.slice(0, Math.max(0, room));
    if (!chosen.length) {
      setStatus(`Du kan legge ved høyst ${MAX_IMAGES} bilder.`);
      return;
    }
    const added: Item[] = chosen.map((f) => ({ key: crypto.randomUUID(), name: f.name, status: "laster" }));
    // Bilder som feilet, fjernes når nye velges, så listen bare viser det som gjelder.
    setItems((all) => [...all.filter((i) => i.status !== "feil"), ...added]);
    setStatus(`Laster opp ${bilder(chosen.length)}${files.length > chosen.length ? `. Bare ${MAX_IMAGES} bilder er lov, så resten ble ikke lagt ved` : ""}.`);
    const results = await Promise.all(added.map((item, i) => upload(item, chosen[i])));
    const ok = results.filter(Boolean).length;
    const failed = results.length - ok;
    setStatus(
      failed === 0
        ? `${ok === 1 ? "Bildet er lagt ved" : `${bilder(ok)} er lagt ved`}.`
        : `${ok ? `${bilder(ok)} er lagt ved. ` : ""}${failed === 1 ? "Ett bilde" : `${failed} bilder`} kunne ikke lastes opp. Se feilen under.`,
    );
  }

  async function remove(item: Item) {
    refocus.current = true;
    setItems((all) => all.filter((i) => i.key !== item.key));
    setStatus(`«${item.name}» er fjernet.`);
    if (item.id && token) {
      // Svaret trengs ikke. Fjernes ikke bildet her, slettes det av ryddejobben etter et døgn.
      fetch("/api/henvendelse/bilde", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, id: item.id }) }).catch(() => {});
    }
  }

  const done = items.filter((i) => i.status === "ferdig" && i.id);
  const busy = items.filter((i) => i.status === "laster").length;
  const full = items.filter((i) => i.status !== "feil").length >= MAX_IMAGES;
  const describedBy = [hintId, invalid["aria-describedby"]].filter(Boolean).join(" ");

  return (
    <div>
      <input type="hidden" name="bilde-nokkel" value={done.length ? (token ?? "") : ""} />
      <input type="hidden" name="bilder" value={done.map((i) => i.id).join(",")} />
      <input type="hidden" name="bilder-venter" value={String(busy)} />
      <label htmlFor={inputId} className="mb-1 block font-medium">
        {field.label}
        {!field.required && <span className="font-normal text-[var(--c-muted)]"> (valgfritt)</span>}
      </label>
      <p id={hintId} className="mb-2 text-sm text-[var(--c-muted)]">
        Opptil {MAX_IMAGES} bilder i JPG, PNG eller WebP. Bildene gjøres mindre før de sendes.
      </p>
      <input
        ref={inputRef}
        id={inputId}
        data-field={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={preview || full}
        onChange={onPick}
        aria-describedby={describedBy}
        aria-invalid={invalid["aria-invalid"] ? true : undefined}
        className="block w-full text-sm file:mr-3 file:rounded-[var(--radius)] file:border file:border-[var(--c-muted)] file:bg-[var(--c-surface)] file:px-4 file:py-2 file:font-semibold file:text-[var(--c-text)] focus-visible:outline-2 focus-visible:outline-[var(--c-primary)] disabled:opacity-60"
      />
      {items.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((item, i) => (
            <li key={item.key} className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--c-muted)] p-2">
              {item.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.preview} alt="" className="size-14 shrink-0 rounded object-cover" />
              ) : (
                <span aria-hidden="true" className="size-14 shrink-0 rounded bg-[var(--c-surface)]" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{item.name}</p>
                <p id={`${hintId}-${item.key}`} className={item.status === "feil" ? "font-medium" : "text-[var(--c-muted)]"}>
                  {item.status === "laster" ? "Laster opp..." : item.status === "ferdig" ? "Lagt ved" : item.error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={item.status === "laster"}
                aria-label={`Fjern bilde ${i + 1}, ${item.name}`}
                aria-describedby={`${hintId}-${item.key}`}
                className="shrink-0 rounded-[var(--radius)] px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-[var(--c-primary)] disabled:opacity-60"
              >
                Fjern
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" role="status" className="mt-2 text-sm">
        {status}
      </p>
    </div>
  );
}
