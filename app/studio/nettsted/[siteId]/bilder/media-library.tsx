"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadImage } from "@/components/studio/image-input";
import type { MediaItem, MediaUsage } from "@/lib/media";
import { mediaThumb } from "@/lib/media-types";
import type { ActionState } from "../../../actions";
import { deleteMediaAction, setMediaAltAction } from "../../../media-actions";

type Item = MediaItem & { usedIn: MediaUsage[] };

const dateFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" });

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function MediaLibrary({ siteId, items }: { siteId: string; items: Item[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [status, setStatus] = useState<ActionState>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const unused = items.filter((item) => item.usedIn.length === 0);
  const shown = onlyUnused ? unused : items;
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);

  const upload = async (files: File[]) => {
    setStatus(null);
    const failed: string[] = [];
    for (const [n, file] of files.entries()) {
      setUploading({ done: n, total: files.length });
      try {
        await uploadImage(siteId, file);
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "Opplastingen feilet"}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    const ok = files.length - failed.length;
    setStatus(
      failed.length
        ? { ok: false, message: `${ok} av ${files.length} bilder ble lastet opp. Disse feilet:\n${failed.join("\n")}` }
        : { ok: true, message: ok === 1 ? "Bildet er lastet opp." : `${ok} bilder er lastet opp.` },
    );
    router.refresh();
  };

  const remove = (item: Item) => {
    if (!confirm("Slette bildet for godt? Det kan ikke angres.")) return;
    startTransition(async () => setStatus(await deleteMediaAction(siteId, item.id)));
  };

  const saveAlt = (item: Item, alt: string) => startTransition(async () => setStatus(await setMediaAltAction(siteId, item.id, alt)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <p className="mr-auto text-sm text-neutral-700">
          {items.length === 1 ? "1 bilde" : `${items.length} bilder`}
          {items.length > 0 && ` · ${formatBytes(totalBytes)}`}
          {unused.length > 0 && ` · ${unused.length} ikke i bruk`}
        </p>
        {unused.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} />
            Vis bare bilder som ikke er i bruk
          </label>
        )}
        <label className="cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
          {uploading ? `Laster opp ${uploading.done + 1} av ${uploading.total}...` : "Last opp bilder"}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="sr-only"
            disabled={uploading !== null}
            onChange={(e) => e.target.files?.length && upload(Array.from(e.target.files))}
          />
        </label>
      </div>
      <p className="mb-6 text-sm text-neutral-700">
        Bildene krympes automatisk før de lastes opp. Et bilde kan slettes for godt når det ikke brukes på noen side, vare eller som logo.
      </p>

      {status && (
        <p
          role="status"
          className={`mb-6 whitespace-pre-line rounded-md p-3 text-sm ${status.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
        >
          {status.message}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-400 p-8 text-center text-neutral-700">
          Ingen bilder ennå. Last opp bilder her, eller fra et bildefelt når du redigerer en side eller en vare.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <li key={item.id} className="flex flex-col rounded-lg border border-neutral-300 bg-white p-3">
              <a
                href={item.src}
                target="_blank"
                rel="noopener"
                className="block"
                aria-label={`Åpne bildet i full størrelse${item.alt ? `: ${item.alt}` : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- bilder fra eget lager, allerede krympet ved opplasting */}
                <img src={mediaThumb(item.src)} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded object-cover" />
              </a>
              <p className="mt-2 text-xs text-neutral-600">
                {item.width && item.height ? `${item.width} × ${item.height} · ` : ""}
                {formatBytes(item.size)} · {dateFormat.format(new Date(item.createdAt))}
              </p>
              <div className="mt-2 text-sm">
                {item.usedIn.length ? (
                  <>
                    <span className="font-medium">Brukes på: </span>
                    {item.usedIn.map((use, i) => (
                      <span key={use.href + use.label}>
                        {i > 0 && ", "}
                        <Link href={use.href} className="underline">
                          {use.label}
                        </Link>
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="text-neutral-700">Ikke i bruk</span>
                )}
              </div>
              <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAlt(item, String(new FormData(e.currentTarget).get("alt") ?? ""));
                }}
              >
                <label className="block min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium">Beskrivelse (alt-tekst)</span>
                  <input
                    name="alt"
                    defaultValue={item.alt}
                    maxLength={200}
                    placeholder="Følger med når bildet velges"
                    className="w-full rounded-md border border-neutral-400 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <button type="submit" disabled={pending} className="rounded-md border border-neutral-900 px-3 py-1.5 text-sm font-semibold">
                  Lagre
                </button>
              </form>
              {item.usedIn.length === 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(item)}
                  className="mt-3 self-start text-sm text-red-800 underline"
                >
                  Slett for godt
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
