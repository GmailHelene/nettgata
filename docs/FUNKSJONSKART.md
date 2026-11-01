# Funksjonskart for plattformen

Alt plattformen skal kunne, samlet på ett sted, med status. Oppdateres hver gang noe blir ferdig.
Grunnlag: markedsanalysen (funksjonskart, funksjonsrevisjon og MVP-liste), produktspesifikasjonen og Helenes egne kundesaker.

**Status:** Ferdig = bygget, testet og deployet. Bygget = bygget og testet, ikke deployet ennå. Pågår = under arbeid. MVP = med i første fullverdige versjon. Senere = fase 2-3. Droppes = bevisst valgt bort.

**Lag:** N = synlig for nybegynneren. A = avansert lag. U = utviklerlaget. S = skjult automatikk som bare virker.

Sist oppdatert 01.11.2026 (temaer og sjangre, salgssiden nettgata.no, juridiske tekster godkjent, Vipps og Klarna, abonnement med Stripe, sikkerhetskopi, blogg, invitasjoner og omdirigeringer, timebestilling, Bring, Fiken for plattformadmin, funn fra test med kundegrupper).

---

## 1. Redigering og publisering

| Funksjon | Lag | Status |
|---|---|---|
| Skjemabasert redigering av seksjoner (lag 1) | N | Ferdig |
| Legg til, flytt, slett seksjoner, velg variant | N | Ferdig |
| Seksjonsbibliotek med bilde av hver variant i nettstedets egne farger og fonter, sett inn hvor som helst | N | Bygget |
| Dra og slipp for å flytte seksjoner, også med piltaster og knapper | N | Bygget |
| Ryddig seksjonsliste: bare seksjonen du jobber med er åpen, de andre viser navn og første tekst | N | Bygget |
| Forhåndsvisning ved siden av redigeringen, oppdateres mens du skriver | N | Ferdig |
| Forhåndsvisning som datamaskin eller mobil, med ekte mobilbredde | N | Bygget |
| Klikk på en seksjon i forhåndsvisningen for å åpne den i skjemaet | N | Bygget |
| Automatisk lagring av kladden, også når noe ikke er fylt ut ennå | S | Bygget |
| Kladd og publisert versjon per side | N | Ferdig |
| Delbar forhåndsvisningslenke (signert, utløper etter 7 dager) | N | Ferdig |
| Versjonshistorikk og «Gå tilbake hit» | N | Ferdig |
| Publiser alle sider samtidig | N | Ferdig |
| Lag, slett, flytt sider, velg hva som vises i menyen | N | Ferdig |
| Lag kopi av en seksjon | N | Bygget |
| Dupliser side | N | MVP |
| Kvalitetsport før publisering: det som mangler vises på seksjonen, eksempeltekst og eksempelbilder stopper eller varsler | S | Bygget (lenkesjekk, kontrast og mobil: MVP) |
| «Skriv ...»-tekst fra bransjepakken stopper publisering. «Publiser alle» publiserer det som er klart og sier hvilke sider som mangler tekst | S | Bygget |
| Forsiden viser «Nettstedet er snart klart» (uten indeksering) til den er publisert, i stedet for «Fant ikke siden» | S | Bygget |
| Låste felt per bransjepakke, så kunden ikke kan ødelegge oppsettet | S | MVP |
| Angre og gjør om i redigereren, med knapper og Ctrl+Z | N | Bygget |
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
| Temaer som i WordPress: 12 temaer med fire fargevarianter hver, galleri med ekte forhåndsvisning på datamaskin og mobil | N | Bygget |
| Tilpass: farger, fonter, overskrifter, knapper, kort, bilder, toppmeny, luft og pynt, med live forhåndsvisning | A | Bygget |
| Kontrastsjekk etter WCAG, tema som bryter kravet kan ikke lagres | S | Ferdig |
| Farger hentet automatisk fra logo og bilder | N | MVP |
| 14 fontpar, selvhostet (ingen kall til Google), valg av hjørner | N | Bygget |
| Bakgrunn per seksjon (vanlig, flate, fargerik) med kontrast i behold | N | Ferdig |
| Egendefinert palett innenfor kontrastkravene | A | Bygget (Design, Tilpass) |
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
| Mediebibliotek: gjenbruk av opplastede bilder, «Velg fra biblioteket» i alle bildefelt | N | Bygget |
| Oversikt over alle bilder med størrelse, standard alt-tekst og hvor hvert bilde brukes | N | Bygget |
| Slette et bilde helt fra lageret, bare når det ikke er i bruk | N | Bygget |
| Publisering stopper hvis en side bruker et bilde som er slettet | S | Bygget |
| Fokuspunkt: klikk på det viktigste i bildet, så beholdes det når bildet beskjæres (sider og varer) | N | Bygget |
| Manuell beskjæring (dra et utsnitt) | N | Senere |
| Responsive bildestørrelser: 640, 1280 og 2000 px, mobilen henter den minste som holder | S | Bygget (bilder fra før har bare originalen) |
| Alt-tekst-forslag fra AI, som kunden godkjenner | N | MVP |
| Bildebank med lisensfrie bilder | N | Senere |
| Sletting av ubrukte bilder | S | Senere |

