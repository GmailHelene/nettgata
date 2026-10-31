# Egne kundeerfaringer: lærdom til en norsk nettside- og nettbutikkplattform

Internt dokument for Helene. Grunnlag: 42 saksfiler (SAK.md) i Viktig-Claude-code, PIPELINE.md, DRIFTSKUNDER.md, tidsgjennomgang, Leads-oppfolging.xlsx, _OS-RAAMATERIALE (sjangerguidene), ferdige kunder i KODE-FOR-KUNDER-EGET-ANNET, og Claude-minnefilene (ca. 90 filer). Status per 30.-31.10.2026.

Forbehold: tallene under er hentet fra egne notater og kan være grove. Timer i "Claude-timer" er maskintid, ikke Helenes egen tid. Ingen passord, nøkler, kontonumre eller kundekontaktinfo er tatt med. Der kildene spriker er det sagt.

---

## 1. Oversikt over kunder og leads

Tall i korthet (PIPELINE.md 30.10.2026): 42 saksfiler. 4 saker "i arbeid" (Kristoffer, Richard, Thomas, Christian), 15 åpne leads (derav 3 byrå-spor og 4 via InfoDesk/Håkon), 22 døde eller halvdøde, 1 internt produktområde (sikkerhetssjekk). Bare 2 har løpende driftsavtale i dag (Kristoffer 590/mnd, Richard 1 280/mnd), og DRIFTSKUNDER.md sto tom til 20.10. I tillegg kommer 6-8 eldre/ferdige oppdrag (Patience, Toraderklubben, 4085/cutit, Unique, DutchMadeEasy m.fl.). Antall betalende kunder totalt siden 2026 er altså lavt (ca. 8-10), og det er selve salget, ikke byggingen, som er flaskehalsen.

### 1A. Betalende og leverte kunder (inkl. eldre ferdige)

| Kunde | Bransje | Ba om | Ble | Plattform/stack | Pris (eks mva) | Utfall og notat |
|---|---|---|---|---|---|---|
| Kristoffer / Sjakktrening AS | Nettbasert sjakkundervisning, betalt medlemssted (312 videoer) | Rebuild av eksisterende side i 3 faser, favoritter, filtre, nytt design (designer "Alex" leverte Figma), senere PHP-/kjerneoppdatering og repetisjonsoppgaver | Lansert 16.10.2026. Drift Premium 590/mnd fra 01.11 | WordPress + MemberPress + ACF Pro + FacetWP + WP Rocket + Wordfence, cPanel-host (kundens egen) | 15 000 à konto + sluttfaktura 3014 på 35 375 inkl. mva; timejobber 600/t; drift 590/mnd | Betaler raskt. Svært mange revisjonsrunder (22 punkter 04.10, 16 nye samme dag, del 3 og 4 05.10, fire e-poster 06.10). Egen feil lekket betalingsmurinnhold (REST + post_content). Hvit skjerm ved kjerneoppdatering. Ca. 3 måneder fra tilbud til lansering. Ga Google-anmeldelse. |
| Richard / Suntex AS og Smartfilm Norge AS | Solfilm/vindusfilm, montørbedrift | Fart- og SEO-optimalisering av to eksisterende WordPress-sider, uten designendring | Levert 16.09. Driftsavtale A (1 280/mnd, kvartalsfaktura på forskudd) akseptert 23.10 | WordPress, WPBakery, Slider Revolution, Brooklyn-tema, tre cache-systemer på smartfilm.no, Domeneshop | 5 500 + 7 500 = 11 000 for begge | Betalte faktura 3011 (13 750 inkl. mva) på forfallsdagen. Krise 10.09: 31 timer utenfor avtalen, minst 8 ødelagte plugin/tema-filer og nedetid. Reell timepris 254 kr/t (Helenes lavest). Pilotkunde for eget produkt Team Tavla. |
| Thomas / Novaduo (sushikurs.no) | Kursselger, one-page med Google Ads | One-page salgsside med kontaktskjema | Live 10.09 (6 dager etter pris 04.09) | WordPress + Kadence + ConsentPilot + Fluent Forms + GTM/GA4 + Cloudflare Turnstile; Domeneshop | Thomas foreslo 4 000, fikk 6 500 (50/50, 3 250 + 3 250). Drift foreslått 290/590/990 | Leverte full tekst og 25 bilder selv (best case). Sluttfaktura 3013 betalt ca. 6 uker for sent (avtalt frist 06.11). Hadde allerede gått live og markedsført før sluttfaktura var betalt. |
| Patience Sportswear (Tommy) | Sportsklær/padel, nettbutikk | Komplett WooCommerce-butikk, Stripe, Klarna, Bring, domenebytte | Levert 2026. Fem stjerner på Google | WordPress + WooCommerce, barnetema på Sober, WPBakery, SiteGround; egne plugins (live chat, Enkel Fraktlabel) | 14 000 | Hennes første kunde etter pausen, sterkeste referanse. Etter levering: duplikatprodukter (med/uten trykk), forlatt-kurv-e-post som folk irriterte seg over, gjentakende feil på WPBakery-oppdatering siden 23.08, uavklart Stripe-webhook ved domenebytte, spørsmål om regnskapsrapport. |
| Christian Bakke (Imperium Auto og Optimal Partner) | Bilforhandler/verksted og bygg/drift/megler-paraply | To WordPress-sider med Elementor Pro, logo, personvern, kontaktskjema | Levert juli 2026 (go 29.06, sluttstatus 08.07) | WordPress + Elementor Pro + Fluent Forms + Complianz + Rank Math, ProISP (kundens egen konto) | 20 000 + 12 000 + 3 000 mva-tillegg = 35 000 | ALDRI BETALT. Fem purringer, inkassovarsel 23.09, saken ligger hos Collectors (13.10). Fikk egen wp-admin samme dag som fakturaene gikk ut (10.07). Foreslo i tillegg "Nettside24" (mal-nettsider på 24 t). |
| Henrik Torjussen / Posuva (4085.no, cutit.no) | Spillside og verktøyutleie | Spillside; vurdering av serverbytte; GDPR-oppsett | Levert; GDPR gratis avtalt | Ikke notert | 3003 (ukjent beløp) + 3009 på 1 125 | Betalt. Gratis ConsentPilot-oppsett hadde frist 30.08 og var ubehandlet. |
| Ane / Toraderklubben | Forening | Rydde hacket WordPress | Ferdig mai 2026 | WordPress, Domeneshop, sårbart wp-file-manager-plugin | 1 500 (600/t) | Domeneshop sperret siden og krevde skriftlig redegjørelse. Kunden hadde passord i klartekst i egne notater. |
| Unique Hair & Beauty | Salong, Åmot | Nettside (pro bono, porteføljebygging) | Statisk one-page + Sveltia CMS + Timma-lenke | Statisk HTML/JSON, Netlify, GitHub | Gratis | Første kunde for Studio-portal. Mangler fortsatt logo/bilder/priser fra kunden. |
| DutchMadeEasy | Nettbasert språkskole | Hjemmeside, kontakt og booking (gratis) | Statisk 3-sider | HTML/CSS/JS, Netlify Forms, Cal.com-embed | Gratis | Venter i uker på logo, bilde og e-post fra kunden. |
| Fotovegg (Steinar) | Hobbyfotograf, print | Nettbutikk med størrelse/materiale, nummererte opplag | Estimat 50-80 t / 35 000-60 000. PIPELINE lister ham som "levert", minnet viser bare estimat. Uklart | WordPress + WooCommerce foreslått | - | Utgangspunkt for Starter Shop-malen. |
| Modum kommune (UX-rapport 06.2026 og utredning 09.2026) | Kommune | Ingen bestilling. Gratis rapport/utredning sendt uoppfordret | Ingen avtale | - | 0 | Kun bekreftelse på mottak fra ordfører/kommunalsjef. |
| LuxusHair AS (eget selskap, 17 år) | Hårextensions, nettbutikk | - | Woo ble headless Next.js på Netlify | WooCommerce + Next.js, SiteGround, Klarna/Stripe/Vipps | - | Erfaringsgrunnlag for nettbutikkdrift: SiteGround-CPU, captcha mot server-kall, GA4-blindhet, ulovlige førpriser, fri frakt på alle ordrer. |

