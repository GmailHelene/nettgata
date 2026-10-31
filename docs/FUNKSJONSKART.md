# Funksjonskart for plattformen

Alt plattformen skal kunne, samlet på ett sted, med status. Oppdateres hver gang noe blir ferdig.
Grunnlag: markedsanalysen (funksjonskart, funksjonsrevisjon og MVP-liste), produktspesifikasjonen og Helenes egne kundesaker.

**Status:** Ferdig = bygget, testet og deployet. Pågår = under arbeid. MVP = med i første fullverdige versjon. Senere = fase 2-3. Droppes = bevisst valgt bort.

**Lag:** N = synlig for nybegynneren. A = avansert lag. U = utviklerlaget. S = skjult automatikk som bare virker.

Sist oppdatert 31.10.2026 (kvalitetsløft 2 og domenekobling).

---

## 1. Redigering og publisering

| Funksjon | Lag | Status |
|---|---|---|
| Skjemabasert redigering av seksjoner (lag 1) | N | Ferdig |
| Legg til, flytt, slett seksjoner, velg variant | N | Ferdig |
| Forhåndsvisning ved siden av redigeringen, oppdateres mens du skriver | N | Ferdig |
| Kladd og publisert versjon per side | N | Ferdig |
| Delbar forhåndsvisningslenke (signert, utløper etter 7 dager) | N | Ferdig |
| Versjonshistorikk og «Gå tilbake hit» | N | Ferdig |
| Publiser alle sider samtidig | N | Ferdig |
| Lag, slett, flytt sider, velg hva som vises i menyen | N | Ferdig |
| Dupliser side og seksjon | N | MVP |
| Kvalitetsport før publisering (lenker, alt-tekst, plassholdertekst, kontrast, mobil) | S | MVP |
| Låste felt per bransjepakke, så kunden ikke kan ødelegge oppsettet | S | MVP |
| Angre og gjør om i redigereren | N | MVP |
| Visuell redigering direkte i siden (klikk på teksten for å endre) | A | Senere |
| Fri layout: kolonner, avstand, rekkefølge i seksjonen | A | Senere |
| Navngitte kladder («Julekampanje»), planlagt publisering | A | Senere |
| Godkjenningsflyt: noen lager, eieren godkjenner | A | Senere |
| Egne kodekomponenter og egen CSS | U | Senere |
| Git-synk og eksport av hele nettstedet | U | Senere |

## 2. Design

| Funksjon | Lag | Status |
|---|---|---|
| Designtokens (farger, fonter, hjørner) som CSS-variabler | S | Ferdig |
| Designretninger per bransjepakke (tre for håndverker) | N | Ferdig |
| Kontrastsjekk etter WCAG, tema som bryter kravet kan ikke lagres | S | Ferdig |
| Farger hentet automatisk fra logo og bilder | N | MVP |
| Seks fontpar, selvhostet (ingen kall til Google), valg av hjørner | N | Ferdig |
| Bakgrunn per seksjon (vanlig, flate, fargerik) med kontrast i behold | N | Ferdig |
| Egendefinert palett innenfor kontrastkravene | A | MVP |
| Opplasting av logo | N | Ferdig (favicon: MVP) |
| Mørk modus for nettstedet | A | Senere |
| Egen sidemalbygger (lagre egne seksjoner som maler) | A | Senere |

| Toppstripe med budskap og lenker, logo, mobilmeny, bunntekst med kolonner og sosiale lenker | N | Ferdig |
| Meny med undermeny og megameny | A | MVP |

## 3. Seksjoner og innhold

| Funksjon | Lag | Status |
|---|---|---|
| Toppseksjon (fire varianter, også med bilde og bilde som bakgrunn) | N | Ferdig |
| Tekst, bilde og tekst, tjenester og priser, kontakt, oppfordring | N | Ferdig |
| Bildegalleri, kundeomtaler, spørsmål og svar | N | Ferdig |
| Trygghetspunkter, varekarusell (nyeste, salg, på lager), kategorikort | N | Ferdig |
| Ansatte og team | N | MVP |
| Åpningstider som egen seksjon | N | MVP |
| Kart (uten sporing før samtykke) | N | MVP |
| Video (YouTube uten informasjonskapsler, eller opplastet) | N | MVP |
| Tabell, prisplaner, logoer fra samarbeidspartnere | N | MVP |
| Nedlastbare filer (PDF-meny, brosjyre) | N | MVP |
| Bransjeseksjoner: meny med allergener, timeplan, prosjektgalleri, sertifiseringer | N | MVP (per pakke) |
| Egendefinerte felt og datatyper (f.eks. «Prosjekter» med egne felt) | U | Senere |

## 4. Bilder og media

