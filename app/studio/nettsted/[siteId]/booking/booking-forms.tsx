"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/app/studio/actions";
import { ui } from "@/components/studio/ui";
import { STEP_CHOICES, type BookingSettings } from "@/lib/egen-booking/settings";
import {
  addExceptionAction,
  cancelBookingStudioAction,
  deleteExceptionAction,
  deleteServiceAction,
  deleteStaffAction,
  saveServiceAction,
  saveSettingsAction,
  saveStaffAction,
} from "./actions";

const input = "w-full rounded-lg border border-[#8a96a1] bg-white px-3 py-2";
const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];

/** Svar fra serveren. Leses opp, og en feil får fokus. */
function Status({ state }: { state: ActionState }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state && !state.ok) ref.current?.focus();
  }, [state]);
  if (!state) return <p className="sr-only" role="status" />;
  return (
    <p ref={ref} tabIndex={-1} role={state.ok ? "status" : "alert"} className={`${state.ok ? ui.success : ui.error} outline-none`}>
      {state.message}
    </p>
  );
}

function Submit({ pending, children, disabled }: { pending: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button className={ui.button} disabled={pending || disabled}>
      {pending ? "Lagrer..." : children}
    </button>
  );
}

export function SettingsForm({ siteId, settings, canEdit }: { siteId: string; settings: BookingSettings; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveSettingsAction.bind(null, siteId), null);
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={ui.label}>Minimum varsel (timer)</span>
          <input name="noticeHours" type="number" min={0} max={168} defaultValue={settings.noticeHours} className={input} aria-describedby="varsel-hjelp" />
          <span id="varsel-hjelp" className={`mt-1 block text-sm ${ui.muted}`}>
            Hvor lenge før timen den senest kan bestilles.
          </span>
        </label>
        <label className="block">
          <span className={ui.label}>Dager fram i tid</span>
          <input name="maxDaysAhead" type="number" min={1} max={365} defaultValue={settings.maxDaysAhead} className={input} />
        </label>
        <label className="block">
          <span className={ui.label}>Frist for å avbestille (timer før)</span>
          <input name="cancelHours" type="number" min={0} max={168} defaultValue={settings.cancelHours} className={input} aria-describedby="frist-hjelp" />
          <span id="frist-hjelp" className={`mt-1 block text-sm ${ui.muted}`}>
            Etter fristen må kunden ta kontakt med dere. Dere kan alltid avbestille selv.
          </span>
        </label>
        <label className="block">
          <span className={ui.label}>Tider å velge mellom</span>
          <select name="stepMinutes" defaultValue={settings.stepMinutes} className={input}>
            {STEP_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 60 ? "Hver hele time" : `Hvert ${m}. minutt`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" name="notifyBusiness" defaultChecked={settings.notifyBusiness} className="h-5 w-5" />
          <span>Send meg e-post når noen bestiller eller avbestiller</span>
        </label>
      </fieldset>
      {canEdit && <Submit pending={pending}>Lagre innstillingene</Submit>}
      <Status state={state} />
    </form>
  );
}

export type ServiceView = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: string;
  active: boolean;
  sortOrder: number;
};

export function ServiceForm({ siteId, service, canEdit }: { siteId: string; service: ServiceView | null; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveServiceAction.bind(null, siteId, service?.id ?? null), null);
  const id = service?.id ?? "ny";
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={ui.label}>Navn</span>
          <input name="name" required maxLength={80} defaultValue={service?.name} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className={ui.label}>Kort beskrivelse (valgfritt)</span>
          <input name="description" maxLength={300} defaultValue={service?.description} className={input} />
        </label>
        <label className="block">
          <span className={ui.label}>Varighet (minutter)</span>
          <input name="durationMinutes" type="number" min={5} max={600} step={5} required defaultValue={service?.durationMinutes ?? 30} className={input} />
        </label>
        <label className="block">
          <span className={ui.label}>Pris i kroner (valgfritt)</span>
          <input name="price" inputMode="decimal" defaultValue={service?.price} className={input} />
        </label>
        <label className="block">
          <span className={ui.label}>Buffer etter timen (minutter)</span>
          <input name="bufferMinutes" type="number" min={0} max={120} step={5} defaultValue={service?.bufferMinutes ?? 0} className={input} aria-describedby={`buffer-${id}`} />
          <span id={`buffer-${id}`} className={`mt-1 block text-sm ${ui.muted}`}>
            Tid til rydding før neste kunde. Kunden ser den ikke.
          </span>
        </label>
        <label className="block">
          <span className={ui.label}>Rekkefølge</span>
          <input name="sortOrder" type="number" min={0} max={999} defaultValue={service?.sortOrder ?? 0} className={input} />
        </label>
        <label className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="h-5 w-5" />
          <span>Kan bestilles på nettstedet</span>
        </label>
      </fieldset>
      {canEdit && <Submit pending={pending}>{service ? "Lagre tjenesten" : "Legg til tjenesten"}</Submit>}
      <Status state={state} />
    </form>
  );
}

export type StaffView = {
  id: string;
  name: string;
  title: string;
  active: boolean;
  sortOrder: number;
  serviceIds: string[];
  /** Per ukedag 1 til 7: fra og til som «09:00», eller null når den ansatte ikke jobber. */
  hours: Record<number, { from: string; to: string } | null>;
};

