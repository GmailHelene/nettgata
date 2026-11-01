import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sites } from "@/db/schema";
import { Container, Heading } from "@/components/sections";
import { formatBookingTime } from "@/lib/egen-booking/format";
import { readBookingSettings } from "@/lib/egen-booking/settings";
import { cancelDeadline, findByToken } from "@/lib/egen-booking/store";
import { readSiteInfo } from "@/lib/site-info";
import { BookingCancelForm } from "./booking-cancel-form";

/**
 * Siden lenken i bekreftelsen går til. Å åpne lenken endrer ingenting: e-postprogrammer og virusfiltre åpner
 * lenker av seg selv. Timen avbestilles først når kunden trykker på knappen.
 */
export async function BookingCancelPage({ db, siteId, token, now = new Date() }: { db: Db; siteId: string; token: string; now?: Date }) {
  const booking = token ? await findByToken(db, siteId, token) : null;
  const [site] = await db.select({ booking: sites.booking, info: sites.info }).from(sites).where(eq(sites.id, siteId)).limit(1);
  const info = readSiteInfo(site?.info);
  const contact = [info.phone && `ring ${info.phone}`, info.email && `skriv til ${info.email}`].filter(Boolean).join(" eller ");
  const deadline = booking ? cancelDeadline(booking.startsAt, readBookingSettings(site?.booking)) : null;

  let body: React.ReactNode;
  if (!booking) {
    body = <p>Fant ikke timen. Sjekk at du brukte hele lenken fra e-posten.</p>;
  } else if (booking.status === "avbestilt") {
    body = <p>Timen {formatBookingTime(booking.startsAt)} er allerede avbestilt.</p>;
  } else if (booking.startsAt <= now) {
    body = <p>Timen {formatBookingTime(booking.startsAt)} er allerede passert.</p>;
  } else {
    const late = deadline !== null && now > deadline;
    body = (
      <>
        <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-[var(--radius)] bg-[var(--c-surface)] p-5">
          <dt className="text-[var(--c-muted)]">Tjeneste</dt>
          <dd>{booking.serviceName}</dd>
          <dt className="text-[var(--c-muted)]">Hos</dt>
          <dd>{booking.staffName}</dd>
          <dt className="text-[var(--c-muted)]">Tid</dt>
          <dd className="first-letter:uppercase">{formatBookingTime(booking.startsAt)}</dd>
        </dl>
        {late ? (
          <p>
            Fristen for å avbestille på nett var {formatBookingTime(deadline)}. {contact ? `Kan du ikke komme, ${contact}.` : "Kan du ikke komme, ta kontakt med oss."}
          </p>
        ) : (
          <>
            <p className="mb-4">Du kan avbestille fram til {formatBookingTime(deadline!)}.</p>
            <BookingCancelForm siteId={siteId} token={token} label="Avbestill timen" />
          </>
        )}
      </>
    );
  }

  return (
    <section className="py-14 sm:py-20">
      <Container>
        <div className="mx-auto max-w-xl">
          <Heading level={1} first>
            Avbestill time
          </Heading>
          {body}
        </div>
      </Container>
    </section>
  );
}
