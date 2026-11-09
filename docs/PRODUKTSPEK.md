# Produktspesifikasjon: norsk nettside- og nettbutikkplattform

Versjon 1, 31.10.2026. Arbeidsnavn: plattformen (under helene.cloud til eget navn er valgt).
Grunnlag: `reports/Norsk nettsideplattform markedsanalyse 2026.pdf` og Helenes beslutninger 31.10.2026.

Dette dokumentet er taket for hva som bygges. Det som ikke står under MVP, bygges ikke før MVP er levert til betalende kunder.

---

## 1. Hva plattformen er

**Én setning:** Nettsiden og nettbutikken din, laget av en utvikler og ikke av en mal, der du eier alt, alt norsk er løst, og du kan endre priser og åpningstider på 30 sekunder.

**Posisjonering:** Som WordPress, men enklere for den som bare vil ha en side som virker, og mer avansert for den som trenger mer. Uten plugins, uten oppdateringer som knekker siden, uten hacking. Kunden skal føle at de har et utviklerfirma i ryggen, ikke en 1-2-3 AI-bygger.

**Tre lag i samme produkt:**

| Lag | Hvem | Hva de ser |
|---|---|---|
| 1. Enkel | Eieren som vil endre åpningstider, priser, bilder og tekst | Skjemafelt og «Endre denne seksjonen». Kan ikke ødelegge designet |
| 2. Design | Den som vil bygge om sider | Visuell seksjonsredigerer, designretninger, egne sider, menyer |
| 3. Utvikler | Helene, byråpartnere, større kunder | Egne felt og datatyper, kodekomponenter, API, webhooks, egen CSS, Git-eksport |

Nybegynneren ser aldri lag 3. Utvikleren blir aldri stoppet av lag 1.

**AI-prinsipp:** AI gjør grovarbeidet i bakgrunnen (utkast, tekst, bilder, SEO), men resultatet skal ikke se AI-laget ut. Unntaket er AI-teamet (avsnitt 6), som er åpent AI og der ingenting endres før kunden trykker Godkjenn.

---

## 2. Pris (vedtatt 31.10.2026, eks mva)

| Abonnement | Månedlig | Årlig, per mnd |
|---|---|---|
| Nettside | 199 kr | 169 kr |
| Nettbutikk | 399 kr | 339 kr |

Alt inkludert i begge: hosting i EU, SSL, backup, sikkerhet, staging og publisering, SEO, cookiefri statistikk, skjema, blogg, nyhetsbrev, ukentlig AI-rapport, alle bransjepakker. Domenet kommer i tillegg: kunden bestiller og betaler det selv hos en domeneforhandler, og står alltid som innehaver. Nettbutikk legger til varer, Vipps og kort, Bring, Fiken og produktfeed. 0 % gebyr på salg.

**Ett tillegg:** daglig AI-team med sosiale medier, 249 kr/mnd.

**Valgfri oppstart, «jeg setter den opp for deg»:**

| | Pris | Inkluderer |
|---|---|---|
| Nettside | 3 900 kr | Opptil 7 sider, design, tekst, flytting fra gammel side med 301-kart |
| Nettbutikk | 9 900 kr | Butikkoppsett, betaling, frakt, import av opptil 100 varer |
| Tillegg (kalkulator) | Fast pris per enhet | Per 100 ekstra varer, ekstra språk, ekstra sider, integrasjoner |
| Utover kalkulatoren | Tilbud, timepris | Skreddersøm, B2B, spesialintegrasjoner |

Selvbygging har 0 kr i oppstart. Oppstart betales forskuddsvis. Prisene gjelder bare plattformen; Helenes vanlige kundetilbud er uendret.

**Gulvet:** Drift og AI koster ca. 20-60 kr per kunde i måneden. Det som spiser marginen er support. Målet er under 10 minutter support per kunde i måneden, derfor skal supporten være selvbetjent først (kunnskapsbase, AI-førstelinje, skriftlig svar innen én virkedag).

---

## 3. Bransjepakker