### 1B. Åpne leads (30.10.2026)

| Lead | Bransje | Ba om | Pris/spor | Status og blokkering |
|---|---|---|---|---|
| vikarbolig.no (Bjørn Olav og Martin) | Markedsplass for korttidsbolig til helsevikarer | Custom plattform: annonser, abonnement, Vipps-innlogging, iCal-synk, melding, kart | Fastpris 93 000 (var 150-250 000 som WordPress + Dokan fra bunnen; gjenbruk halverte). Proforma 11 625 inkl. mva | JA 18.09, men proformaen forfalt 23.10 ubetalt og Altinn-registreringen av selskapet ikke godkjent. 12 timer ufakturert tilbudsarbeid. |
| Thomas / Novaduo kunstbutikk | Kunsttrykk (print on demand) | WooCommerce + Gelato, 20-30 produkter | Fastpris 19 900 i 3 avdrag (3 000 / 8 450 / 8 450). Opprinnelig tilbud 46 000 (28k + 18k) | Venter på kunstnerens materiale og avdrag 1 (januar/februar 2027). Lokal butikk allerede bygget på spec. |
| Kongsberg Kjøkkensenter (Gjermund) | Lokal kjøkkenbutikk, 4 000+ leverte kjøkken | Enkel 7-siders WordPress-side, fast engangspris, eie alt selv, uavhengig webhotell, Google Maps/lokalt søk én gang. Avviser Akari-tilbud på 1 500/mnd i 24 mnd + 700 drift | 9 900 + drift fra 299 | Skal avslutte hos Akari først. Svarer raskt. |
| Hosney (Luxorstone) | Steingrossist i Modum | "Sjekk alt", pris | Samlepris 20 000 (A-D inkl. design og SEO) | Mockup sendt, møte avlyst 23.10, stille. 98 av 100 produkter uten pris, tema-demo-rester, 202 sider. 2-3 t ufakturert. |
| Milan Restaurant (Amir) | Restaurant/take away, Åmot | Helene tilbød gratis fiksing | Gratis (funn 1-9) | Siden ligger på plattformen Dandero (lukket plattform, må rettes via dem). |
| Lorena (Hellige Ord) | Nettbutikk, kristne gaveartikler | Nytt design/prisanslag | 2 850-4 750 for fire tekniske punkter | Next.js på Vercel + Shopify headless, laget av en utvikler med AI/Lovable. Designet var bra. Spurte om delbetaling. Stille. |
| Pål (KarboGuide) | Helse-app | Sikkerhetssjekk før lansering, bygger selv med Codex | Gratis gjennomgang lovet | Tidlig, fiktive data. |
| Håkon / InfoDesk AS (underleverandør) | PCK-forhandler (kassesystem) med nettbutikker | Klone PCK-integrerte WooCommerce-butikker | Bond Street fastpris 10 000, ca. 25 t = ca. 400 kr/t. 50 % ved godkjent design (27.10), 50 % ved levering (senest 10.11) | Fire nye oppdrag i pipen: ment.no (629 varer, B2B, Weglot), Brødrene Freberg (overtakelse fra byrå), Aroi Asia (7 restauranter, hentetid). Rolle/betaling uavklart. |
| Byrå-spor: Hubro Digital, Prege AS, Synlig Studio | Digitalbyråer | Underleverandørkapasitet (1 250-1 400/t) | - | Hubro: møte midt i november. Prege tipset om Hubro. Synlig Studio bygger uten WordPress. |

### 1C. Døde og halvdøde leads (22 saker)

| Lead | Bransje/ønske | Hvordan døde den |
|---|---|---|
| Frode (elantraelements) | WooCommerce bildeler, fullføre og drifte | Tilbud 05.08, tapt: valgte annen utvikler. Siden hadde eiendomsmegler-tema (Houzez), utløpt SSL, tom forside. |
| Montez AS | Shopify-opprydding, 14 900 fastpris | Avslått av kunden 24.08. |
| Solo Renhold (Solomon) | WordPress-opprydding + kalkulator + booking, 11 000 | Likviditetsproblem. Revidert til 9 000 med 50/50. Stille. Lagt død 31.08. |
| Skjønnhetssalong (swajet) | Nettside med selvbetjent booking | Purret to ganger, stille. Død 31.08. |
| Jan S (Tyrol/Hyttehjørnet) | Kalkyleverktøy + provisjonssamarbeid | Anslag 20-30k. Stille. Parkert 04.09 ("lavsesong"). |
| Bareksten Julebord (via Thomas) | Premium landingsside + Hubspot | "Den ble for dyr" (12-18k). Billigvariant 2 500 ikke besvart. |
| Nordicspeakers (via Thomas) | Gratis SEO-analyse som lokkevare | Analyse levert, aldri tilbakemelding. |
| Sindre (digitallaering.no) | Gratis fart- og SEO-rapport | "Har ikke budsjett nå". Rettet SSL-feilen selv etter rapporten. |
| Mohamud (regnskapskoden.no) | Gratis sjekk | Svar aldri sendt, forkastet av Helene 22.10. |
| Nardeep (Plantelux) | SEO-rangering for butikk bygget i Hostinger AI Builder | Rapport lovet 09.10, ikke levert, forkastet 22.10. |
| Line (darkisengard.no, kennel) | Administrere WordPress 6.0-side (LiveCanvas) | Begeistret ("akkurat det jeg ser etter"), men sendte aldri materialet. Død 22.10. Spenn 5 700-9 500 + drift 390. |
| William Mason | Bilpleie-nettside + visittkort | Aldri besvart (FB-gruppe, ingen kontaktinfo). |
| Skinbyme | Booking + betalingsterminal + rapportsystem per ansatt | Utenfor fag (POS). Første svar aldri sendt. |
| RS Reklame (Marthe) | Wix til WordPress, B2B-bestilling av profilklær med logo-opplasting | Mockup og plan laget (juni). Ligger i døde. |
| Tommy's Pub | Relansering | Kun mockup. |
| Modum Bad | Kald henvendelse om selvbetjent avbestilling | Ingen svar etter to forsøk. Død 06.10. |
| Kongsberg Gruppen | Kald sondering (IT-konsulent) | Ingen svar. Sannsynlighet lav (rammeavtaler, klarering). |
| NYG, Leonberg, Vaag, Webaas (byråer) | Underleverandørkapasitet | Ingen reell respons. Webaas: e-post blokkert av spamfilter. Leonberg og Vaag svarte ett døgn, så stille. |
| Native (Byamungu) | Underleverandør | Stille 30 dager etter SMS. |
| Per Erik Smith, Per Mazarino (DigiPoint/APEX AI) | Selge Helenes produktportefølje | Per Erik: aldri svar. Per Mazarino: trakk seg selv etter 32 minutter da enerett ble avvist. |

Kilder til henvendelsene (grov telling, ikke eksakt): ca. 15 kom via Facebook-grupper, "ledig kapasitet"-poster og Messenger; ca. 10 fra egen kald prospektering (byråer, Kongsberg Gruppen, Modum Bad); 4 via Håkon/InfoDesk; 2 via Thomas; resten e-post til helene.cloud, naboer (Milan, Unique) og eksisterende kontakter. Facebook gir flest henvendelser men også flest som forsvinner.

---

## 2. Gjengangere: behov og ønsker