export function StaffForm({
  siteId,
  staff,
  services,
  canEdit,
}: {
  siteId: string;
  staff: StaffView | null;
  services: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveStaffAction.bind(null, siteId, staff?.id ?? null), null);
  const id = staff?.id ?? "ny";
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={ui.label}>Navn</span>
            <input name="name" required maxLength={80} defaultValue={staff?.name} className={input} />
          </label>
          <label className="block">
            <span className={ui.label}>Tittel (valgfritt)</span>
            <input name="title" maxLength={80} defaultValue={staff?.title} className={input} />
          </label>
          <label className="block">
            <span className={ui.label}>Rekkefølge</span>
            <input name="sortOrder" type="number" min={0} max={999} defaultValue={staff?.sortOrder ?? 0} className={input} aria-describedby={`rekkefolge-${id}`} />
            <span id={`rekkefolge-${id}`} className={`mt-1 block text-sm ${ui.muted}`}>
              Ved «første ledige» får den med lavest tall timen først.
            </span>
          </label>
          <label className="flex items-center gap-3 self-center">
            <input type="checkbox" name="active" defaultChecked={staff?.active ?? true} className="h-5 w-5" />
            <span>Kan bestilles</span>
          </label>
        </div>

        <fieldset>
          <legend className={ui.label}>Tjenester</legend>
          {services.length === 0 ? (
            <p className={`text-sm ${ui.muted}`}>Legg til tjenester først.</p>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" name="services" value={s.id} defaultChecked={staff ? staff.serviceIds.includes(s.id) : true} className="h-5 w-5" />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className={ui.label}>Arbeidstider</legend>
          <div className="space-y-2">
            {WEEKDAYS.map((day, i) => {
              const weekday = i + 1;
              const current = staff ? staff.hours[weekday] : weekday <= 5 ? { from: "09:00", to: "16:00" } : null;
              return (
                <div key={day} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name={`dag-${weekday}`} defaultChecked={current !== null} className="h-5 w-5" />
                    <span>{day}</span>
                  </label>
                  <label className="block">
                    <span className="sr-only">{day} fra</span>
                    <input name={`fra-${weekday}`} type="time" step={300} defaultValue={current?.from ?? "09:00"} className={input} />
                  </label>
                  <label className="block">
                    <span className="sr-only">{day} til</span>
                    <input name={`til-${weekday}`} type="time" step={300} defaultValue={current?.to ?? "16:00"} className={input} />
                  </label>
                </div>
              );
            })}
          </div>
          <p className={`mt-2 text-sm ${ui.muted}`}>Norske helligdager er stengt automatisk. Åpne en helligdag under Unntak og ferie.</p>
        </fieldset>
      </fieldset>
      {canEdit && <Submit pending={pending}>{staff ? "Lagre" : "Legg til den ansatte"}</Submit>}
      <Status state={state} />
    </form>
  );
}

export function ExceptionForm({ siteId, staff, canEdit }: { siteId: string; staff: { id: string; name: string }[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(addExceptionAction.bind(null, siteId), null);
  const [kind, setKind] = useState("stengt");
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={ui.label}>Gjelder</span>
          <select name="staffId" className={input} defaultValue="">
            <option value="">Hele bedriften</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ui.label}>Hva</span>
          <select name="kind" className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="stengt">Stengt eller ferie</option>
            <option value="egne_tider">Egne tider</option>
            <option value="apen">Åpent som vanlig (for eksempel på en helligdag)</option>
          </select>
        </label>
        <label className="block">
          <span className={ui.label}>Fra dato</span>
          <input name="startDate" type="date" required className={input} />
        </label>
        <label className="block">
          <span className={ui.label}>Til og med dato (valgfritt)</span>
          <input name="endDate" type="date" className={input} />
        </label>
        {kind === "egne_tider" && (
          <>
            <label className="block">
              <span className={ui.label}>Fra klokken</span>
              <input name="startTime" type="time" step={300} required defaultValue="10:00" className={input} />
            </label>
            <label className="block">
              <span className={ui.label}>Til klokken</span>
              <input name="endTime" type="time" step={300} required defaultValue="14:00" className={input} />
            </label>
          </>
        )}
        <label className="block sm:col-span-2">
          <span className={ui.label}>Notat (valgfritt, bare for dere)</span>
          <input name="note" maxLength={120} className={input} />
        </label>
      </fieldset>
      {canEdit && <Submit pending={pending}>Legg til unntaket</Submit>}
      <Status state={state} />
    </form>
  );
}

type DeleteKind = "service" | "staff" | "exception";
const deleteActions = { service: deleteServiceAction, staff: deleteStaffAction, exception: deleteExceptionAction } as const;

/** Sletting krever et ekstra trykk, så ingenting forsvinner ved et feiltrykk. */
export function DeleteButton({ siteId, kind, id, label }: { siteId: string; kind: DeleteKind; id: string; label: string }) {
  const [state, action, pending] = useActionState(async () => deleteActions[kind](siteId, id), null);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-[#7a2a20] underline underline-offset-4">{label}</summary>
      <form action={action} className="mt-2">
        <button className="rounded-lg border-2 border-[#a13a2c] px-3 py-1.5 font-semibold text-[#7a2a20]" disabled={pending}>
          {pending ? "Sletter..." : "Ja, slett"}
        </button>
      </form>
      <Status state={state} />
    </details>
  );
}

export function CancelBookingButton({ siteId, bookingId, customer }: { siteId: string; bookingId: string; customer: string }) {
  const [state, action, pending] = useActionState(async () => cancelBookingStudioAction(siteId, bookingId), null);
  if (state?.ok) return <Status state={state} />;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-[#7a2a20] underline underline-offset-4">Avbestill</summary>
      <form action={action} className="mt-2 space-y-2">
        <p>{customer} får beskjed på e-post om at timen er avbestilt.</p>
        <button className="rounded-lg border-2 border-[#a13a2c] px-3 py-1.5 font-semibold text-[#7a2a20]" disabled={pending}>
          {pending ? "Avbestiller..." : "Ja, avbestill timen"}
        </button>
      </form>
      <Status state={state} />
    </details>
  );
}