En bransjepakke er ikke et prisnivå. Den er et ferdig oppsett: sidestruktur, seksjoner, felt, tekstutkast, bildeforslag, schema.org-type, integrasjoner og designretninger som passer bransjen. Alle pakker følger med i begge abonnement. Pakkene bygges i bølger.

### Bølge 1 (MVP)

| # | Pakke | Særtrekk |
|---|---|---|
| 1 | Håndverker (elektro, rør, snekker, maler, tak) | Tilbudsforespørsel med bilder, sentral godkjenning via DiBK-API, Elvirksomhetsregisteret, referanseprosjekter, Mittanbud-lenke |
| 2 | Frisør, skjønnhet, negl | Booking (innebygd fra Bestilly, eller Timma/Onlinebooq/Fresha-lenke), prisliste, ansatte, gavekort |
| 3 | Nettbutikk, fysiske varer | Varianter, lager, Vipps og kort, Bring, førpris, angrerett, produktfeed |
| 4 | Konsulent, rådgiver, regnskap | Tjenester, møtebooking, fagartikler, tillitsseksjon |
| 5 | Kunstner og fotograf | Portefølje, galleri, salg av originaler og print, nummererte opplag, størrelse og materiale |

### Bølge 2

| # | Pakke | Særtrekk |
|---|---|---|
| 6 | Restaurant og kafé | Meny med allergener (skriftlig, Mattilsynet), bordbestilling (DinnerBooking, Resos), takeaway |
| 7 | Klinikk og terapeut (fysio, kiropraktor, massasje, psykolog) | Booking, behandlinger, regler for markedsføring av helsetjenester |
| 8 | Trening, PT og studio | Timeplan, medlemskap, klippekort |
| 9 | Leketøy og barn | Produktsikkerhetsfelt: CE, EN 71, alder, norske advarsler synlige før kjøp, GPSR |
| 10 | Mote og klær | Størrelsesguide, varianter, enkel retur |
| 11 | Mat, drikke og gårdsbutikk | Hentepunkt, sesongvarer, abonnementskasse |
| 12 | Kjede og flere lokasjoner | Lokasjonssider med egen SEO og booking, sentral merkevarekontroll |
| 13 | Bygg og entreprenør | Prosjektgalleri, sertifiseringer, HMS, anbudsforespørsel |

### Bølge 3

| # | Pakke | Særtrekk |
|---|---|---|
| 14 | Lag og forening, idrettslag | Medlemsregister (NIF), kontingent med Vipps, arrangementer |
| 15 | Arrangement, event og bryllup | Påmelding, billetter |
| 16 | Kurs og opplæring | Kurssalg, påmelding, nettkurs |
| 17 | Overnatting, hytte og B&B | Ledighet, iCal-synk |
| 18 | Bilverksted og bilpleie | Timebestilling, EU-kontroll-påminnelse |
| 19 | Renhold, vaktmester og hage | Priskalkulator, faste avtaler |
| 20 | Interiør, møbler og trevare | Produktkonfigurator, mål, spesialbestilling |
| 21 | Skjønnhetsprodukter og hår (nettbutikk) | Fargematch, abonnement på varer |
| 22 | Dyr (hundefrisør, dyrlege, hundebarnehage) | Booking, dyreprofil |
| 23 | Musiker, band og artist | Konserter, musikk, merch |
| 24 | Forfatter, podkast og skaper | Nyhetsbrev først, bok- og produktsalg |
| 25 | Advokat og finans | Fagområder, møtebooking, tillitsdokumentasjon |
| 26 | B2B grossist og produsent | Kundepriser, bestillingsportal, faktura, EHF |
| 27 | Transport og flytting | Prisforespørsel med adresser |
| 28 | Reiseliv og opplevelser | Booking av turer, språk |
| 29 | Ideell organisasjon | Innsamling med Vipps, frivillige |
| 30 | Privatperson, CV og portefølje | Enkel personlig side |

**Slik ser ingen sider like ut:** hver pakke har minst tre designretninger. Fargepalett og typografi hentes fra kundens logo og bilder (designtokens). Seksjonene har flere varianter, og rekkefølgen styres av bransje og mål, ikke av én mal.

