# Egen timebestilling

Timebestilling bygget inn i plattformen, portet fra Bestilly og utvidet med ansatte. Bedriften setter den opp
under fanen **Booking** i studioet og legger seksjonen «Timebestilling» med utseendet «Egen booking» på en side.
Utseendet vises i seksjonsbiblioteket først når nettstedet har minst én aktiv tjeneste.

## Slik virker det for kunden

1. Velg tjeneste.
2. Velg ansatt, eller «Første ledige» når flere tar tjenesten.
3. Velg dato. Bare datoer med ledige tider vises.
4. Velg tid.
5. Navn og e-post (påkrevd), telefon og melding (valgfritt).
6. Se over og bekreft.

Kunden får bekreftelse på e-post med lenke for å avbestille. Bedriften får varsel (kan slås av under Booking).
Lenken åpner en side med knappen «Avbestill timen». Å åpne lenken endrer ingenting, fordi e-postprogrammer og
virusfiltre åpner lenker av seg selv. Etter fristen (standard 24 timer før timen) må kunden ta kontakt.

Skjemaet har honningkrukke og grenser per IP og per nettsted (`lib/rate-limit.ts`), som kontaktskjemaet.
Fokus flyttes til overskriften i hvert nytt steg, og antall ledige tider leses opp (aria-live).

## Regler for ledige tider

Alt regnes ut på serveren i norsk tid (`lib/egen-booking/availability.ts`), med riktig sommertid.

- Hver ansatt har en ukerytme (én periode per ukedag i studioet, flere støttes i koden).
- Stengt for hele bedriften eller for den ansatte: ingen tider.
- Egne tider for den ansatte erstatter ukerytmen den dagen.
- Norske helligdager er stengt, med mindre bedriften eller den ansatte har «Åpent som vanlig» eller «Egne tider».
- Egne tider for hele bedriften begrenser alle ansatte til de tidene.
- En time må slutte innen arbeidstiden. Bufferen etter timen kan gå forbi.
- Minimum varsel (standard 2 timer) og dager fram i tid (standard 60) settes under Innstillinger.
- Klokkeslett som ikke finnes natten sommertiden begynner, tilbys ikke.

## Dobbeltbooking

Hver bekreftet time holder av fem-minutters ruter hos den ansatte i tabellen `booking_slots`, fra start til
slutt pluss buffer. Den unike indeksen `booking_slots_staff_time_idx` på ansatt og tidspunkt gjør det umulig å
lagre to timer som overlapper. Bookingen og rutene lagres i én SQL-setning (`insertBooking` i
`lib/egen-booking/store.ts`), så enten lagres begge, eller ingen. Det virker likt med Neon over HTTP, som ikke har
transaksjoner over flere setninger, og med PGlite i testene. Derfor må varighet, buffer og arbeidstider gå opp i
hele fem minutter.

Ved «første ledige» prøves de ansatte i rekkefølgen fra studioet til én er ledig.

## Tilgang

Alle med tilgang til nettstedet ser fanen. Bare eier og redaktør kan endre tjenester, ansatte, tider,
innstillinger og avbestille. Sjekken ligger i `lib/egen-booking` (`assertCanEditBooking`), ikke bare i skjemaet.

## Personvern og sletting

- Personvernerklæringen får avsnittet «Når du bestiller time» når en publisert side har «Egen booking», eller når
  nettstedet har lagrede bookinger. Grunnlaget er avtalen (artikkel 6 nr. 1 bokstav b).
- Bookinger slettes tolv måneder etter timen, hver natt etter sikkerhetskopien (`runRetention` i
  `lib/retention.ts`, kalt fra `/api/cron/sikkerhetskopi`).
- Bare en hash av avbestillingsnøkkelen lagres.
- Tjeneste, ansatt og pris lagres også som tekst på bookingen, så historikken står om noe slettes.

## Filer

| Fil | Hva |
|---|---|
| `db/schema.ts`, `drizzle/0013_egen_booking.sql` | Tabellene `booking_services`, `booking_staff`, `booking_staff_services`, `booking_hours`, `booking_exceptions`, `bookings`, `booking_slots`, og `sites.booking`, `email_log.booking_id` |
| `lib/egen-booking/availability.ts` | Ledige tider, ren kode |
| `lib/egen-booking/holidays.ts` | Norske helligdager (fra Bestilly) |
| `lib/egen-booking/store.ts` | Ledige tider fra databasen, bestilling, avbestilling, tilgang |
| `lib/egen-booking/admin.ts` | Det bedriften endrer i studioet |
| `lib/egen-booking/notify.ts` | E-postene, malene ligger i `lib/email/templates.ts` |
| `lib/egen-booking/settings.ts` | Innstillingene i `sites.booking` |
| `app/actions/booking.ts` | Offentlige serverhandlinger |
| `components/sections/own-booking.tsx` | Bestillingen på nettstedet |
| `components/site/booking-cancel.tsx` | Siden `/timebestilling/avbestill` |
| `app/studio/nettsted/[siteId]/booking/` | Fanen i studioet |
| `tests/booking-egen.test.ts` | Testene |

## Ikke med ennå

- Påminnelse på e-post eller SMS før timen.
- Forskuddsbetaling eller depositum med Vipps. Kommer det, må betalingen lagres for seg etter bokføringsloven,
  og slettingen etter tolv måneder må justeres.
- Endre eller flytte en time (kunden avbestiller og bestiller på nytt).
- Kalenderfil (.ics) i bekreftelsen, og synk med Google Kalender.
- Flere lokasjoner.
