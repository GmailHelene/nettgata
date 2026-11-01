"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { bookAction, bookingDatesAction, bookingTimesAction, type BookState } from "@/app/actions/booking";
import type { FreeTime, PublicBookingSetup } from "@/lib/egen-booking/store";
import { formatDateLabel } from "@/lib/egen-booking/format";
import { formatNok } from "@/lib/shop/money";

/**
 * Egen timebestilling på kundens nettsted. Gangen er tjeneste, ansatt eller første ledige, dato, tid, kontaktinfo
 * og bekreftelse. Ledige tider hentes fra serveren for hvert steg, og fokus flyttes til overskriften i nytt steg,
 * så tastatur og skjermleser følger med.
 */

const STEPS = ["Tjeneste", "Hvem", "Dato", "Tid", "Kontaktinfo", "Bekreft"] as const;
const DATES_PER_PAGE = 14;
const ANY = "";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2 text-[var(--c-text)] focus-visible:outline-2 focus-visible:outline-[var(--c-primary)]";
const optionClass =
  "flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] p-3 has-[:checked]:border-[var(--c-primary)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--c-primary)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--c-text)]";
const chipClass =
  "flex cursor-pointer items-center justify-center rounded-[var(--radius)] border border-[var(--c-muted)] bg-[var(--c-bg)] px-3 py-2 text-center has-[:checked]:border-[var(--c-primary)] has-[:checked]:bg-[var(--c-primary)] has-[:checked]:text-[var(--c-on-primary)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--c-text)]";
const backClass = "underline underline-offset-4";