---

## 4. Funksjoner: MVP og senere

Prinsipp: mye funksjonalitet, uten rot. Gode standardvalg og automatikk gjør at det meste aldri må stilles inn.

### MVP (taket)

**Kjerne**
- Konto med e-post og passord, senere Vipps Login. Roller: eier, redaktør, utvikler, Helene som admin
- Oppstartsflyt: org.nr slås opp i Brreg, bransje velges, logo lastes opp, utkast lages på minutter
- Sider og seksjoner med kladd og publisert versjon, versjonshistorikk, angre og tilbakerulling
- Forhåndsvisningslenke som kan deles før publisering
- Designtokens, designretninger, seksjonsbibliotek (lag 1 og 2)
- Egne felt per bransjepakke (lag 3, enkel versjon)
- Bilder: opplasting, automatisk komprimering og WebP/AVIF, alt-tekst-forslag

**Domene, hosting og e-post**
- Kobling av eksisterende domene med DNS-veiviser
- Bestilling av nytt domene via forhandler-API, alltid med kunden som innehaver
- Automatisk SSL, hosting i EU, CDN
- SPF, DKIM og DMARC settes opp automatisk for utsending

**SEO og synlighet**
- Server-rendrede sider, schema.org (LocalBusiness og bransjetype), sitemap, robots, meta
- 301-omdirigeringer og import av gamle URL-er ved flytting
- SEO-sjekk (fra Bestilly) og «Sjekk nettsiden din» som gratis verktøy
- Én kilde for åpningstider, priser og adresse som mates til side og schema

**Lov og trygghet, løst automatisk**
- Personvernerklæring og vilkår generert fra pakke og valg
- Cookiefri statistikk som standard, slik at cookiebanner ikke trengs
- Samtykke og dobbel opt-in for nyhetsbrev
- Universell utforming: WCAG 2.0 A og AA i alle seksjoner, kontrastsjekk ved designvalg
- Nettbutikk: angrerett, førpris ved salg, MVA, opplysningsplikt
- Backup daglig, gjenoppretting med ett klikk, 2FA, revisjonslogg

**Nettbutikk**
- Varer, varianter, lager, kategorier, rabattkoder
- Vipps ePayment og kort, Bring-frakt, Fiken-eksport
- Ordre, kvittering, fraktlapp, produktfeed til Google og Meta

**Kommunikasjon**
- Kontaktskjema og tilbudsforespørsel til innboks i plattformen
- Blogg
- Nyhetsbrev: innsamling, segmenter, utkast i kundens design, kalender, Godkjenn, sending via Brevo
- Ukentlig AI-rapport med forslag og Godkjenn

**Booking**
- Innebygd booking fra Bestilly, eller lenke og innbygging av Timma, Onlinebooq og Fresha

### Senere (fase 2 og 3)

- Daglig AI-team og sosiale medier (først «Publiser nå», egen Meta-app når tilgang er avklart)
- Flere språk, kjeder og lokasjoner, B2B-priser, EHF
- Visuell redigerer med fri layout, kodekomponenter, offentlig API, webhooks, Git-eksport
- Byråpartnere og hvitmerking
- Vipps recurring, abonnement på varer, gavekort, medlemskap
- Tripletex, PowerOffice, Helthjem, PostNord
- Egen Norid-registrar når volumet forsvarer det

### Bevisst droppet

- Plugin-markedsplass (årsaken til WordPress sine sikkerhetsproblemer)
- Ubegrenset fri AI-redigering med kreditter (uforutsigbar kostnad for kunden og for oss)
- Popup-spam og «urgency»-tellere som bryter markedsføringsloven

---

## 5. Kladd, forhåndsvisning og publisering

- Hver side har en kladdversjon og en publisert versjon. Kunden redigerer alltid i kladd.
- «Forhåndsvis» gir en hemmelig lenke som kan sendes til andre.
- «Publiser» gjør kladden til live versjon på sekunder. Hver publisering lagres.
- «Gå tilbake» velger en tidligere versjon og publiserer den.
- Lag 3 får i tillegg et eget testmiljø per nettsted og eksport til Git.