### 2.1 "Fast pris, jeg eier alt, ingen binding"
Kongsberg Kjøkkensenter skrev det rett ut: fast engangspris, åpent system, eie alt selv, rimelig uavhengig webhotell, ingen dyre supportavtaler. De avviste byråets 2 200/mnd i 24 måneder. Sjangerguidene bekrefter at frykten for lås-inn og "han som lagde siden forsvinner" går igjen hos restaurant, salong, håndverker og nettbutikk. Lorena og Solomon spurte om delbetaling.
Implikasjon for plattformen: Selg eierskap og forutsigbarhet som kjernen (eksport av alt, domene og kontoer i kundens navn, ingen bindingstid, tydelig totalpris over 1 og 3 år), ikke bare lav månedspris.

### 2.2 Se noe konkret før man kjøper
Kundene kjøper på skisse, demo eller regnestykke. Rapporten fra sjangerguiden (nettbutikk, skjønnhet): "kjøper på noe konkret, ikke på funksjonsliste". Thomas fikk demo-butikk (Nordlys Grafikk) før han sa ja. Hosney fikk mockup. Marthe (RS Reklame) fikk en klikkbar konfigurator-mockup. Helene lager mockup/rapport på eget initiativ, det koster 2-12 timer per lead (vikarbolig 12 t, Hosney 2-3 t).
Implikasjon for plattformen: Generer en ferdig forhåndsvisning av kundens egen side/butikk automatisk fra URL, Google-profil eller Facebook-side, før kunden har betalt noe. Det er den viktigste salgsmekanismen og fjerner den ufakturerte tilbudstiden.

### 2.3 Kunden vil endre priser, menyer, bilder og åpningstider selv, på 30 sekunder
Sjangerguide servering: "Hvis kunden ikke kan endre en pris på 30 sekunder gjør de det ikke". Unique, Kristoffer (Mine favoritter, spesialsider), Kongsberg og Bond Street (enkelt-butikkpanel, "Endre nettsiden") bekrefter. Kristoffer bygget selv sider med Gutenberg og trengte rollebeskyttelse.
Implikasjon for plattformen: Bygg en låst, enkel redigerer (Studio-portal-mønsteret: skjemafelt, ikke fritt design) der kunden ikke kan ødelegge oppsettet, med én kilde for åpningstider, priser og meny som mates til alle steder (side, Google, schema).

### 2.4 Norske betalings- og fraktløsninger
Vipps, Klarna, Stripe, Bring/Posten (Patience, Hellige Ord, Kongsberg, Thomas/Gelato, Fotovegg, RS Reklame). Vipps avslo Helenes ordinære avtale for Bedriftsflyt 06.10 fordi pengene gikk via hennes salgssted: veien er Platform partner med hver bedrifts egne nøkler. Shopify gir ca. 5 % effektiv sats på Vipps (Shopifys 2 % ekstra på Basic). Vipps Checkout selges til Kustom (2026).
Implikasjon for plattformen: Vipps, Klarna og kort må være innebygd og ferdig sertifisert (Platform partner-modell med kryptert nøkkel per kunde), sammen med Bring/Posten/PostNord-etiketter. Utnytt at Shopify koster mer på Vipps.

### 2.5 Å bli funnet lokalt (Google-profil, SEO)
Nesten alle henvendelser handler om synlighet: Plantelux, Sindre, Nordicspeakers, Milan, Luxorstone, Lorena, Mohamud, Richard, Kongsberg (Google Maps). Sjangerguidene: 60-80 % av trafikken for salong går via kart/lokalt søk; Google Bedriftsprofilen er ofte verdt mer enn selve siden. Typiske funn hos kunder: flere H1, manglende LocalBusiness-schema, ingen canonical, PNG-bilder på 1 MB, tom sitemap, manglende alt-tekst, engelsk handlekurv, ingen og:image, utløpt SSL.
Implikasjon for plattformen: Auto-SEO som standard (LocalBusiness-schema, én H1, canonical, sitemap, og:image, alt-tekster, WebP, 301 fra gamle URL-er) og Google-profil-hjelp. Kjør den gratis analysen som lead-magnet (se avsnitt 7).

### 2.6 Hjelp med eksisterende sider (overtakelse, rydding, oppdatering), ikke bare nye
Av 41 saker handler minst 16 om en eksisterende side: Frode, Solo, Line, Richard, Kristoffer, Milan, Luxorstone, Hellige Ord, Plantelux, Sindre, Mohamud, Kongsberg, ment.no, Freberg, Toraderklubben, RS Reklame (Wix). Skjør, gammel WordPress (WP 6.0, WPBakery, Slider Revolution, flere cache-plugins, utløpt SSL) går igjen og er der tiden forsvinner.
Implikasjon for plattformen: Migrering er hovedinngangen. Crawl av eksisterende side, automatisk import av innhold, bilder og URL-er med 301-kart, og rapport om hva som er teknisk gjeld. Støtt Wix, Dandero, Squarespace, WordPress, Shopify, Hostinger AI Builder, Jimdo.

