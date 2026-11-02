"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/studio/actions";
import { FormStatus } from "@/components/studio/form-status";
import { HelpLink } from "@/components/studio/help";
import type { ExportView } from "@/lib/eksport";
import { requestExportAction } from "./export-actions";

const day = (iso: string) => new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);

/**
 * «Last ned alt» i Innstillinger, bare for eieren. Viser status mens filen lages, og lenken når den er klar.
 * Mens filen lages, hentes statusen på nytt hvert 20. sekund.
 */
export function ExportSection({ siteId, view, downloadHref }: { siteId: string; view: ExportView; downloadHref: string | null }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (view.status !== "lager") return;
    const timer = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(timer);
  }, [view.status, router]);

  const start = () => startTransition(async () => setState(await requestExportAction(siteId)));

  return (
    <section id="last-ned-alt" aria-labelledby="last-ned-alt-tittel" className="mt-8 space-y-3 rounded-lg border bg-white p-5">
      <h2 id="last-ned-alt-tittel" className="font-semibold">
        Last ned alt
      </h2>
      <p className="text-sm text-neutral-600">
        Én ZIP-fil med de publiserte sidene som HTML, alt innholdet, bildene og filene, og varer, ordre, kunder, henvendelser, abonnenter og
        bookinger som regneark. Det er ditt, og du kan ta det med deg. <HelpLink slug="last-ned-alt" />
      </p>

      {view.status === "lager" && (
        <p role="status" className="rounded-md bg-neutral-100 p-3 text-sm">
          Filen lages. {view.done} av {view.total} filer er med. Du får e-post når den er ferdig, og kan gå fra siden så lenge.
        </p>
      )}
      {view.status === "ferdig" && downloadHref && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-900">
          <p>
            Filen ble laget {day(view.finishedAt)}, {size(view.bytes)}. Lenken virker til {day(view.expiresAt)}.
          </p>
          <a href={downloadHref} className="mt-2 inline-block font-semibold underline" download>
            Last ned ZIP-filen
          </a>
        </div>
      )}
      {view.status === "feilet" && <p className="rounded-md bg-red-50 p-3 text-sm text-red-900">Forrige forsøk stoppet: {view.error}</p>}

      <p className="text-sm text-neutral-600">Filen har personopplysninger om kundene dine. Lagre den trygt, og slett den når du ikke trenger den.</p>
      <FormStatus state={state} />
      {view.status !== "lager" && (
        <button
          type="button"
          disabled={pending}
          onClick={start}
          className="rounded-md bg-[#173b6c] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Starter..." : view.status === "ferdig" ? "Lag en ny ZIP-fil" : "Lag ZIP-fil"}
        </button>
      )}
    </section>
  );
}