## 5. SEO og synlighet

| Funksjon | Lag | Status |
|---|---|---|
| Server-rendrede sider, kanonisk lenke | S | Ferdig |
| Én H1 på hver side: den første overskriften blir H1 også når siden ikke starter med en toppseksjon | S | Bygget |
| Sitemap og robots per domene | S | Ferdig |
| Strukturerte data (schema.org per bransje) | S | Ferdig |
| SEO-tittel og beskrivelse per side, med forhåndsvisning av Google-treffet | N | Bygget (feltene ble brukt, men kunne ikke redigeres i studioet før nå) |
| Visning via plattformen er merket noindex | S | Ferdig |
| 301-omdirigeringer og importkart ved flytting | A | Bygget: liste med gammel og ny adresse, også WordPress-adresser med ?page_id (import fra gammel sitemap: MVP) |
| Open Graph-bilde per side (deling i sosiale medier), ellers første bilde på siden, varebilde på varesider | N | Bygget |
| Én linje «fiks nå» i stedet for SEO-poeng (mangler beskrivelse, for lang tittel, mangler H1, mangler bilde) | N | Bygget |
| Google Bedriftsprofil: veiviser og synk av åpningstider | N | MVP |
| Strukturerte data for produkter (pris, lager, fulle bildeadresser) | S | Bygget |
| Strukturerte data for arrangementer og spørsmål | S | MVP |
| AI-synlighetsrapport (hva sier ChatGPT og Google om bedriften) | N | Senere |
| Flere språk med hreflang, nynorsk som fullverdig språk | A | Senere |

## 6. Lov, personvern og universell utforming

| Funksjon | Lag | Status |
|---|---|---|
| Cookiefri statistikk som standard, ingen banner nødvendig | S | MVP |
| Personvernerklæring generert fra nettstedsinfo (sjekkes mot regelverksradaren) | S | Bygget (utkast til Helene har godkjent tekstene) |
| Samtykkebanner bare når kunden slår på sporing (GA4, piksler) | A | MVP |
| WCAG 2.0 A/AA i alle seksjoner, «Hopp til innhold», tastaturnavigasjon | S | Ferdig (grunnlag), sjekk ved publisering MVP |
| Henvendelser kan slettes, påminnelse om sletting etter 12 måneder | N | Delvis ferdig (sletting), påminnelse MVP |
| Nettbutikk: kjøpsvilkår, angreskjema, førpriskontroll, opplysningsplikt | S | Bygget: /angrerett, angreskjema i ordrebekreftelsen, opplysningsplikt i kassen (kjøpsvilkår-malen er fortsatt plassholder) |
| Databehandleravtale for plattformkundene | N | MVP |
| Innsyn og sletting av persondata på forespørsel | A | Senere |
| Lovsjekk ved publisering mot norske regler | S | Senere |

## 7. Sikkerhet og drift

| Funksjon | Lag | Status |
|---|---|---|
| Innloggingssperre per e-post og IP, IP lagres bare som hash | S | Ferdig |
| Tilgangssjekk i hver handling, studio bare på plattformens adresse | S | Ferdig |
| Trygge lenker (ingen javascript:) og escaping av strukturerte data | S | Ferdig |
| Studioet kan ikke legges i en ramme på andre nettsteder (vern mot clickjacking) | S | Bygget |
| Revisjonslogg (lagres) | S | Ferdig, visning i studio MVP |
| Tofaktorinnlogging med kodeapp (QR-kode), reservekoder og nullstilling for plattformadmin | N | Bygget (valgfritt per bruker) |
| Daglig backup med testet gjenoppretting | S | Bygget: hver natt til R2, 30 netter, gjenoppretting testet (krever Workers Paid for sikker drift) |
| Brannmur og botvern (Cloudflare) | S | MVP |
| Oppetid og helsesjekk av synlig tekst og kjøpsflyt | S | Delvis: /api/helse for oppetidsvarsling er bygget, overvåkingen settes opp hos en ekstern tjeneste |
| Automatisk testkjøp hver måned som beviser at kassen virker | S | Senere |
| Full eksport (HTML, innhold som JSON, ordre som CSV), exit-garanti | N | MVP |