### 2.7 Bransjespesifikke funksjoner (fra sjangerguidene og kundene)
- Restaurant: HTML-meny (ikke PDF), allergener, take away med hentetid og mva-splitt 15/25 %, helligdager, flere steder (Aroi Asia, Milan, Tommy's Pub).
- Salong: booking (kunden bruker Timma/Fixit/EasySalon), prisliste (lovpålagt), ikke bygg bookingmotor selv.
- Håndverker: befaringsforespørsel, prisliste, referanseprosjekter, Google-profil, ofte ingen bilder.
- Nettbutikk: variabler/valg (RS Reklame: logo-opplasting, plassering, antall per størrelse; Fotovegg: størrelse og materiale; Ravn Trevare: mål etter konfigurator), print on demand (Gelato), PCK-synk (InfoDesk), B2B-priser (ment.no, Freberg, RS Reklame), gavekort.
- Kurs/medlemskap: betalingsmur, video, medlemskap (Kristoffer, Sushikurs).
Implikasjon for plattformen: Start med 4-5 bransjepakker (servering, skjønnhet/booking, håndverk, nettbutikk fysiske varer, kurs/medlem) med ferdige seksjoner, integrasjoner og lovkrav, ikke ett generisk byggesett.

### 2.8 B2B-bestilling og kundekonto
RS Reklame, ment.no, Freberg, Fotovegg, Aroi (app), Optimal. B2B-konto, gjenbestilling, avtalepriser, EHF-faktura fra 01.01.2027.
Implikasjon for plattformen: B2B-modul (kundekonto, lagret logo, avtalepris, org.nr-oppslag, EHF/Peppol-faktura) som tilvalg i butikkpakken. Helene har allerede ehf-faktura-plugin (v0.1.3).

---

## 3. Tidstyver

Rangert etter hvor mye tid/penger de faktisk kostet (egne tall der finnes).

### 3.1 Revisjoner og frem-og-tilbake (størst enkeltpost)
Kristoffer: ca. 3 måneder fra tilbud til lansering, 28,8 Claude-timer totalt per 01.10 (7,3 t i september), 521 kr/t hittil. Tilbakemeldinger kom i store bolker (22 punkter, deretter 16 nye samme dag, del 3 og 4 neste dag, fire e-poster 06.10). Helene målte "sticky" tre ganger uten å rulle, og kunden hadde rett hele tiden. En designer (Alex) måtte godkjenne via Discord/Figma, og noen svar kom aldri.
Implikasjon for plattformen: Samle tilbakemeldinger på selve forhåndsvisningen (peker-og-kommenter direkte på elementet med skjermbilde) med nummerering og status, og lås scope per runde. Automatisert visuell test av hver endring (rulle, klikke, mobil) i stedet for manuell verifisering.

### 3.2 Tilbudsarbeid før salg
Vikarbolig 12 t, Hosney 2-3 t, Milan, Plantelux, Sindre, Mohamud, Nordicspeakers: mange gratisrapporter (5-12 t hver for de grundigste), få ble kunder (Sindre rettet SSL selv, Mohamud/Plantelux forkastet). Gratis SEO-analyse gir ingen betalende kunde så langt (0 av 5), men er brukt som lokkevare.
Implikasjon for plattformen: Automatiser analysen (skripter finnes: seo-sjekk, maskinsjekk, sjekk-alt, teknisk-*), la den være selvbetjent for kunden og knytt den til et fastprisforslag generert av timeanslagene.

### 3.3 Innhold fra kunden (tekst, bilder, logo, fakta)
Bilder er den vanligste grunnen til at prosjekter står stille (sjangerguide nettbutikk: "seks uker"). Christian ble spurt om 20+ fakta (åpningstider, bilutleiepriser, garanti, megler-vinkel). Unique og DutchMadeEasy venter i uker på logo/bilder. Thomas leverte full tekst + 25 bilder på dag 0 og fikk siden live på 6 dager: dette er mønsteret når innhold er klart. Luxorstone: 98 av 100 produkter uten pris. Line sendte aldri materialet. Kristoffer sendte aldri portrett til "Hvem er vi".
Implikasjon for plattformen: Innholdsinnsamling må være det automatiserte midtpunktet: veiviser per bransje med korte spørsmål, import fra eksisterende side/Facebook/Google-profil/Brreg, AI-utkast til tekster som kunden bare godkjenner, bilde-opplasting fra mobil med automatisk komprimering (WebP, maks 1600 px, srcset), og automatisk påminnelse. Sett frist i avtalen som flytter lanseringen automatisk.

### 3.4 Tilganger, kontoer og identitet
Kristoffers dev-innlogging "ble borte" fordi tilgangstabellen var tom. Stripe-testnøkler var ubrukelige (MemberPress krever Connect-OAuth). Elementor Pro-aktivering med gjentatt 2FA. Collectors-portal med BankID. Altinn-registrering blokkerer vikarbolig. Kunder sender passord i klartekst (Toraderklubben, ACF/FacetWP-nøkler i Gmail, notatfiler). Domeneshop-meldinger, Plesk-tilgang, Cloudways, ProISP.
Implikasjon for plattformen: Invitasjonsbasert tilgang (OAuth/delegering til Google Search Console, Analytics, GBP, Stripe, Vipps, domeneregistrar), aldri passord. Plattformen oppretter alle tredjepartskontoer i kundens navn gjennom en guidet flyt.

### 3.5 Hosting, DNS, domene
SiteGround: CPU-kvote per kalendermåned (800 000 sek, sperret hele planen 23.08 og 23.09), captcha som ga 500-feil på 19 sider av headless-frontend (24.09), uforklarlige filkorrupsjoner hos Domeneshop (Richard, 31 t). Kjerneoppdatering over nettleser ga lsapi-timeout/hvit skjerm (Kristoffer), Acronis-backup dukket opp 06:30 og ikke 01:53. Domeneshop-pakken for helene.cloud har verken PHP eller MySQL. Delt Plesk-server med 70+ sider. Domenebytte med MX/SPF-risiko (RS Reklame-plan). Tre cache-plugins samtidig (Smartfilm).
Implikasjon for plattformen: Egen driftet infrastruktur med fast utgående IP, og ingen delt-hosting-lotteri. Domeneoppsett (DNS, SPF/DKIM, MX-bevaring) automatisert. Daglige backuper med faktisk gjenopprettingstest og én-klikks rollback.

### 3.6 Plugin-/tema-avhengigheter og oppdateringer
WPBakery som ikke kan oppdateres uten lisens (varsel hver uke siden august), Slider Revolution, Elementor Pro-lisens, ACF Pro, FacetWP, MemberPress-lås. PHP 8.1 EOL. Helene-plugins ble knekt av et tankestrek-sveip (parse error i 6 plugins). En tredjeparts plugin-oppdatering kan stoppe innmeldingen uten at noen merker det.
Implikasjon for plattformen: Unngå plugin-økosystemet. Én kontrollert kodebase med integrerte moduler, og automatiske ende-til-ende-tester av kjøps-/innmeldingsflyten etter hver oppdatering (månedlig testkjøp for betalte medlemssteder og butikker).

### 3.7 Venting på kunden (svar, godkjenning, betaling)
Christian: stille 25.07 til i dag (ikke betalt). Thomas: sluttfaktura 6 uker sent. Vikarbolig: proforma ubetalt siden 23.10. Novaduo kunstbutikk: oppstart "januar eller februar". Hosney, Line, Solomon, Jan S: stillhet. Hubro: møte flyttet to ganger. Kristoffer: godkjenning ligger hos ham 16.09 til 04.10.
Implikasjon for plattformen: Prosessen må ikke kreve kundens synkrone oppmerksomhet. Automatiske purringer, tidsavgrensede forhåndsvisninger, og "ingen bygging før betalt" som porten i selve systemet.

### 3.8 Kunnskapsbygging per bransje og regelverk
Sjangerguidene (338 KB), GDPR-research (65 KB), sikkerhet (102 KB). Hver nye bransje krever research på nytt (vikarbolig: helsejuss, angrerett, rapporteringsplikt).
Implikasjon for plattformen: Bransjepakkene bærer juridisk innhold (kjøpsvilkår fra Forbrukertilsynets mal, personvern, angreskjema, prisopplysning, før-pris-regler) som maler som oppdateres sentralt når regelverket endres.

### 3.9 Timeførsel og lav reell timepris
Sept 2026: Suntex 254 kr/t, Sjakktrening 521 kr/t, Bond Street ca. 400 kr/t, Aroi Asia-tilbud ca. 200 kr/t. Eksisterende, skjør WordPress-side er der det dukker opp ting underveis. 39 timer av 60 ble ikke ført.
Implikasjon for plattformen: Det er arbeid på overtatte eller skreddersydde sider som koster mest. Nye sider fra mal (Sushikurs: 6 dager, 6 t) har best marginer. Plattformen bør tjene penger på nybygg fra mal, og ha migrering som egen prisat tjeneste.

---

## 4. Typiske problemer

### 4.1 Sen eller manglende betaling
Christian (35 000, ikke betalt, inkasso), Thomas (sluttfaktura ca. 6 uker over opprinnelig forfall), vikarbolig (proforma forfalt 23.10), Novaduo kunstbutikk (oppstart betinget av avdrag 1). Kristoffer og Richard betaler til forfall. Egne regler ble i praksis brutt der kunden allerede hadde alt: Christian fikk wp-admin samme dag som fakturaene gikk ut, og Thomas gikk live og markedsførte før sluttfaktura var betalt. Regelen "domenet pekes ikke om før sluttfaktura er betalt" er vanskelig å håndheve når kunden eier domene og hosting selv.
Implikasjon for plattformen: Plattformen skal holde publiseringen/domenekoblingen til betalt (kunden eier alt, men tjenesten er låst til faktura er betalt). Innebygd faktura, påminnelser og inkassovarsel (og EHF fra 2027). Forskudd som standard under 10 000.

### 4.2 Scope creep og ufakturert ekstraarbeid
Suntex-krise (31 t utenfor avtalen), FAQ gikk inn i prisen, gratis tillegg uten definisjon (vikarbolig-statistikk), gratis ConsentPilot-jobb, "og du er fornøyd"-klausul gir åpen sluttfaktura (Solomon). Kristoffer ba om flere nye ting underveis (PHP, partilenker, repetisjonsoppgaver) som ble timejobber. Mockup viste funksjon som lå utenfor fastprisen (geolokalisering).
Implikasjon for plattformen: Fast og synlig omfang per pakke, tilvalg med pris, endringsforespørsel med automatisk estimat, og en objektiv definisjon av "levert" (publisert + punktene på plass).

### 4.3 Tekniske feil som kunden oppdager før deg
Kristoffer fant at repetisjonsoppgaver lå åpne uten innlogging (feil fra flytting), at sticky aldri virket, døde PGN-lenker. Suntex viste rå kortkoder mens HTTP sa 200 (helsesjekk måtte måle synlig tekst). Patience: kunder ga opp i kassen etter forlatt-kurv-e-poster. Luxushair: bot-teori feil blokkerte ekte kunder, GA4 viste ~0 pga samtykke.
Implikasjon for plattformen: Overvåking som måler synlig tekst, kjøpsflyt og tilgangsstyring utlogget (curl uten innlogging), ikke bare HTTP-status. Kjør før og etter hver publisering.

### 4.4 Sikkerhet
Hacket WordPress (Toraderklubben via wp-file-manager, Domeneshop sperret), korrupte filer og mistenkt malware (Suntex/Smartfilm), brukernavn lekker via wp-json (Luxorstone), skjult spam-lenker i kommunal side (Furumo), WP 6.0, PHP-RCE (okt 2026), Railway-hendelse (nøkler), passord i klartekst hos kunder og i egne notater.
Implikasjon for plattformen: Secure by default (ingen eksponert wp-json/brukere, ingen filbehandler-plugins, rate limiting, honeypot/Turnstile, sikkerhetsheadere, WAF) og automatisk nøkkelrotasjon.

### 4.5 Juss og regelverk som kunden ikke vet om
Samtykke/Consent Mode v2 for Google Ads, selger må stå i vilkår selv om kunden ikke vil nevne den (Sushikurs), forlatt-kurv-e-post krever aktivt samtykke (mfl. § 15), Klarna Checkout skjuler e-posten for plugins, angrerett (12 måneder uten skjema), falske førpriser (LuxusHair: Forbrukertilsynet), auto-capture på fysiske varer, mva-regler ved POD i utlandet, allergenopplysning, Helsetilsynet og før/etter-bilder, prisliste på nettsiden er lovpålagt, e-faktura 01.01.2027.
Implikasjon for plattformen: Regelverk som innebygd produkt (kjøpsvilkår, personvern, samtykkeboks i kassen, prishistorikk for kampanjer, angreskjema), med en sentral "regelverksradar" som oppdaterer alle kunder.

### 4.6 Plattform- og integrasjonsbegrensninger
Dandero (Milan: lukket plattform, må endres via dem), Hostinger AI Builder (Plantelux: engelsk handlekurv, dårlig fart), Wix (RS Reklame: ingen ren eksport), AI-generert Next.js på Vercel uten at eier har koden (Lorena), Weglot, PCK som overskriver alt (ment.no, "PCK styrer alt"), Shopify-opprydding (Montez), Domeneshop uten PHP.
Implikasjon for plattformen: Ikke bli en ny lukket boks. Tilby åpen eksport, tydelig eierskap til kode og data, og innebygde adaptere (kassesystem som PCK, Fiken, Tripletex, Timma, EasySalon, Cal.com).

### 4.7 AI-generert innhold og bilder
Egen regel: genererte bilder krever Helenes enkeltvise godkjenning (kan vise feil produkt, feil verktøy, lokale som ikke finnes). Null AI-spor i tekst. Lorenas side var bygget med AI og eieren hadde ikke koden. Tankestrek-sveip knakk kode.
Implikasjon for plattformen: AI-generering er med, men med godkjenningssteg per bilde/tekst, merking av AI-kilde, og en "anti-AI-spor"-sjekk på tekst. Bilder fra ekte fotografier prioriteres for fysiske produkter.

### 4.8 Egen kapasitet og oppfølging
Minst 4 av 22 døde leads døde fordi Helene ikke rakk eller ikke fikk sendt første svar eller lovet leveranse (Skinbyme og William Mason aldri besvart, Mohamud-svaret aldri sendt, Plantelux-rapporten lovet 09.10 men ikke levert). Sveipene fant gjentatte ganger "første svar ikke sendt". Mange rutiner (50 ble 16). Telefonskrekk: alt må kunne løses skriftlig. Kald e-post til byråer ble blokkert av spamfilter (550 5.7.1).
Implikasjon for plattformen: Første svar innen minutter, automatisk, skriftlig; alt i systemet kan løses uten telefon (kunden velger chat, e-post eller video).

---

## 5. Det som har fungert

### 5.1 Pris- og betalingsstruktur
- Tilbud sendes først etter praten (som e-postrunde/video) med spenn først, fastpris etter. Kongsberg Kjøkkensenter er et eksempel: e-postrunde med fire spørsmål, pris låst 9 900 innen ett døgn, kunden svarer samme dag.
- Under 10 000: 100 % forskudd. Over: 40 % à konto. Kristoffer (15 000 à konto betalt dagen før forfall) og Richard betalte. De to gangene unntaket 50/50 ble brukt under 10 000 (Solomon, Thomas) ble det problemer med andre halvdel eller saken døde.
- Pakker med custom-alternativ (nettbutikk Liten 19 900 / Standard 24 900 / Utvidet 34 900 / fra 49 000) og tre driftsnivå (299/390/590). Kunden ser rett og slett hva det koster over tid.
- Bonus-/suksesshonorar bare med skriftlig definisjon og innebygd teller (vikarbolig).
- Driftsavtale signert ved e-postaksept med versjonsnummer og SHA-256 (Richard, 23.10).
Implikasjon for plattformen: Kopier pakke-/driftsstrukturen. Innebygg betalingsporten og elektronisk aksept med versjonering.

### 5.2 Gjenbruk og startsett
- WP-STARTSETT (install.sh, install-woocommerce.sh, hardening-mu-plugin): ny WordPress-site settes opp på ca. 5 minutter. Starter Shop (Blocksy child): 10 bransjepatterns, 29 plugins, mva/frakt/kontaktskjema via WP-CLI på ca. 2 minutter, klonbar ("kunde #2+").
- Gjenbruk av egen kode halverte vikarbolig-estimatet (150-250 000 til 93 000). Bedriftsflyt MVP ble bygget på 3 aktive dager.
- Bond Street-startpakken (flatsome-child, enkelt-butikkpanel, kartleggingsskript, dokumentskript) skal gjenbrukes for ment.no, Freberg.
- Ferdige maler for personvern, vilkår, bruksanvisning, leveranse-e-post, tilgangsforespørsel, revisjonspanel (12 områder).
Implikasjon for plattformen: Plattformen er i praksis kodifisering av dette. Start fra Starter Shop og WP-STARTSETT-logikken (hardening, standardstack, norske standardverdier).

### 5.3 Målbare resultater som selger
Suntex: videovekt 45,7 til 12,1 MB (-73 %), forsidevideo 15,1 s til 1,4 s, alt-tekster 58 av 58. Bond Street: toppbilde 240-456 kB til 26 kB på mobil. Før/etter-målinger i PageSpeed dokumenteres. Patience 5 stjerner.
Implikasjon for plattformen: Vis målt fart, SEO-poeng og tilgjengelighet som dashboard for kunden, og bruk før/etter som markedsføring.

### 5.4 Prosess og sikkerhet
- Tilganger kun via Bitwarden Send eller kundens egen bruker. Kunder merker forskjellen.
- Domene i kundens navn, alle tredjeparts kontoer i kundens navn (Vercel, Supabase, Sentry, Vipps, Stripe).
- Standardstack for betalt kundeprosjekt: Netlify/Cloudflare Pages, Neon, Cloudflare R2, Better Stack, Cloudflare Web Analytics (ingen cookiebanner nødvendig), Brevo. Kostnad 0-20 USD/mnd. Vercel Hobby er forbudt for kundearbeid.
- UptimeRobot (ikke Claude-rutiner hver time).
- Skriftlig først, video som alternativ.
- Anmeldelse dag 21-30, aldri i leveranse-e-posten og aldri hos kunde som skylder penger.
Implikasjon for plattformen: Behold denne driftsstacken og reglene som standard i produktet.

### 5.5 Kundetyper og kanaler som ga resultat
- Beste betalende kunder: små virksomheter med klart behov, raske svar og kontakt direkte (Kristoffer, Thomas, Richard, Tommy). Responstid: "fart slår alt annet".
- Underleverandørkanal: Håkon/InfoDesk ga fire nye oppdrag på tre uker, kjent kunde-/forhandlernettverk. Hovedargument som virket mot byråer: "dere beholder kundeforholdet, jeg bygger", og custom-plattform fremfor WordPress.
- Anbefalinger i lokalmiljø (Unique, Milan, Luxorstone, Kongsberg).
- Pilot: Richard som første pilot for Team Tavla.
Implikasjon for plattformen: To kanaler: direkte til småbedrifter (lokalt, anbefalinger, Facebook) og via byråer/forhandlere med white-label.

### 5.6 Kjente suksessdetaljer verdt å kopiere
- Kvalitetsportene (kvalitetssjekk, revisjonspanel, WP-startsett-sjekkliste, testrutine før lansering, agentbasert testing).
- UTM/GA4-konfig, consent mode v2 via ConsentPilot.
- Cloudflare Turnstile mot spam i skjema.
- E-postkonto per skjema, FluentSMTP.
- Rolle-lås og fire-lags tilgang for MemberPress.
Implikasjon for plattformen: Gjør portene til automatiske tester som må passere før publisering.

---

## 6. Hvorfor leads dør

Fordeling av de 22 døde/halvdøde (grov, kategoriene overlapper og tallene er mine vurderinger av notatene):

| Årsak | Antall | Eksempler |
|---|---|---|
| Stillhet etter svar/tilbud fra Helene | ca. 6 | Solomon, swajet, Jan S, Line (sendte aldri materialet), Per Erik Smith, Native |
| Kald prospektering uten respons (byråer, offentlig, konsern) | 6 | NYG, Leonberg, Vaag, Webaas (spamfilter), Modum Bad, Kongsberg Gruppen |
| Helene svarte ikke, svarte ikke ferdig eller leverte for sent | minst 4 | Skinbyme, William Mason (ingen kontaktinfo), Mohamud, Plantelux |
| For dyrt (uttalt eller antatt) | 3 | Bareksten ("den ble for dyr"), Solomon (11 000, så 9 000), Montez (avslått, grunn ikke notert) |
| Valgte konkurrent | 1 | Frode |
| Ikke budsjett | 1 | Sindre |
| Utenfor fag/modell | 3 | Skinbyme (POS), Per Mazarino (enerett/white-label), Jan S (provisjon) |
| Gratisrapport uten betalingsvilje | 4 | Sindre, Mohamud, Plantelux, Nordicspeakers (analysen ble levert uten oppfølging) |

Mønstre:
- Pris er sjelden uttalt grunn. Folk forsvinner heller enn å si nei. Sjangerguiden sier at det kunden sier om hvorfor de tapte nesten aldri stemmer.
- Tid og likviditet (Solomon, Thomas) rammer sterkere enn pris. Å senke prisen under 10 000 doblet startbeløpet siden det utløste 100 % forskudd.
- Gratisarbeid gir ikke kunder av seg selv (Sindre fikset SSL og forsvant).
- Tidspunkt: håndverkere har ikke tid mai-september, lavsesong passer bedre (Jan S).
- Kunden vet ikke hva de vil ha ("sjekk alt", "vet ikke hvordan den er laget").
- Sakene som lever har tidlig kontakt, raskt svar og konkret pris etter kort runde (Kongsberg Kjøkkensenter: pris 9 900 innen ett døgn, kunden svarer samme dag).

Implikasjon for plattformen: Fjern behovet for å "overtale". Gi pris og forhåndsvisning umiddelbart, selvbetjent, med betaling og oppstart i samme flyt. La leads som forsvinner automatisk få en kort, vennlig påminnelse (maks to, jf. egen kadens) og en billigere/enklere variant. Mål dropout per steg (mockup sett, pris sett, betalt).

---

## 7. Eksisterende egne ressurser og tidligere idearbeid

### 7.1 Produkter og ideer som overlapper med plattformen

| Ressurs | Status | Relevans for plattform |
|---|---|---|
| SEO-analyse (gratis, 15c i prosjekt-os; STARTSETT med rapportmal + sjekkliste; skript seo-sjekk, maskinsjekk, teknisk, sjekk-alt, eksponering) | Fungerer med Ahrefs/GSC/Brand Radar. Alltid gratis, timeanslag summeres til tilpasset fastpris. Plan for FB-post (maks 5 om gangen) | Lead-magnet og diagnosemotor. Kan automatiseres som selvbetjent URL-sjekk. |
| Sikkerhetssjekk for bedrifter (nivå 1 7 900, nivå 2 fra 29 000, nivå 3 fra 69 000; pilot 3 950; maler for rapport, fullmakt, attest) | Forsikring bekreftet av If 04.09. Salgsrunde 16.09 til tre. Svar innen 30.09, deretter legges bort | Kan bli en automatisk sikkerhetsrapport per kundeside. |
| Markedsplan (4 900 / 9 900), intern til eksisterende kunder først (dag 30) | Ikke på nettsiden med vilje | Tilleggstjeneste i plattformen. |
| Studio-portal (Next.js + Prisma + Neon + iron-session + Octokit; kunden redigerer skjema, "Publiser" committer til GitHub, Netlify bygger) | Live på portal.helene.cloud; Unique er første kunde; admin-UI for nye sider/brukere | Nærmeste eksisterende kjerne for kunde-redigering og multi-tenant. |
| Bestilly (bestilly.no): booking, onepage per bedrift, nettbutikk (Vipps manuelt), blogg, nyhetsbrev, AI-markedsføringshub, auto-lokal-SEO, regnskapseksport. 990/år, Next.js 16 + Drizzle + Neon + Railway | Teknisk ferdig, ingen betalende kunder. Vipps er kun tekst (rettet 27.08) | Nesten en miniplattform. |
| Kundebox / Bedriftsflyt (389 kr/mnd inkl. mva): Vipps Login live, ePayment/recurring ferdig kodet, Stripe-abonnement, AI-chat (Claude), bildeopplasting | Vipps avslo ordinær avtale 06.10; Platform partner-sporet startet (testskjema sendt) | Betaling, auth og abonnement er gjenbrukbare. Platform partner-modellen er veien for en plattform. |
| LuxusLengths / froya-shop (Next 14 + Prisma + Postgres, 15 700 linjer): kurv, kasse, ordre-API, 17 adminseksjoner, frakt, fraktlapp-PDF, Google Shopping- og Meta-feed. Betaling er mock, null tester | Eksempelprosjekt, ikke live | Butikkens kjerne. Mangler Vipps-kobling, Bring-booking, tester. |
| Ravn Trevare (referansebutikk, Next.js + Prisma): konfigurator med regelmotor (regler som data), generert favicon/delingsbilde/sitemap | Under bygging (fiktiv kunde, demo) | Differensiator mot Shopify og mal-bygde butikker. |
| Starter Shop Blocksy child + WP-STARTSETT | Verifisert på SiteGround | Mal- og provisjoneringslogikk. |
| Plugins (PLUGINS-byhelene): ConsentPilot (WP.org, Consent Mode v2 i Pro), Honest SEO, Open Live Chat, WhenPilot/Booking Light (booking), Enkel Fraktlabel (Mybring), Profit by Source, PCK-butikk tilpasninger, Enkelt butikkpanel, EHF-faktura (v0.1.3) | Flere live, noen på WP.org | Moduler som kan porteres. |
| ByggPilot (B2G og Proff 990/mnd), Sakspilot (workspace SaaS, iCal-generator), Team Tavla, Fristpilot, CodeMedic (meldingssystem), Turpilot (geolokalisering), aioptimalisering.no (gratis AI-analyse som lead magnet) | Ulike statuser. Fire produkter mangler første kunde. | Mønstre: multi-tenant, rolle, AI. |
| Startsett for byrå: UNDERLEVERANDOR-EPOSTER/KONTAKT (9 byråer) | Gruppe A sendt 29.08 | Salgskanal. |
| PCK-guide (intern), Bond Street-pakken | Brukbar for flere PCK-butikker | Kassesystem-synk som modul. |

### 7.2 Tidligere research (ide-research-usa-norge-okt-2026, 18.10)
- Hovedkonklusjon: flaskehalsen er salg, ikke ideer eller bygging. Fire ferdige produkter har ingen betalende kunde (ByggPilot Proff, Kundebox, Fristpilot, Team Tavla).
- Anbefalt rekkefølge: 1) tjenester som selges skriftlig nå, 2) "E-faktura-klar 2027" (EHF/Peppol påbudt fra 01.01.2027 mellom bokføringspliktige), 3) én US-ide bare etter betalt test. Beste US-ide: "Svar-først" for håndverkere (missed-call-SMS, AI-prisanslag, tilbudsoppfølging, anmeldelse). Stopp-kriterium: under 5 forhåndsbetalte av 30 kontaktede.
- Runde 2 (67 kandidater): alle 5 toppkandidater motbevist av norske konkurrenter. Lærdom: målrettet norsk søk finner nesten alltid noe.
- FRARÅDET: nettside-abonnement uten startpris (mettet 799-1 490/mnd), anmeldelsesverktøy, AI-telefonsvarer/GoHighLevel, rank-and-rent, NIS2/AI Act/CSRD/EAA.
- Begrensning: Ahrefs/HYPD ga "Insufficient plan", ingen søkevolum/CPC.
Implikasjon for plattformen: Bare konkurrere i "nettside-abonnement" er frarådet av egen research; plattformen må ha en startpris/eierskap/automatisering som skiller seg, eller kombineres med det som faktisk selger (e-faktura, Svar-først, SEO, sikkerhet).

