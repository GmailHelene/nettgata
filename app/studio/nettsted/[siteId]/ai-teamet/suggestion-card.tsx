"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ui } from "@/components/studio/ui";
import { approveAction, rejectAction, runNowAction, type SuggestionActionState } from "./actions";
import { FormStatus } from "@/components/studio/form-status";

export type CardData = {
  id: string;
  roleLabel: string;
  kindLabel: string;
  kind: string;
  title: string;
  pageTitle: string | null;
  fieldLabel: string | null;
  before: string | null;
  value: string;
  ingress: string | null;
  channel: string | null;
  reason: string;
  effect: string;
};

const box = "whitespace-pre-line rounded-lg border border-[#d5dbe0] p-3 text-[0.95rem]";

/** Ett forslag med før og etter, og knappene Godkjenn og Avvis. Ingenting endres før kunden trykker Godkjenn. */
export function SuggestionCard({ siteId, s }: { siteId: string; s: CardData }) {
  const [approved, approve, approving] = useActionState<SuggestionActionState>(approveAction.bind(null, siteId, s.id), null);
  const [rejected, reject, rejecting] = useActionState<SuggestionActionState>(rejectAction.bind(null, siteId, s.id), null);
  const [copied, setCopied] = useState(false);
  const done = approved?.ok || rejected?.ok;
  const state = approved ?? rejected;
  const headingId = `forslag-${s.id}`;
  const approveLabel = s.kind === "tips" ? "Notert" : s.kind === "sosialt_innlegg" ? "Godkjenn teksten" : "Godkjenn";

  async function copy() {
    try {
      await navigator.clipboard.writeText(s.value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article aria-labelledby={headingId} className={`${ui.card} p-5`}>
      <p className="text-sm font-semibold text-[#2f5a47]">
        {s.roleLabel} · {s.kindLabel}
        {s.channel && `, ${s.channel === "instagram" ? "Instagram" : "Facebook"}`}
      </p>
      <h3 id={headingId} className="mt-1 text-lg font-semibold">
        {s.title}
      </h3>
      {s.pageTitle && (
        <p className={`mt-1 text-sm ${ui.muted}`}>
          Side: {s.pageTitle}
          {s.fieldLabel && `, ${s.fieldLabel}`}
        </p>
      )}

      <p className="mt-3">{s.reason}</p>
      <p className={`mt-1 text-sm ${ui.muted}`}>Hva det skal gi: {s.effect}</p>

      <div className={`mt-4 grid gap-3 ${s.before !== null ? "md:grid-cols-2" : ""}`}>
        {s.before !== null && (
          <div>
            <p className="mb-1 text-sm font-semibold">Nå</p>
            <p className={`${box} bg-[#f2f4f5]`}>{s.before || <span className={ui.muted}>(tomt)</span>}</p>
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-semibold">{s.before !== null ? "Forslag" : s.kind === "tips" ? "Tips" : "Utkast"}</p>
          {s.ingress && <p className={`${box} mb-2 bg-white font-medium`}>{s.ingress}</p>}
          <p className={`${box} max-h-96 overflow-y-auto bg-white`} tabIndex={0} aria-label={`Teksten i forslaget «${s.title}»`}>
            {s.value}
          </p>
        </div>
      </div>

      {!done && (
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={approve}>
            <button disabled={approving || rejecting} className={ui.button}>
              {approving ? "Lagrer..." : approveLabel}
            </button>
          </form>
          {s.kind !== "tips" && (
            <form action={reject}>
              <button disabled={approving || rejecting} className={ui.buttonGhost}>
                {rejecting ? "Avviser..." : "Avvis"}
              </button>
            </form>
          )}
          {s.kind === "sosialt_innlegg" && (
            <button type="button" onClick={copy} className={ui.buttonGhost}>
              {copied ? "Kopiert" : "Kopier teksten"}
            </button>
          )}
        </div>
      )}
      {s.kind !== "tips" && s.kind !== "sosialt_innlegg" && !done && (
        <p className={`mt-2 text-sm ${ui.muted}`}>Godkjenn legger endringen i kladden. Den vises på nettstedet først når du publiserer.</p>
      )}
      {done && s.kind === "sosialt_innlegg" && (
        <button type="button" onClick={copy} className={`${ui.buttonGhost} mt-4`}>
          {copied ? "Kopiert" : "Kopier teksten"}
        </button>
      )}
      <div className="mt-3">
        <FormStatus state={state ? { ok: state.ok, message: state.message } : null} />
        {approved?.ok && approved.pageId && (
          <p className="mt-2">
            <Link href={`/studio/nettsted/${siteId}/side/${approved.pageId}`} className={ui.link}>
              Se siden og publiser
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}

/** «Lag nye forslag nå». Kan ta opptil et par minutter, så knappen sier fra mens den venter. */
export function RunNowButton({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState(runNowAction.bind(null, siteId), null);
  return (
    <form action={action} className="space-y-2">
      <button disabled={pending} className={ui.buttonGhost}>
        {pending ? "AI-teamet jobber, det kan ta et par minutter..." : "Lag nye forslag nå"}
      </button>
      <div>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
