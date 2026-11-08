import type { Metadata } from "next";
import Link from "next/link";
import { heading } from "@/components/brand";
import { ui } from "@/components/studio/ui";
import { PageIntro } from "@/components/studio/help";
import { getDb } from "@/db";
import { listBookings, loadStudioBooking } from "@/lib/egen-booking/admin";
import { isoWeekday, minuteLabel } from "@/lib/egen-booking/availability";
import { formatClock, formatDateLabel } from "@/lib/egen-booking/format";
import { readBookingSettings } from "@/lib/egen-booking/settings";
import { canEditBooking } from "@/lib/egen-booking/store";
import { addDays, osloDate, parseOsloDate } from "@/lib/oslo-time";
import { requireSiteAccess } from "@/lib/session";
import { formatNok } from "@/lib/shop/money";
import { SiteNav } from "../site-nav";
import { CancelBookingButton, DeleteButton, ExceptionForm, ServiceForm, SettingsForm, StaffForm, type StaffView } from "./booking-forms";

export const metadata: Metadata = { title: "Booking" };

const kindLabels = { stengt: "Stengt", egne_tider: "Egne tider", apen: "Åpent som vanlig" } as const;

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ visning?: string; dato?: string }>;
}) {
  const { siteId } = await params;
  const query = await searchParams;
  const { site, role } = await requireSiteAccess(siteId);
  const canEdit = canEditBooking(role);
  const db = await getDb();
  const today = osloDate(new Date());

  // Oversikten: én dag eller én uke (mandag til søndag), i norsk tid.
  const week = query.visning !== "dag";
  const picked = query.dato && parseOsloDate(query.dato) ? query.dato : today;
  const start = week ? addDays(picked, 1 - isoWeekday(picked)) : picked;
  const days = week ? 7 : 1;
  const end = addDays(start, days);
  const [data, rows] = await Promise.all([loadStudioBooking(db, site.id, today), listBookings(db, site.id, parseOsloDate(start)!, parseOsloDate(end)!)]);
  const settings = readBookingSettings(site.booking);
  const base = `/studio/nettsted/${site.id}/booking`;
  const link = (dato: string, visning = week ? "uke" : "dag") => `${base}?visning=${visning}&dato=${dato}#oversikt`;
  const staffName = new Map(data.staff.map((s) => [s.id, s.name]));
  const byDay = Array.from({ length: days }, (_, i) => addDays(start, i)).map((date) => ({
    date,
    rows: rows.filter((r) => osloDate(r.startsAt) === date),
  }));
  const now = new Date();

  const staffViews: StaffView[] = data.staff.map((s) => {
    const hours: StaffView["hours"] = {};
    for (let d = 1; d <= 7; d++) {
      const h = data.hours.find((x) => x.staffId === s.id && x.weekday === d);
      hours[d] = h ? { from: minuteLabel(h.startMinute), to: minuteLabel(h.endMinute) } : null;
    }
    return { id: s.id, name: s.name, title: s.title, active: s.active, sortOrder: s.sortOrder, serviceIds: data.links.filter((l) => l.staffId === s.id).map((l) => l.serviceId), hours };
  });
  const serviceOptions = data.services.map((s) => ({ id: s.id, name: s.name }));
  const ready = data.services.some((s) => s.active) && staffViews.some((s) => s.active && s.serviceIds.length > 0);

  const h2 = `${heading} mb-4 text-2xl`;
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <SiteNav siteId={site.id} name={site.name} shop={site.kind === "nettbutikk"} active="booking" />
      <PageIntro article="booking">Kundene bestiller time selv på nettstedet. Tjenestene, de ansatte og arbeidstidene bestemmer hvilke tider som er ledige.</PageIntro>

      {!canEdit && <p className={`${ui.success} mb-6`}>Du kan se timebestillingen, men bare eier og redaktør kan endre den.</p>}
      {!ready && (
        <div className={`${ui.card} mb-10 p-5`}>
          <h2 className="mb-2 font-semibold">Slik kommer du i gang</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Legg til tjenestene kundene kan bestille, med varighet og pris.</li>
            <li>Legg til de ansatte (eller deg selv), hvilke tjenester de tar og når de jobber.</li>
            <li>
              Legg seksjonen «Timebestilling» med utseendet «Egen booking» på en side under{" "}
              <Link className={ui.link} href={`/studio/nettsted/${site.id}/sider`}>
                Sider
              </Link>
              , og publiser.
            </li>
          </ol>
        </div>
      )}

      <section id="oversikt" aria-labelledby="oversikt-tittel" className="mb-12 scroll-mt-6">
        <h2 id="oversikt-tittel" className={h2}>
          Timer
        </h2>
        <nav aria-label="Velg periode" className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link className={ui.link} href={link(addDays(start, -days))}>
            {week ? "Forrige uke" : "Forrige dag"}
          </Link>
          <Link className={ui.link} href={link(today)}>
            {week ? "Denne uken" : "I dag"}
          </Link>
          <Link className={ui.link} href={link(addDays(start, days))}>
            {week ? "Neste uke" : "Neste dag"}
          </Link>
          <span aria-hidden="true">|</span>
          <Link className={ui.link} href={link(picked, "dag")} aria-current={!week ? "page" : undefined}>
            Dag
          </Link>
          <Link className={ui.link} href={link(picked, "uke")} aria-current={week ? "page" : undefined}>
            Uke
          </Link>
        </nav>
        <p className={`mb-4 ${ui.muted}`}>
          {week ? `Uken ${formatDateLabel(start)} til ${formatDateLabel(addDays(end, -1))}` : <span className="first-letter:uppercase">{formatDateLabel(start)}</span>}
        </p>
        <div className="space-y-6">
          {byDay
            .filter((d) => !week || d.rows.length > 0)
            .map((d) => (
              <div key={d.date}>
                {week && <h3 className="mb-2 font-semibold first-letter:uppercase">{formatDateLabel(d.date)}</h3>}
                {d.rows.length === 0 ? (
                  <p className={ui.muted}>Ingen timer denne dagen.</p>
                ) : (
                  <ul className="space-y-3">
                    {d.rows.map((b) => (
                      <li key={b.id} className={`${ui.card} p-4 ${b.status === "avbestilt" ? "opacity-70" : ""}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-semibold">
                            {formatClock(b.startsAt)} til {formatClock(b.endsAt)}: {b.serviceName}
                          </p>
                          <p className="text-sm">{b.status === "avbestilt" ? `Avbestilt av ${b.cancelledBy === "kunde" ? "kunden" : "dere"}` : (staffName.get(b.staffId ?? "") ?? b.staffName)}</p>
                        </div>
                        <p className="mt-1">
                          {b.customerName}
                          {" · "}
                          <a className={ui.link} href={`mailto:${b.customerEmail}`}>
                            {b.customerEmail}
                          </a>
                          {b.customerPhone && (
                            <>
                              {" · "}
                              <a className={ui.link} href={`tel:${b.customerPhone.replace(/\s/g, "")}`}>
                                {b.customerPhone}
                              </a>
                            </>
                          )}
                        </p>
                        {b.message && <p className="mt-2 whitespace-pre-line text-sm">{b.message}</p>}
                        {canEdit && b.status === "bekreftet" && b.startsAt > now && (
                          <div className="mt-3">
                            <CancelBookingButton siteId={site.id} bookingId={b.id} customer={b.customerName} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          {week && rows.length === 0 && <p className={ui.muted}>Ingen timer denne uken.</p>}
        </div>
      </section>

      <section aria-labelledby="tjenester-tittel" className="mb-12">
        <h2 id="tjenester-tittel" className={h2}>
          Tjenester
        </h2>
        <ul className="mb-6 space-y-3">
          {data.services.map((s) => (
            <li key={s.id} className={`${ui.card} p-4`}>
              <details>
                <summary className="cursor-pointer">
                  <span className="font-semibold">{s.name}</span>
                  <span className={`ml-2 text-sm ${ui.muted}`}>
                    {s.durationMinutes} min{s.priceOre !== null ? `, ${formatNok(s.priceOre)}` : ""}
                    {s.active ? "" : ", skjult"}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <ServiceForm
                    siteId={site.id}
                    canEdit={canEdit}
                    service={{
                      id: s.id,
                      name: s.name,
                      description: s.description,
                      durationMinutes: s.durationMinutes,
                      bufferMinutes: s.bufferMinutes,
                      price: s.priceOre === null ? "" : String(s.priceOre / 100).replace(".", ","),
                      active: s.active,
                      sortOrder: s.sortOrder,
                    }}
                  />
                  {canEdit && <DeleteButton siteId={site.id} kind="service" id={s.id} label="Slett tjenesten" />}
                </div>
              </details>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className={`${ui.card} p-5`}>
            <h3 className="mb-4 font-semibold">Ny tjeneste</h3>
            <ServiceForm siteId={site.id} service={null} canEdit={canEdit} />
          </div>
        )}
      </section>

      <section aria-labelledby="ansatte-tittel" className="mb-12">
        <h2 id="ansatte-tittel" className={h2}>
          Ansatte og arbeidstider
        </h2>
        <ul className="mb-6 space-y-3">
          {staffViews.map((s) => (
            <li key={s.id} className={`${ui.card} p-4`}>
              <details>
                <summary className="cursor-pointer">
                  <span className="font-semibold">{s.name}</span>
                  <span className={`ml-2 text-sm ${ui.muted}`}>
                    {s.title}
                    {s.active ? "" : `${s.title ? ", " : ""}kan ikke bestilles`}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <StaffForm siteId={site.id} staff={s} services={serviceOptions} canEdit={canEdit} />
                  {canEdit && <DeleteButton siteId={site.id} kind="staff" id={s.id} label="Slett den ansatte" />}
                </div>
              </details>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className={`${ui.card} p-5`}>
            <h3 className="mb-4 font-semibold">Ny ansatt</h3>
            <StaffForm siteId={site.id} staff={null} services={serviceOptions} canEdit={canEdit} />
          </div>
        )}
      </section>

      <section aria-labelledby="unntak-tittel" className="mb-12">
        <h2 id="unntak-tittel" className={h2}>
          Unntak og ferie
        </h2>
        <p className={`mb-4 ${ui.muted}`}>Norske helligdager er stengt automatisk. Velg «Åpent som vanlig» for å åpne en helligdag.</p>
        {data.exceptions.length > 0 && (
          <ul className="mb-6 space-y-3">
            {data.exceptions.map((e) => (
              <li key={e.id} className={`${ui.card} flex flex-wrap items-start justify-between gap-3 p-4`}>
                <div>
                  <p className="font-semibold">
                    {kindLabels[e.kind]}
                    {e.kind === "egne_tider" && e.startMinute !== null && e.endMinute !== null ? ` ${minuteLabel(e.startMinute)} til ${minuteLabel(e.endMinute)}` : ""}
                    {", "}
                    {e.staffId ? (staffName.get(e.staffId) ?? "ansatt") : "hele bedriften"}
                  </p>
                  <p className="text-sm">
                    {e.startDate === e.endDate ? formatDateLabel(e.startDate) : `${formatDateLabel(e.startDate)} til ${formatDateLabel(e.endDate)}`}
                    {e.note ? `. ${e.note}` : ""}
                  </p>
                </div>
                {canEdit && <DeleteButton siteId={site.id} kind="exception" id={e.id} label="Slett" />}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className={`${ui.card} p-5`}>
            <h3 className="mb-4 font-semibold">Nytt unntak</h3>
            <ExceptionForm siteId={site.id} staff={data.staff.map((s) => ({ id: s.id, name: s.name }))} canEdit={canEdit} />
          </div>
        )}
      </section>

      <section aria-labelledby="innstillinger-tittel">
        <h2 id="innstillinger-tittel" className={h2}>
          Innstillinger
        </h2>
        <div className={`${ui.card} p-5`}>
          <SettingsForm siteId={site.id} settings={settings} canEdit={canEdit} />
        </div>
        <p className={`mt-6 text-sm ${ui.muted}`}>
          Bookinger er personopplysninger. De slettes automatisk tolv måneder etter timen. Personvernerklæringen på nettstedet forteller kundene om det.
        </p>
      </section>
    </main>
  );
}