## 8. Domene, hosting og e-post

| Funksjon | Lag | Status |
|---|---|---|
| Hosting i EU-region, CDN og SSL | S | Ferdig (Cloudflare, Neon Frankfurt) |
| Visning via plattformens adresse (/vis/navn) før domenet er koblet | N | Ferdig |
| Gratis underdomene per kunde (navn.nettgata.no) | S | Venter på at nettgata.no blir aktiv i Cloudflare |
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
| Varsel på e-post til bedriften ved ny henvendelse, med svar rett til den som skrev | N | Bygget, sendes når Brevo er koblet til |
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
| Vipps ePayment og Klarna (kort, faktura, delbetaling) med butikkens egne avtaler, trekk ved sending, refusjon | N | Bygget (ikke prøvd med ekte testnøkler) |
| Betal ved henting, faktura, testbetaling i utvikling | N | Ferdig |
| Kassen stengt til kjøpsvilkårene er publisert | S | Ferdig |
| «Utvalgte varer»-seksjon og nettbutikkpakker (generell, klær, interiør, lokalmat) | N | Bygget |
| Faste leveringsmåter, hent selv, gratis frakt over en grense | N | Ferdig |
| Bring med pris fra API og fraktetikett: butikkens egen Mybring-konto, pris for vekt og postnummer låst på serveren, reservepris når Bring ikke svarer, etikett og sporing fra ordren, vekt på varer og varianter | N | Bygget (ikke prøvd mot ekte Mybring-konto, se BRING.md) |
| Ordre med fortløpende nummer, statusregler og kvitteringsside | N | Ferdig |
| Ordrebekreftelse til kunden, varsel om ny ordre og «pakken er på vei» med sporing (Brevo) | S | Bygget, sendes når Brevo er koblet til |
| E-postlogg på ordren, så butikken ser om kunden fikk bekreftelsen | S | Ferdig |
| Kansellering og refusjon som status, varene legges tilbake på lager | N | Ferdig |
| Kreditnota | A | MVP |
| Rabattkoder: prosent, beløp eller fri frakt, minstebeløp, periode og bruksgrense | N | Ferdig (automatiske kampanjer: MVP) |
| Salgs- og MVA-rapport per måned, termin, år eller egen periode, med MVA per sats og CSV | A | Ferdig |
| Fiken-eksport (betalte ordre sendes til butikkens egen Fiken som salg, én linje per MVA-sats) og ordreeksport som stemmer mot Vipps-oppgjør | A | Fiken: Bygget, men bare åpent for plattformadmin (`fikenAvailableTo`). Ikke prøvd mot ekte Fiken, og den personlige API-nøkkelen må byttes til OAuth2 før butikkene får den, se docs/FIKEN.md. Vipps-oppgjør: MVP |
| Produktfeed til Google og Meta | S | Bygget (/produktfeed.xml på butikkens domene) |
| Sortering (pris, nyeste) og filtre på valg og lager | N | Ferdig |
| Søk i varer for kunden | N | MVP |
| Eksport av varer og ordre som CSV (norsk Excel) | A | Ferdig |
| Import av varer fra CSV med forhåndsvisning, nye varer og endring av pris, lager, status og kategori | A | Ferdig (bilder via import: Senere) |
| Kundekonto med ordrehistorikk | N | Senere |
| Helthjem, PostNord | N | Senere |
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
| Seksjonen «Timebestilling»: knapp til bookingsystemet, eller innebygd bestilling fra Timma, Fresha, Resos, DinnerBooking, Calendly, Spond, TicketCo og Hoopla som lastes først når den besøkende trykker | N | Bygget |
| Innebygd booking (fra Bestilly): tjenester, ansatte, åpningstider, helligdager | N | MVP |
| Påminnelse på e-post og SMS | S | Senere |
| Forskuddsbetaling og depositum med Vipps | N | Senere |
| Flere lokasjoner og ansatte per lokasjon | A | Senere |

## 12. Blogg, nyhetsbrev og markedsføring