| Funksjon | Lag | Status |
|---|---|---|
| Opplasting med krymping og WebP i nettleseren | N | Ferdig |
| Filtype sjekkes fra innholdet, SVG avvist (sikkerhet) | S | Ferdig |
| Alt-tekst påkrevd, eller aktivt merket som pynt | N | Ferdig |
| Bildelager lokalt og i Cloudflare R2 (Vest-Europa) | S | Ferdig |
| Mediebibliotek: gjenbruk av opplastede bilder | N | MVP |
| Slette et bilde helt fra lageret («Fjern» tar det i dag bare ut av siden) | N | MVP |
| Fokuspunkt og beskjæring | N | MVP |
| Responsive bildestørrelser (flere bredder) | S | MVP |
| Alt-tekst-forslag fra AI, som kunden godkjenner | N | MVP |
| Bildebank med lisensfrie bilder | N | Senere |
| Sletting av ubrukte bilder | S | Senere |

## 5. SEO og synlighet

| Funksjon | Lag | Status |
|---|---|---|
| Server-rendrede sider, én H1, kanonisk lenke | S | Ferdig |
| Sitemap og robots per domene | S | Ferdig |
| Strukturerte data (schema.org per bransje) | S | Ferdig |
| SEO-tittel og beskrivelse per side | N | Ferdig |
| Visning via plattformen er merket noindex | S | Ferdig |
| 301-omdirigeringer og importkart ved flytting | A | MVP |
| Open Graph-bilde per side (deling i sosiale medier) | N | MVP |
| Én linje «fiks nå» i stedet for SEO-poeng (mangler alt-tekst, for kort tittel) | N | MVP |
| Google Bedriftsprofil: veiviser og synk av åpningstider | N | MVP |
| Strukturerte data for produkter, arrangementer og spørsmål | S | MVP |
| AI-synlighetsrapport (hva sier ChatGPT og Google om bedriften) | N | Senere |
| Flere språk med hreflang, nynorsk som fullverdig språk | A | Senere |

## 6. Lov, personvern og universell utforming

| Funksjon | Lag | Status |
|---|---|---|
| Cookiefri statistikk som standard, ingen banner nødvendig | S | MVP |
| Personvernerklæring generert fra nettstedsinfo (sjekkes mot regelverksradaren) | S | MVP |
| Samtykkebanner bare når kunden slår på sporing (GA4, piksler) | A | MVP |
| WCAG 2.0 A/AA i alle seksjoner, «Hopp til innhold», tastaturnavigasjon | S | Ferdig (grunnlag), sjekk ved publisering MVP |
| Henvendelser kan slettes, påminnelse om sletting etter 12 måneder | N | Delvis ferdig (sletting), påminnelse MVP |
| Nettbutikk: kjøpsvilkår, angreskjema, førpriskontroll, opplysningsplikt | S | MVP |
| Databehandleravtale for plattformkundene | N | MVP |
| Innsyn og sletting av persondata på forespørsel | A | Senere |
| Lovsjekk ved publisering mot norske regler | S | Senere |

## 7. Sikkerhet og drift

| Funksjon | Lag | Status |
|---|---|---|
| Innloggingssperre per e-post og IP, IP lagres bare som hash | S | Ferdig |
| Tilgangssjekk i hver handling, studio bare på plattformens adresse | S | Ferdig |
| Trygge lenker (ingen javascript:) og escaping av strukturerte data | S | Ferdig |
| Revisjonslogg (lagres) | S | Ferdig, visning i studio MVP |
| Tofaktorinnlogging | N | MVP |
| Daglig backup med testet gjenoppretting | S | MVP |
| Brannmur og botvern (Cloudflare) | S | MVP |
| Oppetid og helsesjekk av synlig tekst og kjøpsflyt | S | MVP |
| Automatisk testkjøp hver måned som beviser at kassen virker | S | Senere |
| Full eksport (HTML, innhold som JSON, ordre som CSV), exit-garanti | N | MVP |

## 8. Domene, hosting og e-post

| Funksjon | Lag | Status |
|---|---|---|
| Hosting i EU-region, CDN og SSL | S | Ferdig (Cloudflare, Neon Frankfurt) |
| Visning via plattformens adresse (/vis/navn) før domenet er koblet | N | Ferdig |
| Gratis underdomene per kunde | S | Venter på domenevalg |
| Koble eget domene med DNS-veiviser (Cloudflare for SaaS), automatisk sjekk og https | N | Bygget, slås på når plattformen har eget domene |
| Unik peker per domene, så ingen kan koble til et domene de ikke eier | S | Bygget |
| Hoveddomenet, ekstra domener og gratisadressen sender videre til hovedadressen | S | Bygget |
| Bestille nytt domene i samme flyt, alltid i kundens navn | N | Senere (.no kan ikke kjøpes via Cloudflare eller Domeneshop sitt API; kunden kjøper selv og veiviseren lenker dit) |
| SPF, DKIM og DMARC satt opp automatisk | S | MVP |
| E-post på eget domene via partner | N | Senere |
| Egen Norid-registrar | S | Senere |