### 7.3 Konkurrentpriser som Helene allerede har kartlagt (sjangerguidene, aug 2026)
- HjemmesideHelten: 9 990 / 24 990 / 34 990 + drift fra 1 580/mnd.
- Webaas: 940/mnd alt inkludert, 5-7 virkedager. Acendia: 990/mnd, ferdig på 24 timer. Webfront: fra 999/mnd. Medcom: 699/mnd leie, 1 199/mnd med eierskap etter 24 mnd, eller 24 900 for full eierskap.
- DevAI: fra 18 000. Webagent: fra 1 740/mnd. Finn.no-annonse: 5 000 for tre sider + 500/mnd drift.
- DIY: Timma Genie 200/mnd, EasySalon EasyPages 149/mnd, Wix/Squarespace 150-500/mnd.
- Nettbutikk: Shopify Basic 389 kr/mnd + 2 % ekstra på Vipps; Mystore 1 398-5 498/mnd; Woo 150-400 hosting + Fraktvalg 399 + Fiken 119-319.
- Markedet: frilanser 5 000-25 000 engangs, byrå 15 000-50 000, drift 1 000-5 000/mnd.
- Helenes egne priser: One-page 5 500, enkel nettside fra 6 500, nettbutikk 19 900 / 24 900 / 34 900 / fra 49 000, timepris 950, drift 299 / 390 / 590.
Implikasjon for plattformen: Et pristrinn med startpris 5-10 000 pluss drift 300-600/mnd og full eierskap kan underby Medcom/HjemmesideHelten i totalkost. Abonnement uten start konkurrerer med 6+ aktører.