| Funksjon | Lag | Status |
|---|---|---|
| Blogg med kategorier og egne SEO-sider | N | Bygget: innlegg under /blogg og seksjon med siste innlegg (kategorier: MVP) |
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
| Invitere brukere med lenke og e-post, roller, fjerne tilgang, eier godtar vilkår og databehandleravtale | N | Bygget (e-posten sendes når Brevo er koblet til) |
| Innlogging med Vipps | N | Senere |
| Egendefinerte roller (f.eks. lokasjonsleder) | A | Senere |
| Partnerkonsoll for byråer og frilansere, hvitmerking | U | Senere |

## 16. Oppstart og flytting

| Funksjon | Lag | Status |
|---|---|---|
| Nytt nettsted i fire steg: org.nr. (Brreg), 11 sjangre og 45 bransjepakker med søk og forslag fra næringskoden, temagalleri, kontaktinfo | N | Bygget (for plattformadmin) |
| Selvbetjent registrering for kunder | N | Fase 4 |
| Import fra eksisterende nettside med 301-kart | N | MVP |
| Import fra Google-profil og Facebook | N | Senere |
| Flytting fra Wix, Squarespace, Shopify og WordPress | A | Senere |
| AI-utkast av tekst fra bedriftens opplysninger (merket som utkast) | N | MVP |

## 17. Fakturering av plattformkunder

| Funksjon | Lag | Status |
|---|---|---|
| Abonnement Nettside 199 / Nettbutikk 399 (årlig 169 / 339) i Stripe Checkout, 25 % mva, norsk faktura med org.nr. | S | Bygget (venter på Stripe-oppsett, se BETALING-PLATTFORM.md) |
| Oppstart 3 900 / 9 900 betalt sammen med første abonnement | S | Bygget |
| Eget domene krever aktivt abonnement, eller «Fakturert utenom Stripe» satt av plattformadmin | S | Bygget |
| Kundeportal: bytt kort, se fakturaer, si opp ut perioden | N | Bygget (Stripe) |
| Prisene sjekkes mot vedtatte priser før betaling, feil pris stopper betalingen | S | Bygget |
| Varsel 30 dager før fornyelse | S | Bygget (e-post fra Stripe, slås på i Stripe) |
| Tillegget AI-team og sosiale medier 249 kr | S | Skjult til det lanseres |
| Publisering sperret til oppstarten er betalt | S | MVP |
| Vipps Recurring | N | Senere |

## 18. Bransjepakker

Bygget: 45 bransjepakker i 11 sjangre (håndverk 7, skjønnhet 3, helse 4, mat 4, nettbutikk 4, rådgivning 5, kunst og foto 4, trening 4, reise og opplevelser 2, lag og foreninger 3, service og annet 5), med anbefalte temaer per bransje. Booking for frisør (bølge 1) mangler fortsatt. Full liste over planlagte pakker i `PRODUKTSPEK.md`.

## 19. Support og hjelp

| Funksjon | Lag | Status |
|---|---|---|
| Hjelpetekster der funksjonen brukes | N | MVP |
| Kunnskapsbase | N | MVP |
| AI-førstelinje som svarer fra kunnskapsbasen, overlevering til Helene | N | Senere |

## 20. Nettgata.no: salg, juridisk og drift

| Funksjon | Lag | Status |
|---|---|---|
| Salgsside med temaer, bransjesider (én per bransje), nettbutikkside, priser og skjema | N | Bygget |
| Henvendelser fra skjemaet havner i Nettgata sin innboks i studioet | S | Bygget |
| Samtykkebanner før Google-taggen (Consent Mode), konvertering bare for lagrede henvendelser | S | Bygget (aktiveres med GOOGLE_ADS_TAG_ID) |
| Personvern, vilkår og databehandleravtale på nettgata.no, også som Word og PDF | S | Bygget (utkast) |
| Sitemap og robots for nettgata.no | S | Bygget |
| Sletting etter reglene: henvendelser etter 12 måneder, gamle innloggingsforsøk etter 48 timer | S | Bygget |
| Google Ads-plan med importfil for Google Ads Editor | N | Klar, Helene starter kampanjene |

## 21. Droppes bevisst

Plugin-markedsplass og temamarkedsplass. Slidere. Nedtellingsklokker og «12 personer ser på denne nå». Popup ved første besøk. Besøks- og delingstellere. Flere cache-lag. AI-genererte anmeldelser og «ansatte»-bilder. Ubegrenset AI-redigering med kreditter.