---

## 6. AI-teamet

Videreutviklet fra LuxusHair-teamet. Faste roller som jobber i bakgrunnen og leverer en rapport:

| Rolle | Ser etter | Eksempel på forslag |
|---|---|---|
| SEO | Rangering, tekniske feil, manglende innhold | «Siden for dametaklipp mangler pris og by i tittelen» |
| Innhold og markedsføring | Sesong, nye varer, nyhetsbrev, sosiale medier | «Utkast til nyhetsbrev om julegavekort er klart» |
| Butikk og drift | Lager, priser, forlatte handlekurver, konvertering | «Tre varer er utsolgt, men vises fortsatt øverst» |
| Sikkerhet og helse | Oppetid, ødelagte lenker, skjema som ikke virker | «Kontaktskjemaet fikk ingen henvendelser på 14 dager, test sendt» |

Regler: ingenting endres før kunden trykker Godkjenn. Hvert forslag sier hvorfor og hva det skal gi. Effekten måles i neste rapport. Ukentlig rapport er inkludert; daglig rapport og sosiale medier er tillegget på 249 kr/mnd.

---

## 7. Teknisk retning (forslag, må godkjennes)

**Ny kjerne, ferdige moduler.** Bestilly har riktig stack, men en flat datamodell (én bedrift, én side). Plattformen trenger nettsteder, sider, seksjoner, versjoner og domener. Derfor lager vi en ny kodebase med samme stack og flytter inn modulene som allerede virker:

| Kilde | Hva vi tar med |
|---|---|
| Bestilly | Booking, ledighet, norske helligdager, nyhetsbrevblokker, AI-markedsføring, SEO-sjekk, crawler, rate limiting, tester |
| froya-shop (LuxusLengths) | Handlekurv, kasse, ordre, frakt, fraktlapp-PDF, Google- og Meta-feed |
| Bedriftsflyt | Vipps ePayment, recurring og Login, med webhook-verifisering |
| Studio-portal | Skjemadrevet redigerer med nøstede lister (lag 1) |
| Starter Shop og WP-STARTSETT | Norske standardverdier, MVA, frakt, sikkerhetsoppsett som sjekkliste |
| ehf-faktura | EHF senere |

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Drizzle, Neon Postgres i Frankfurt, Auth.js, Cloudflare R2 for filer, Brevo for e-post, Anthropic for AI, Vitest og Playwright for tester.

**Hosting (beslutning gjenstår):** én app som serverer alle nettsteder ut fra domenet. Kandidater:
1. Cloudflare (Workers via OpenNext, Cloudflare for SaaS for kundedomener, R2, Web Analytics). Billig, ferdig løsning for tusenvis av egne domener med automatisk SSL. Ulempe: amerikansk selskap.
2. VPS i EU (f.eks. Hetzner) med Caddy og automatisk SSL per domene. Fast IP og full kontroll. Ulempe: drift og sikkerhet ligger på Helene.

Ikke Vercel Hobby (forbudt for kommersiell bruk) og ikke Railway (sikkerhetshendelse 21.10.2026). Data lagres i EU.

**Multi-tenant:** hver forespørsel slås opp på domene til nettsted. Alle spørringer er avgrenset til nettstedet. Publiserte sider caches på kanten og tømmes ved publisering.

---

## 8. Milepæler

| Fase | Mål | Ferdig når |
|---|---|---|
| 0 | Grunnmur | Repo, datamodell, innlogging, domeneoppslag, kladd og publisering virker lokalt |
| 1 | Første pakke live | Håndverkerpakken publisert på eget domene for én pilot |
| 2 | MVP | Fem pakker i bølge 1, nettbutikk med Vipps og Bring, nyhetsbrev, ukentlig AI-rapport |
| 3 | 20 betalende | Målt tid per leveranse, supportminutter og tid til publisering |
| 4 | Selvbetjening | Åpen registrering uten oppstartspris, bølge 2 |

Stoppkriterium fra Helenes egen research gjelder: får vi ikke betalende piloter, er det salget som må endres før mer bygges.