### 7.4 Andre pekere
- Nettside24-forslaget fra Christian Bakke (JV): "mal-nettsider på 24 t". Helene vurderte at det bare er lønnsomt ved volum og reell automatisering, og at det er i praksis Studio-portal-konseptet. Ikke inngått.
- Salg av portefølje (Per Erik Smith, Per Mazarino) viste at hun bygger godt men mangler salg/distribusjon.
- Prosjektfokus-notatet (feedback_focus): scope creep mellom BrandStudio, Bestilly, KreativKlar og andre. Nytt prosjekt bør starte smalt.

---

## 8. Implikasjoner for plattformen (samlet, prioritert)

Rekkefølge: Må ha for å fungere (A), Må ha for å vinne (B), Gir vekst (C), Bør vente (D).

### A. Må ha for å fungere

1. **Eierskap og uavhengighet som produktløfte.** Domene, hosting-konto og alle tredjepartskontoer står i kundens navn. Full eksport (innhold, kode, bilder, kundeliste, bookingdata). Ingen binding, én måneds oppsigelse. Vis totalpris over 1 og 3 år mot konkurrentene. Kilde: avsnitt 2.1, 4.6.
2. **Betaling før bygging og før lansering, innebygd i flyten.** Forskudd som standard under 10 000, 40 % over; ingen publisering/domenekobling før sluttfaktura er betalt. Elektronisk aksept med versjonsnummer. Faktura, purring og EHF (fra 01.01.2027) i systemet. Kilde: 4.1, 5.1.
3. **Automatisk innholdsinnsamling (kjernen som fjerner tidstyven).** Bransjeveiviser med korte spørsmål, import fra eksisterende side/Google-profil/Facebook/Brreg, AI-utkast kunden godkjenner, bildeopplasting fra mobil med automatisk komprimering, påminnelser og frister som flytter lansering automatisk. Kilde: 3.3.
4. **Forhåndsvisning før betaling.** Automatisk generert side/butikk fra kundens URL/Google-profil som demo-lenke. Erstatter 2-12 timers ufakturert tilbudsarbeid. Kilde: 2.2, 3.2.
5. **Migrering som hovedinngang.** Crawl + import + 301-kart + teknisk gjeld-rapport. Støtt Wix, Dandero, Squarespace, WordPress, Shopify, Hostinger AI Builder, Jimdo. Kilde: 2.6.
6. **Norsk betaling og frakt innebygd.** Vipps (Platform partner, hver kundes egne nøkler, kryptert), Klarna, Stripe, Bring/Posten/PostNord-etiketter, mva-satser (15/25 %, POD), norske kjøpsvilkår (Forbrukertilsynets mal), angreskjema, prishistorikk for kampanjer, samtykke til forlatt kurv. Kilde: 2.4, 4.5.
7. **Compliance som standard.** Cookie-samtykke med Consent Mode v2 (eller cookie-fri analyse), personvern, selger i vilkår, tilgjengelighetserklæring, allergen- og prisliste-felt der bransjen krever det, regelverksradar som oppdaterer alle kunder sentralt. Kilde: 4.5.
8. **Sikker og vedlikeholdsfri drift.** Ingen plugin-økosystem eller delt hosting-lotteri. Automatiske oppdateringer, daglig backup med faktisk gjenopprettingstest, rollback, oppetid og helse-sjekker som måler synlig tekst og kjøpsflyt, ikke bare HTTP 200. Egne tester utlogget for betalingsmur. Kilde: 3.5, 3.6, 4.3, 4.4.
9. **Låst kunde-redigerer.** Skjemabasert redigering (Studio-portal), rolle- og tilgangsstyring, én kilde for åpningstider/priser/meny. Kilde: 2.3.
10. **Invitasjonsbasert tilgang, aldri passord.** OAuth/delegering mot Google (Search Console, Analytics, GBP), Stripe, Vipps, domeneregistrar. Kilde: 3.4.