## 9. Skjema og henvendelser

| Funksjon | Lag | Status |
|---|---|---|
| Kontaktskjema med innboks i studioet | N | Ferdig |
| Honningkrukke og rate limiting mot spam | S | Ferdig |
| Feltene beholdes ved feilmelding | S | Ferdig |
| E-postvarsel til bedriften ved ny henvendelse (Brevo) | S | MVP |
| Tilbudsforespørsel med bildeopplasting (håndverker) | N | MVP |
| Egne skjema med valgfrie felt | A | Senere |
| Kundeliste med ordrehistorikk, hvor mye hver har handlet for, søk, internt notat og CSV | A | Ferdig (segmenter og samtykke til nyhetsbrev: Senere) |

## 10. Nettbutikk (Magento- og Shopify-nivå)

| Funksjon | Lag | Status |
|---|---|---|
| Produkter med bilder, beskrivelse og egen side | N | Ferdig (egen SEO-tekst per vare: MVP) |
| Varianter fra opptil tre valg, laget automatisk av kombinasjonene | N | Ferdig |
| Kategorier med filter i butikken | N | Ferdig |
| Lager per variant, atomisk trekk, «Bare X igjen» | N | Ferdig (lagervarsel på e-post: MVP) |
| Oversikt i studio: salg i dag, 7 og 30 dager, graf per dag, mest solgt, lite på lager, gjøremål | N | Ferdig |
| Ordreliste med statusfaner, søk, sider, plukkliste og pakkseddel | N | Ferdig |
| Sporingsnummer med lenke til Posten, PostNord, Helthjem og DHL, og internt notat på ordre | N | Ferdig |
| Søk og filter i varer i studio, bulkendring av status og kategori | N | Ferdig |
| Pris og lager for alle varianter i én tabell, som stopper overskriving av salg | N | Ferdig |
| Priser med MVA (25/15/12/0), prishistorikk og automatisk førpris | S | Ferdig |
| Handlekurv og kasse, priser alltid fra serveren | N | Ferdig |
| Handlekurv som skuff med fri frakt-måler | N | Ferdig |
| Vareside med galleri, brødsmuler, trekkspill og fast kjøpsknapp på mobil | N | Ferdig |
| Produktdata for Google (pris, lager per variant) | S | Ferdig |
| Vipps (ePayment) og kort | N | MVP |
| Betal ved henting, faktura, testbetaling i utvikling | N | Ferdig |
| Kassen stengt til kjøpsvilkårene er publisert | S | Ferdig |
| «Utvalgte varer»-seksjon og nettbutikkpakke med tre designretninger | N | Ferdig |
| Faste leveringsmåter, hent selv, gratis frakt over en grense | N | Ferdig |
| Bring med pris fra API og fraktetikett | N | MVP |
| Ordre med fortløpende nummer, statusregler og kvitteringsside | N | Ferdig |
| Ordrebekreftelse og varsel på e-post | S | MVP |
| Kansellering og refusjon som status, varene legges tilbake på lager | N | Ferdig |
| Kreditnota | A | MVP |
| Rabattkoder: prosent, beløp eller fri frakt, minstebeløp, periode og bruksgrense | N | Ferdig (automatiske kampanjer: MVP) |
| Salgs- og MVA-rapport per måned, termin, år eller egen periode, med MVA per sats og CSV | A | Ferdig |
| Fiken-eksport og ordreeksport som stemmer mot Vipps-oppgjør | A | MVP |
| Produktfeed til Google og Meta | S | MVP |
| Sortering (pris, nyeste) og filtre på valg og lager | N | Ferdig |
| Søk i varer for kunden | N | MVP |
| Eksport av varer og ordre som CSV (norsk Excel) | A | Ferdig |
| Import av varer fra CSV med forhåndsvisning, nye varer og endring av pris, lager, status og kategori | A | Ferdig (bilder via import: Senere) |
| Kundekonto med ordrehistorikk | N | Senere |
| Klarna, Helthjem, PostNord | N | Senere |
| Gavekort | N | Senere |
| Abonnement på varer (Vipps Recurring og kort) | A | Senere |
| Produktomtaler knyttet til ekte ordre | N | Senere |
| Mersalg i kurv og på produktside (regelstyrt, uten popup) | A | Senere |
| Handlekurvpåminnelse, bare med aktivt samtykke | A | Senere |
| Flere lagre og lokasjoner | A | Senere |
| B2B: kundepriser, kundegrupper, faktura, EHF | A | Senere |
| Produktkonfigurator (mål, spesialbestilling) | A | Senere |
| Kassesystem-synk (PCK) og ERP via API | U | Senere |

