import type { Db } from "@/db";
import { Container, Heading } from "@/components/sections";
import { subscriberForUnsubscribe } from "@/lib/nyhetsbrev/subscribers";
import { NewsletterLinkForm } from "./newsletter-link-form";

/*
 * Sidene lenkene i e-postene går til. Å åpne en lenke endrer ingenting: e-postprogrammer og virusfiltre åpner
 * lenker av seg selv, og da skulle ingen bli påmeldt eller avmeldt uten å vite det. Det skjer når personen trykker.
 * Ett-klikks avmelding fra selve e-postprogrammet går til /api/nyhetsbrev/avmeld.
 */

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <div className="mx-auto max-w-xl">
          <Heading level={1} first>
            {title}
          </Heading>
          {children}
        </div>
      </Container>
    </section>
  );
}

export function NewsletterConfirmPage({ siteId, siteName, token }: { siteId: string; siteName: string; token: string }) {
  return (
    <Shell title="Bekreft påmeldingen">
      {token ? (
        <>
          <p className="mb-6">Trykk på knappen for å bekrefte at du vil ha nyhetsbrevet fra {siteName} på e-post.</p>
          <NewsletterLinkForm kind="bekreft" siteId={siteId} token={token} label="Bekreft påmeldingen" pendingLabel="Bekrefter..." />
        </>
      ) : (
        <p>Fant ikke påmeldingen. Sjekk at du brukte hele lenken fra e-posten.</p>
      )}
    </Shell>
  );
}

export async function NewsletterUnsubscribePage({ db, siteId, siteName, token }: { db: Db; siteId: string; siteName: string; token: string }) {
  const subscriber = token ? await subscriberForUnsubscribe(db, siteId, token) : null;
  let body: React.ReactNode;
  if (!subscriber) body = <p>Fant ikke påmeldingen. Sjekk at du brukte hele lenken fra nyhetsbrevet.</p>;
  else if (subscriber.status === "avmeldt") body = <p>{subscriber.email} er allerede meldt av, og får ikke nyhetsbrev fra {siteName}.</p>;
  else
    body = (
      <>
        <p className="mb-6">
          Vil du ikke lenger ha nyhetsbrevet fra {siteName} til {subscriber.email}?
        </p>
        <NewsletterLinkForm kind="avmeld" siteId={siteId} token={token} label="Meld meg av" pendingLabel="Melder av..." />
      </>
    );
  return <Shell title="Meld deg av nyhetsbrevet">{body}</Shell>;
}