### B. Må ha for å vinne mot konkurrentene

11. **Bransjepakker i stedet for generisk byggesett.** Servering (HTML-meny, allergen, take away, helligdager), skjønnhet (booking via Timma/EasySalon/Cal, prisliste, GBP), håndverk (befaring, referanser), nettbutikk fysiske varer (varianter, POD, PCK-/Fiken-synk, B2B), kurs/medlem (betalingsmur, video). Kilde: 2.7.
12. **Auto-SEO og lokal synlighet.** LocalBusiness-schema, én H1, canonical, sitemap, og:image, alt-tekst, WebP, schema.org, Google Bedriftsprofil-hjelp og automatisk SEO-analyse som selvbetjent lead-magnet. Kilde: 2.5, 5.3.
13. **Målbare resultater i kundeportalen.** Fart, SEO og tilgjengelighet før/etter, trafikk og kilder (Profit by Source-ideen for butikk). Kilde: 5.3.
14. **Revisjonspanel/QA som automatiske porter.** Mobil, lenker, skjema, samtykke, hastighet, tilgjengelighet, AI-spor i tekst; ingen publisering uten grønt. Kilde: 5.6, 4.7.
15. **Strukturert tilbakemelding på forhåndsvisningen.** Pek og kommenter, nummerert, med status og rundegrense, for å bryte revisjonsspiralen. Kilde: 3.1.
16. **Fast scope og endringsflyt.** Pakke med synlig omfang, tilvalg med pris, endringsforespørsel med auto-estimat, objektiv "levert"-definisjon, supportgrense (teknisk drift, ikke kundeservice for kundens kunder). Kilde: 4.2.