## 11. Booking

| Funksjon | Lag | Status |
|---|---|---|
| Lenke og innbygging av Timma, Onlinebooq, Fresha | N | MVP |
| Innebygd booking (fra Bestilly): tjenester, ansatte, åpningstider, helligdager | N | MVP |
| Påminnelse på e-post og SMS | S | Senere |
| Forskuddsbetaling og depositum med Vipps | N | Senere |
| Flere lokasjoner og ansatte per lokasjon | A | Senere |

## 12. Blogg, nyhetsbrev og markedsføring

| Funksjon | Lag | Status |
|---|---|---|
| Blogg med kategorier og egne SEO-sider | N | MVP |
| Nyhetsbrev: innsamling med samtykke og dobbel opt-in | N | MVP |
| Nyhetsbrev: utkast i kundens design, sending via Brevo | N | MVP |
| Innholdskalender for nyhetsbrev og sosiale medier | N | Senere |
| Facebook og Instagram: «Publiser nå» fra kalenderen | N | Senere |
| Egen Meta-app med planlagt publisering | S | Senere (krever avklaring med Meta) |
| Synk mot MailerLite og Klaviyo for dem som har det | A | Senere |

## 13. AI-teamet

| Funksjon | Lag | Status |
|---|---|---|
| Ukentlig rapport med forslag og Godkjenn | N | MVP |
| Faste roller: SEO, innhold og markedsføring, butikk og drift, sikkerhet | N | MVP |
| Alt som foreslås kan forhåndsvises og angres | S | MVP |
| Effektmåling i neste rapport | N | Senere |
| Daglig rapport og sosiale medier (tillegg 249 kr/mnd) | N | Senere |

## 14. Statistikk og rapporter

| Funksjon | Lag | Status |
|---|---|---|
| Besøk, kilder og mest leste sider, uten informasjonskapsler | N | MVP |
| Henvendelser og salg per måned | N | MVP |
| Månedsrapport på e-post | N | MVP |
| Google Search Console-kobling | A | Senere |

## 15. Brukere, roller og partnere

| Funksjon | Lag | Status |
|---|---|---|
| Roller: eier, redaktør, utvikler, plattformadmin | S | Ferdig i datamodellen |
| Invitere ansatte med e-post | N | MVP |
| Innlogging med Vipps | N | Senere |
| Egendefinerte roller (f.eks. lokasjonsleder) | A | Senere |
| Partnerkonsoll for byråer og frilansere, hvitmerking | U | Senere |

## 16. Oppstart og flytting

| Funksjon | Lag | Status |
|---|---|---|
| Nytt nettsted fra org.nr. (Brreg), bransjepakke og designretning | N | Ferdig (for plattformadmin) |
| Selvbetjent registrering for kunder | N | Fase 4 |
| Import fra eksisterende nettside med 301-kart | N | MVP |
| Import fra Google-profil og Facebook | N | Senere |
| Flytting fra Wix, Squarespace, Shopify og WordPress | A | Senere |
| AI-utkast av tekst fra bedriftens opplysninger (merket som utkast) | N | MVP |

## 17. Fakturering av plattformkunder

| Funksjon | Lag | Status |
|---|---|---|
| Abonnement Nettside 199 / Nettbutikk 399 (årlig 169 / 339) | S | MVP |
| Oppstartspris med forskudd, publisering sperret til betalt | S | MVP |
| Betaling med kort, Vipps Recurring eller faktura | N | MVP |
| Varsel 30 dager før fornyelse | S | MVP |

## 18. Bransjepakker

Ferdig: håndverker. Bølge 1 (MVP): frisør og skjønnhet, nettbutikk, konsulent, kunstner og fotograf. Bølge 2 og 3: 25 pakker til, fra restaurant og klinikk til B2B-grossist og privatperson. Full liste i `PRODUKTSPEK.md`.

## 19. Support og hjelp

| Funksjon | Lag | Status |
|---|---|---|
| Hjelpetekster der funksjonen brukes | N | MVP |
| Kunnskapsbase | N | MVP |
| AI-førstelinje som svarer fra kunnskapsbasen, overlevering til Helene | N | Senere |

## 20. Droppes bevisst

Plugin-markedsplass og temamarkedsplass. Slidere. Nedtellingsklokker og «12 personer ser på denne nå». Popup ved første besøk. Besøks- og delingstellere. Flere cache-lag. AI-genererte anmeldelser og «ansatte»-bilder. Ubegrenset AI-redigering med kreditter.
