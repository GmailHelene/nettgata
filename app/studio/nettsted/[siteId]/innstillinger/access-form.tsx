"use client";

import { useActionState, useState, useTransition } from "react";
import { FormStatus } from "@/components/studio/form-status";
import { inputClass } from "@/components/studio/info-fields";
import type { ActionState } from "@/app/studio/actions";
import { inviteAction, removeMemberAction, revokeInvitationAction } from "@/app/studio/access-actions";
import { roleHelp, roles, type Role } from "@/lib/invitations";

type Member = { userId: string; email: string; name: string | null; role: Role };
type Pending = { id: string; email: string; role: Role; expiresAt: string };

const dateFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", timeZone: "Europe/Oslo" });

/** Hvem som har tilgang til nettstedet, invitasjoner som venter, og invitasjon av nye. */
export function AccessForm({
  siteId,
  canManage,
  currentUserId,
  members,
  pending,
}: {
  siteId: string;
  canManage: boolean;
  currentUserId: string;
  members: Member[];
  pending: Pending[];
}) {
  const [state, action, inviting] = useActionState(inviteAction.bind(null, siteId), null);
  const [status, setStatus] = useState<ActionState>(null);
  const [busy, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  return (
    <section className="mt-8 space-y-5 rounded-lg border bg-white p-5">
      <div>
        <h2 className="font-semibold">Brukere</h2>
        <p className="text-sm text-neutral-600">De som kan logge inn og jobbe med nettstedet.</p>
      </div>
      <ul className="divide-y rounded-md border">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="font-medium">{m.name || m.email}</span>
              {m.name && <span className="ml-2 text-sm text-neutral-600">{m.email}</span>}
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold">{roles[m.role]}</span>
            </span>
            {canManage && m.userId !== currentUserId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Fjerne tilgangen til ${m.email}?`)) return;
                  startTransition(async () => setStatus(await removeMemberAction(siteId, m.userId)));
                }}
                className="text-sm text-red-800 underline"
              >
                Fjern
              </button>
            )}
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 px-4 py-3">
            <span>
              <span className="font-medium">{p.email}</span>
              <span className="ml-2 text-sm text-neutral-600">
                invitert som {roles[p.role].toLowerCase()}, lenken virker til {dateFormat.format(new Date(p.expiresAt))}
              </span>
            </span>
            {canManage && (
              <button
                type="button"
                disabled={busy}
                onClick={() => startTransition(async () => setStatus(await revokeInvitationAction(siteId, p.id)))}
                className="text-sm underline"
              >
                Trekk tilbake
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormStatus state={status} />

      {canManage ? (
        <form action={action} className="space-y-3">
          <h3 className="text-sm font-semibold">Inviter noen</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">E-post</span>
              <input name="email" type="email" required autoComplete="off" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Rolle</span>
              <select name="role" defaultValue="owner" className={inputClass}>
                {(Object.keys(roles) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {roles[r]}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={inviting} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {inviting ? "Lager invitasjon..." : "Inviter"}
            </button>
          </div>
          <ul className="space-y-0.5 text-xs text-neutral-600">
            {(Object.keys(roles) as Role[]).map((r) => (
              <li key={r}>
                <strong>{roles[r]}:</strong> {roleHelp[r]}
              </li>
            ))}
          </ul>
          <FormStatus state={state} />
          {state?.ok && state.link && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
              <code className="min-w-0 flex-1 break-all text-sm">{state.link}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(state.link!).then(() => setCopied(true));
                }}
                className="rounded-md border border-neutral-900 bg-white px-3 py-1.5 text-sm font-semibold"
              >
                {copied ? "Kopiert" : "Kopier lenken"}
              </button>
            </div>
          )}
        </form>
      ) : (
        <p className="text-sm text-neutral-600">Bare eieren kan invitere nye brukere.</p>
      )}
    </section>
  );
}