### C. Gir vekst

17. **Byrå-/forhandlerkanal (white-label).** Multi-tenant byråkonto, API, per-side-fakturering, byrået beholder kundeforholdet. Designbyråer uten utvikler treffer vegg på nettbutikk. InfoDesk-modellen (PCK-forhandler) viser at forhandlerkanal gir flere oppdrag. Kilde: 5.5.
18. **Hurtigsvar og skriftlig oppfølging.** Første svar innen minutter med spenn, forhåndsvisning og lenke til videre skritt; maks to oppfølginger; ingen telefon nødvendig. Kilde: 4.8.
19. **Anmeldelse og tilbakemelding på riktig tidspunkt.** Dag 21-30, aldri hvis kunden skylder penger, aldri belønnet. Kilde: 5.4.
20. **Tilleggstjenester.** Markedsplan (4 900/9 900), sikkerhetssjekk (7 900), e-faktura/EHF, AI-markedsføring, nyhetsbrev, booking, chat. Kilde: 7.1.
21. **Prismodell.** Startpris + lav drift (299-590) + valgfri eierskapsvariant, fremfor ren lavpris-abonnement (mettet). Vurder klippekort for endringer (10 t = 8 550). Kilde: 7.2, 7.3.

### D. Bør vente eller utenfor scope

22. Egen bookingmotor for salonger med flere ansatte (integrer heller Timma/EasySalon/Cal). Kilde: sjangerguide skjønnhet.
23. POS/betalingsterminal og rapportsystem per ansatt (Skinbyme).
24. Komplekse markedsplasser med utleie, iCal-synk og verifisering (vikarbolig) og andre skreddersydde plattformer: behold som tjeneste, ikke produkt.
25. Å love Google-plassering. Lov aktivitet og rapportering.
26. Kjede-/multisite med dynamisk bestillingslogikk (Aroi Asia) bør være tilleggsmodul, ikke kjerne.
27. Scope creep: velg én plattformmodell, ikke fold inn BrandStudio, Studio-portal, Bestilly, Kundebox og Team Tavla samtidig.

Stoppkriterium fra egen research som bør brukes også her: under 5 forhåndsbetalte av 30 kontaktede på 4 uker er signal om at salg, ikke bygging, er problemet.

---

## Hva jeg kunne og ikke kunne lese

Kunne lese (helt eller delvis):
- PIPELINE.md, DRIFTSKUNDER.md, tidsgjennomgang.md, Leads-oppfolging.xlsx (alle 47 rader, kolonner for lead, medium, hva det gjelder, status, kilde).
- Alle 22 SAK.md i "Døde eller halvdøde Leads" (logg/notater-seksjoner, ikke hele malteksten), karboguide/tommyspub/rs-reklame-README og planer, MELDTIL-PER-ERIK.
- De fleste SAK.md i "Åpne leads" (Milan, Hosney, Kongsberg Kjøkkensenter, Lorena, Modum kommune, Novaduo, Prege, Pål, Synlig Studio, Hubro, Freberg, ment, vikarbolig topp ca. 8 500 tegn).
- "Kundeprosjekter under arbeid": Christian Bakke (SAK + oversikt + innholdsepost), Thomas Dahlberg (SAK + TODO, med passord ikke notert), Richard (SAK-2 og sammendrag og mønsterseksjonen i SAK.md), Kristoffer (status, scope, penger, driftsforslag, sticky-lærdom, utvalgte logger, overskrifter).
- Ferdige kunder: Torjussen/Posuva SAK, Patience SAK, dutchmadeeasy og unique-hair-beauty README, topp av Ane-notatet (sensitivt, ikke gjengitt).
- Claude-minne (C--Users-helen-Desktop/memory): MEMORY.md og ca. 35 filer lest helt eller delvis, bl.a. nettbutikk-plattform-egne-deler, ide-research-usa-norge-okt-2026, markedsplan-internt-forst, prismodell-og-timepriser, gjenbruk-kode, infrastruktur-valg, leveransestandard, portefolje-og-referanser, portefoljestatus, seo-analyse-produkt, sikkerhetssjekk, ravn-trevare, thomas-dahlberg, siteground-*, Håkon/InfoDesk/Aroi/PCK, driftsavtale, anmeldelse, passordoverlevering, tilbud-etter-prat, skriftlig-forst, wp-startsettet, vipps-partner, ehf-faktura, handlekurv. Fra byggpilot-node-minnet: hele MEMORY.md-indeksen og 16 prosjektfiler (Studio-portal, Bestilly, Unique, DutchMadeEasy, Toraderklubben, Fotovegg, Patience, Elantra, Solo Renhold, aioptimalisering, ConsentPilot, Enkel Fraktlabel, plugin-distribusjon, Nettside24, salg av portefølje, feedback_focus). Luxushair- og Talentflyt-minnenes indekser.
- _OS-RAAMATERIALE: _oversikt, overskrifter for fire sjangerguider og utvalgte seksjoner (kundeprofil, pris, integrasjoner, fallgruver) for nettbutikk, skjønnhet, servering og håndverk; første del av vinn-oppdraget.
- Kodeoversikt: mappelister for Andreprosjekter-og-annen-kode og PLUGINS-byhelene/dist; README for REPRO-NETTBUTIKK (Starter Shop), studioportal-og-leads, Bestilly, Bedriftsflyt, ehf-faktura, enkelt-butikkpanel, teamtavla; SIKKERHETSSJEKK-TILBEDRIFTER/SAK.md; FB-post, Innleggslogg og Melding-til-Domeneshop.

Kunne ikke eller bare delvis lese:
- De fire kjempefilene SAK.md for Richard (540 KB), Kristoffer (268 KB), Håkon/Bond Street (142 KB) og vikarbolig (123 KB) ble bare skumlest (toppstatus, overskrifter, utvalgte seksjoner). Detaljer om enkeltdager mangler.
- Sjangerguidene for kurs/medlem, markedsplass, profesjonelle tjenester, reiseliv/forening og helse er ikke lest. gdpr.md, sikkerhet.md, ferskhet.md, etterfolging-og-omtaler.md og veien-videre-pakken.md er ikke lest, bare filstørrelser og overskrifter.
- PDF-rapportene (Ideer-USA-vs-Norge, runde 2, SEO-rapportmal, sikkerhetssjekk-maler) er ikke åpnet. Innholdet er hentet fra minnefilen og SAK-notatene.
- Hele Håkon-mappen (SAK + meldinger + teknisk beskrivelse for Aroi) ble ikke lest, kun minnefilene om dem. Kildekode er ikke lest (bare README-er og mappenavn).
- Gmail, Messenger og regnearket Timeforing.xlsx er ikke tilgjengelig. Regnskapsarket er ikke lest, så tall for omsetning og antall fakturaer er indirekte.
- Mapper nevnt i PIPELINE som "levert, ikke aktive" (Steinar/Fotovegg, Playevent) finnes ikke i Kunder-ferdig-mappen. Noen kunder har dermed bare minnefil, ikke saksfil.
- Passord, nøkler, kontonumre og kundekontaktinfo ble sett i enkelte notater og filer (Ane-filen, Thomas-TODO, Kristoffer-lisenser) men er ikke kopiert hit. Det er selv et funn: kundenes og egne notater inneholder tilganger i klartekst (se 3.4).