export function OwnBooking({ siteId, setup, preview }: { siteId: string; setup: PublicBookingSetup; preview: boolean }) {
  const uid = useId();
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(setup.services.length === 1 ? setup.services[0].id : "");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[] | null>(null);
  const [shownDates, setShownDates] = useState(DATES_PER_PAGE);
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<FreeTime[] | null>(null);
  const [time, setTime] = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "", message: "" });
  const [problem, setProblem] = useState<{ text: string; field?: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [loading, startLoading] = useTransition();
  // Svar fra serveren: feil i et felt sender kunden tilbake til kontaktinfo, en tatt tid tilbake til tidene.
  const [state, formAction, pending] = useActionState(async (prev: BookState, formData: FormData) => {
    const res = await bookAction(siteId, prev, formData);
    if (res && !res.ok) {
      setProblem({ text: res.message, field: res.field });
      if (res.field) {
        go(4);
      } else if (res.taken) {
        setTime("");
        loadTimes(String(formData.get("date") ?? ""));
        go(3);
      }
    }
    return res;
  }, null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const moved = useRef(false);
  const problemRef = useRef<HTMLParagraphElement>(null);

  const service = setup.services.find((s) => s.id === serviceId) ?? null;
  const staffForService = setup.staff.filter((s) => s.serviceIds.includes(serviceId));
  const staff = staffId ? setup.staff.find((s) => s.id === staffId) ?? null : null;

  // Fokus til overskriften når steget byttes, men ikke når siden lastes.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!problem) return;
    const field = problem.field ? formRef.current?.querySelector<HTMLElement>(`[name="${problem.field}"]`) : null;
    if (field) field.focus();
    else if (!moved.current) problemRef.current?.focus();
  }, [problem]);

  function go(next: number) {
    moved.current = true;
    setStep(next);
  }

  function loadDates(nextStaff: string | null) {
    setDates(null);
    setDate("");
    setTimes(null);
    setTime("");
    setShownDates(DATES_PER_PAGE);
    setAnnounce("Henter ledige datoer.");
    startLoading(async () => {
      const res = await bookingDatesAction(siteId, serviceId, nextStaff);
      if (!res.ok) {
        setProblem({ text: res.message });
        setDates([]);
        return;
      }
      setDates(res.dates);
      setAnnounce(res.dates.length ? `${res.dates.length} datoer med ledige tider.` : "Ingen ledige datoer.");
    });
  }

  function loadTimes(forDate: string) {
    setTimes(null);
    setAnnounce("Henter ledige tider.");
    startLoading(async () => {
      const res = await bookingTimesAction(siteId, serviceId, staffId, forDate);
      if (!res.ok) {
        setProblem({ text: res.message });
        setTimes([]);
        return;
      }
      setTimes(res.times);
      setAnnounce(
        res.times.length
          ? `${res.times.length} ledige ${res.times.length === 1 ? "tid" : "tider"} ${formatDateLabel(forDate)}.`
          : `Ingen ledige tider ${formatDateLabel(forDate)}.`,
      );
    });
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (step === 0) {
      if (!service) return setProblem({ text: "Velg hva du vil bestille." });
      const only = staffForService.length === 1 ? staffForService[0].id : null;
      setStaffId(only);
      return go(1);
    }
    if (step === 1) {
      loadDates(staffId);
      return go(2);
    }
    if (step === 2) {
      if (!date) return setProblem({ text: "Velg en dato." });
      setTime("");
      loadTimes(date);
      return go(3);
    }
    if (step === 3) {
      if (!time) return setProblem({ text: "Velg et klokkeslett." });
      return go(4);
    }
    if (step === 4) {
      if (!contact.name.trim()) return setProblem({ text: "Skriv navnet ditt.", field: "name" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return setProblem({ text: "Sjekk e-postadressen, så bekreftelsen kommer fram.", field: "email" });
      return go(5);
    }
  }

  if (state?.ok) {
    return (
      <div role="status" className="rounded-[var(--radius)] bg-[var(--c-surface)] p-6 text-left">
        <p className="font-semibold">{state.message}</p>
        {service && (
          <p className="mt-2">
            {service.name}
            {staff ? ` hos ${staff.name}` : ""}, {formatDateLabel(date)} kl. {time}.
          </p>
        )}
      </div>
    );
  }

  if (!setup.services.length) {
    return <p className="text-[var(--c-muted)]">Ingen tjenester kan bestilles på nett akkurat nå. Ta gjerne kontakt med oss.</p>;
  }

  const headingId = `${uid}-steg`;
  const invalid = (name: string) => (problem?.field === name ? { "aria-invalid": true as const, "aria-describedby": `${uid}-feil` } : {});
  const visibleDates = dates?.slice(0, shownDates) ?? [];
  const staffLabel = staff ? staff.name : "Første ledige";

  return (
    <div className="mx-auto max-w-2xl text-left">
      <p className="mb-2 text-sm text-[var(--c-muted)]">
        Steg {step + 1} av {STEPS.length}
      </p>
      <form ref={formRef} action={formAction} onSubmit={step < 5 ? next : undefined} noValidate aria-labelledby={headingId} className="space-y-5">
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="ng-h3 text-xl outline-none">
          {["Hva vil du bestille?", "Hvem vil du gå til?", "Velg dato", "Velg tid", "Kontaktinformasjon", "Se over og bekreft"][step]}
        </h3>

        {/* Valgene sendes med når kunden bekrefter. */}
        <input type="hidden" name="serviceId" value={serviceId} />
        <input type="hidden" name="staffId" value={staffId ?? ANY} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="time" value={time} />
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Ikke fyll ut dette feltet
            <input name="nettsted" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {step === 0 && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Tjeneste</legend>
            {setup.services.map((s) => (
              <label key={s.id} className={optionClass}>
                <input type="radio" name="tjeneste" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} className="mt-1" />
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block text-sm text-[var(--c-muted)]">
                    {s.durationMinutes} minutter{s.priceOre !== null ? `, ${formatNok(s.priceOre)}` : ""}
                  </span>
                  {s.description && <span className="mt-1 block text-sm">{s.description}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 1 && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Hvem du vil gå til</legend>
            {staffForService.length > 1 && (
              <label className={optionClass}>
                <input type="radio" name="hvem" checked={staffId === null} onChange={() => setStaffId(null)} className="mt-1" />
                <span>
                  <span className="block font-semibold">Første ledige</span>
                  <span className="block text-sm text-[var(--c-muted)]">Du får den som har ledig tid først.</span>
                </span>
              </label>
            )}
            {staffForService.map((s) => (
              <label key={s.id} className={optionClass}>
                <input type="radio" name="hvem" checked={staffId === s.id} onChange={() => setStaffId(s.id)} className="mt-1" />
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  {s.title && <span className="block text-sm text-[var(--c-muted)]">{s.title}</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 2 && (
          <div aria-busy={loading}>
            {dates === null ? (
              <p>Henter ledige datoer...</p>
            ) : dates.length === 0 ? (
              <p>Ingen ledige tider de neste ukene. Prøv en annen tjeneste eller ta kontakt med oss.</p>
            ) : (
              <fieldset>
                <legend className="sr-only">Dato</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {visibleDates.map((d) => (
                    <label key={d} className={chipClass}>
                      <input type="radio" name="dato" value={d} checked={date === d} onChange={() => setDate(d)} className="sr-only" />
                      <span className="first-letter:uppercase">{formatDateLabel(d)}</span>
                    </label>
                  ))}
                </div>
                {dates.length > shownDates && (
                  <button type="button" className={`${backClass} mt-3`} onClick={() => setShownDates((n) => n + DATES_PER_PAGE)}>
                    Vis flere datoer
                  </button>
                )}
              </fieldset>
            )}
          </div>
        )}

        {step === 3 && (
          <div aria-busy={loading}>
            <p className="mb-3 first-letter:uppercase">{formatDateLabel(date)}</p>
            {times === null ? (
              <p>Henter ledige tider...</p>
            ) : times.length === 0 ? (
              <p>Ingen ledige tider denne dagen lenger. Gå tilbake og velg en annen dato.</p>
            ) : (
              <fieldset>
                <legend className="sr-only">Klokkeslett</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {times.map((t) => (
                    <label key={t.minute} className={chipClass}>
                      <input type="radio" name="klokkeslett" value={t.label} checked={time === t.label} onChange={() => setTime(t.label)} className="sr-only" />
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}

        <div hidden={step !== 4} className="space-y-4">
          <label className="block">
            <span className="mb-1 block font-medium">Navn</span>
            <input name="name" required autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={inputClass} {...invalid("name")} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium">E-post</span>
              <input name="email" type="email" required autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={inputClass} {...invalid("email")} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Telefon (valgfritt)</span>
              <input name="phone" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={inputClass} {...invalid("phone")} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Melding (valgfritt)</span>
            <textarea name="message" rows={3} value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} className={inputClass} {...invalid("message")} />
          </label>
        </div>

        {step === 5 && service && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-[var(--radius)] bg-[var(--c-surface)] p-5">
            <dt className="text-[var(--c-muted)]">Tjeneste</dt>
            <dd>
              {service.name}, {service.durationMinutes} minutter{service.priceOre !== null ? `, ${formatNok(service.priceOre)}` : ""}
            </dd>
            <dt className="text-[var(--c-muted)]">Hos</dt>
            <dd>{staffLabel}</dd>
            <dt className="text-[var(--c-muted)]">Tid</dt>
            <dd className="first-letter:uppercase">
              {formatDateLabel(date)} kl. {time}
            </dd>
            <dt className="text-[var(--c-muted)]">Navn</dt>
            <dd>{contact.name}</dd>
            <dt className="text-[var(--c-muted)]">E-post</dt>
            <dd>{contact.email}</dd>
            {contact.phone && (
              <>
                <dt className="text-[var(--c-muted)]">Telefon</dt>
                <dd>{contact.phone}</dd>
              </>
            )}
          </dl>
        )}

        {/* Tidene og feilene leses opp når de kommer, uten at fokus flyttes. */}
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>
        {problem && (
          <p ref={problemRef} id={`${uid}-feil`} tabIndex={-1} role="alert" className="font-medium outline-none">
            {problem.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {step < 5 ? (
            <button className="ng-btn" disabled={loading || (step === 2 && !dates?.length) || (step === 3 && !times?.length)}>
              Neste
            </button>
          ) : (
            <button className="ng-btn" disabled={pending || preview}>
              {preview ? "Bestilling er av i forhåndsvisning" : pending ? "Bestiller..." : "Bestill timen"}
            </button>
          )}
          {step > 0 && (
            <button
              type="button"
              className={backClass}
              onClick={() => {
                setProblem(null);
                go(step - 1);
              }}
            >
              Tilbake
            </button>
          )}
        </div>
        {step === 5 && <p className="text-sm text-[var(--c-muted)]">Du får en bekreftelse på e-post med lenke for å avbestille.</p>}
      </form>
    </div>
  );
}
