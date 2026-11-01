# Frakt med Bring

Kort utviklerdokumentasjon. Skrevet 01.11.2026.

## Hva som finnes

- **Oppsett i studioet:** Innstillinger, Frakt med Bring (`/studio/nettsted/<id>/innstillinger/bring`). Butikken kobler sin egen Mybring-konto: Mybring-bruker (e-post), API-nøkkel og kundenummer, i testmodus eller produksjon. Nøklene testes med en prisforespørsel før Bring vises i kassen. Bare eieren kan endre (samme regel som Vipps og Klarna). Tilkoblingstester er begrenset med `hit()` (20 i timen per butikk).
- **Fraktvalg:** butikken velger tjenester (3584, 5800, 5600), en fast reservepris per tjeneste, avsenderadresse, vanlig pakkestørrelse og om pakkene leveres på postkontor eller i Post i Butikk.
- **Kassen:** Bring-valgene kommer etter butikkens faste fraktvalg. Prisen hentes fra Shipping Guide for handlekurvens vekt og kundens postnummer, med butikkens avtalepris (netPrice) når Bring gir den. Valg pakken er for tung for, vises ikke.
- **Låst pris:** `createOrder` regner ut frakten på nytt på serveren og lagrer den på ordren. En pris fra nettleseren brukes aldri. Kassen sender med prisen kunden så (`seenShippingOre`), bare som kontroll: er den en annen, stoppes bestillingen og kassen viser ny pris.
- **Reservepris:** svarer ikke Bring (nett, 4xx, 5xx, tidsavbrudd på 8 sekunder), eller mangler minst én vare vekt, brukes butikkens reservepris. Kassen stopper aldri.
- **Egne regler:** gratis frakt over et beløp og rabattkoder med fri frakt gjelder også Bring, og da spørres ikke Bring.
- **Etikett:** ordresiden har «Lag fraktetikett hos Bring» for betalte (og sendte) ordre med adresse. Alle med tilgang til butikken kan bruke den, som «Marker som sendt». Sendingsnummeret lagres som sporing med `setTracking` (transportør `posten`). PDF-en lagres i mediefillageret og lastes ned fra `/studio/nettsted/<id>/ordre/<ordre>/etikett`, som krever innlogging med tilgang til butikken. Samme ordre kan ikke bestilles to ganger.
- **Vekt:** `products.weight_grams` (ny, migrering 0011) er vekten for hele varen. `product_variants.weight_grams` (fantes fra før) er variantens egen vekt og går foran. Varer uten vekt kan fortsatt selges.

## Filer

| Fil | Hva |
|---|---|
| `lib/bring/products.ts` | Tjenestene, navn og vektgrenser (ren, også i nettleseren) |
| `lib/bring/state.ts` | Skjema for `sites.shop.bring` og det kassen får (ren) |
| `lib/bring/crypto.ts` | AES-GCM med egen HKDF-etikett (`nettgata-bring`, `bring-nokler-v1`) |
| `lib/bring/client.ts` | Kallene til Shipping Guide og Booking, og lesing av svarene |
| `lib/bring/config.ts` | Lagre, teste og fjerne nøkler, lagre fraktvalg |
| `lib/bring/quote.ts` | Pris til kassen og ordren, med reservepris og ti minutters buffer |
| `lib/bring/booking.ts` | Bestilling, etikett og sporing |
| `lib/bring/bulk.ts` | Bulk: velg ordre, book de som mangler etikett, hent etikettene, merkelapp i ordrelista |
| `lib/bring/merge.ts` | Slår etikett-PDF-er sammen til én (pdf-lib, rent JS) |
| `lib/bring/pickup.ts` | Hentesteder for Pakke til hentested (Pickup Point API), med ti minutters buffer |
| `lib/bring/weight.ts` | Totalvekt for handlekurven |

## Lagring

- `sites.shop.bring`: `environment`, `secret` (kryptert JSON med Mybring-bruker og API-nøkkel, bundet til butikk og miljø), `hint` (k…@firma.no), `customerNumber`, `savedAt`, `testedAt`, `lastError`, `products`, `sender`, `packageCm`, `atPostOffice`. `readShopSettings` tar aldri med nøklene, og `updateShopSettings` lar `bring` stå.
- `orders.shipping.bring`: tjeneste, vekt, postnummer og hvor prisen kom fra (`bring`, `reserve` eller `gratis`).
- `orders.shipping.bringBooking`: sendingsnummer, kolli, testbestilling eller ikke, og nøkkelen til PDF-en. Kommer etiketten bare som lenke og ikke kan hentes med en gang, lagres lenken kryptert (den kan gi tilgang uten innlogging) og hentes ved nedlasting.
- PDF: `fraktetiketter/<siteId>/<orderId>.pdf` i R2 (lokalt `.data/media`). Nøkkelen passer ikke mønsteret til `/media`, så den er aldri offentlig.

## Bring sine API-er, med kilder

1. **Shipping Guide API v2** (pris og leveringstid): `POST https://api.bring.com/shippingguide/api/v2/products`. Vekt (`grossWeight`) i gram, `length`, `width` og `height` i centimeter. `netPrice` kommer bare med gyldig kundenummer, og brukeren må ha økonomitilgang. Beløp er tekst (`"148.03"`), `expectedDelivery.workingDays` er tekst. Over grensen svarer Bring 429. Kilder: https://developer.bring.com/api/shipping-guide_2/ og OpenAPI https://api.bring.com/shippingguide/api-docs
2. **Booking API** (sending og etikett): `POST https://api.bring.com/booking/api/create`. `consignments[]` med `shippingDateTime`, `parties.sender` og `parties.recipient` (`name`, `addressLine` maks 35, `postalCode`, `city` maks 35, `countryCode`, `contact` med `email` maks 60 og `phoneNumber`), `product` (`id`, `customerNumber`) og `packages[]` (`weightInKg`, `dimensions` med `lengthInCm`, `widthInCm`, `heightInCm`). Svaret har `confirmation.consignmentNumber`, `confirmation.packages[].packageNumber`, `confirmation.labels.link` og `.base64`, og `confirmation.links.labels` og `.tracking`. Feil ligger i `consignments[].errors[]` med `code` og `messages[]`. Etiketten gjelder i 52 uker. Kilder: https://developer.bring.com/api/booking/ og OpenAPI https://api.bring.com/booking/api-docs
3. **Autentisering:** `X-Mybring-API-Uid` (e-posten til Mybring-brukeren), `X-Mybring-API-Key` og `X-Bring-Client-URL` (adressen til tjenesten som bruker API-et, vi sender `platformUrl()`). API-nøkkelen lages i Mybring under kontoinnstillinger, API (mybring.com/useradmin/account/settings/api). De fleste API-ene krever kundenummer, og brukeren må ha tilgang til det. Kilde: https://developer.bring.com/api/
4. **Testmodus:** hodet `X-Bring-Test-Indicator: true` på bestillingen. Bring sluttet å støtte `testIndicator` i selve bestillingen (oppdatering 12.10.2026 på Booking API-siden). Testkundenummer for pakker i Norge er `5` (PARCELS_NORWAY-00000000005). Tilgang bes om fra integrasjon.norge@bring.com, med økonomitilgang for priser. Bruk falske telefonnummer og e-poster. Kilde: https://developer.bring.com/api/testing/
5. **Tjenestekoder:** 3584 Home mailbox parcel (Pakke hjem i postkassen), 5800 Pickup parcel (Pakke til hentested), 5600 Parcel home plus (Pakke hjem pluss, tidligere Pakke levert hjem). Kilde: https://developer.bring.com/api/services/ og navnebyttet fra 1.2.2025: https://shipmondo.com/no/product-news/bring-norway-changes-in-product-naming
6. **Vekt og mål:**
   - 3584: inntil 5 kg, lengde maks 45 cm, lengde + bredde + tykkelse maks 90 cm, minst 9 x 14 cm. Kilde: Vilkår for Pakke hjem i postkassen, gjelder fra 26.01.2026, https://www.bring.no/vilkar/pakke-hjem-postkassen/
   - 5800: «Maksimum virkelig vekt: 35 kg». Kilde: Prisliste Pakke til hentested fra 1. juli 2026, https://www.bring.no/tjenester/pakker-og-gods/private-nasjonalt/pakke-til-hentested/Prisliste-Pakke-til-hentested_01072026.pdf
   - 5600: «Maksimum virkelig vekt: 35 kg». Kilde: Prisliste Pakke hjem pluss fra 1. juli 2026, https://www.bring.no/tjenester/pakker-og-gods/private-nasjonalt/pakke-levert-hjem/Prisliste-Pakke-hjem-pluss_01072026.pdf
   - For 5000, 5600, 5800 og andre reviderte tjenester trengs mål for riktig pris (Shipping Guide-siden). Derfor kan butikken sette en vanlig pakkestørrelse.

## Flere etiketter om gangen

- **Ordrelista** (`/studio/nettsted/<id>/ordre`): når Bring er koblet til og avsenderen er fylt inn, får betalte og sendte ordre en avkrysningsboks, med «Velg alle». Alle med tilgang til butikken kan bruke dem, som enkelt-etiketten. Nøklene finnes bare på serveren: nettleseren sender ordre-id-er.
- **Lag etiketter** (`bulk-actions.ts`, `lib/bring/bulk.ts`): maks 25 ordre per gang, fordi Workers har grense på CPU-tid og antall kall. Hver ordre tas for seg, med `bookBringShipment`, så den samme holdes av i databasen og aldri bookes to ganger. Hoppes over, med forklaring: har etikett fra før, ikke betalt, kansellert, hentes i butikken eller mangler adresse, kunden valgte ikke Bring i kassen, eller vekten mangler. Én feil stopper ikke de andre. Svaret sier hvor mange som ble booket, hoppet over og feilet, og hvorfor. Bulk har egen grense: 12 kjøringer i timen per butikk.
- **Skriv ut etiketter:** gir en lenke til `/studio/nettsted/<id>/ordre/etiketter?ids=a,b,c` (maks 25). Ruten krever innlogging med tilgang til butikken, henter PDF-ene (fra lageret, ellers fra Bring) og slår dem sammen til én PDF med `pdf-lib`, en etikett per side. Svaret har `cache-control: private, no-store`. Feiler sammenslåingen, eller kan en etikett ikke hentes, får brukeren en side med lenker til de enkelte etikettene i stedet.
- **Status:** ordrelista viser «Etikett laget, sporing <nummer>» eller «Ikke booket» (bare for ordre med adresse som er betalt eller sendt).
- **Bare Bring-ordre:** bulk bruker tjenesten og vekten kassen lagret på ordren. Ordre med butikkens egen postfrakt har ingen av delene, og hoppes over. Lag etiketten fra ordresiden.

## Utskrift på termoskriver

Etikettene fra Bring er A6 (10 x 15 cm) og passer en termoskriver som Zebra GK420d. Samme tekst står i studioet, under ordrelista og på ordresiden.

1. Sett etikettstørrelsen i skriverdriveren til 102 x 152 mm.
2. Sett skaleringen til 100 %.
3. Velg ingen marger i utskriftsvinduet i nettleseren, og la skaleringen stå på standard.

Da blir strekkoden skarp og etiketten fyller hele arket. Kilde: Helenes plugin Enkel Fraktlabel.

## Hentested

- **Kassen:** velger kunden Pakke til hentested og har skrevet postnummer, hentes de seks nærmeste hentestedene (`getPickupPoints`, begrenset med `hit()`, 60 per 10 minutter per IP). Nærmeste er forhåndsvalgt. Listen annonseres med `aria-live`. Svarer ikke Bring, vises ingen velger.
- **Lagring:** `orders.shipping.bring.pickupPoint` (id, navn, adresse, postnummer, sted) i eksisterende jsonb, ingen migrering. Serveren slår valgt id opp mot Bring sin liste for postnummeret når ordren lages, og ignorerer ukjente id-er.
- **Bestilling:** `parties.pickupPoint { countryCode: "NO", id }` sendes bare når den bestilte tjenesten er 5800 og ordren har et valgt hentested.
- **Kilder:** Pickup Point API https://developer.bring.com/api/pickup-point/ (`GET https://api.bring.com/pickuppoint/api/pickuppoint/NO/postalCode/{postnummer}?numberOfResponses=6`, hodene `X-Mybring-API-Uid`, `X-Mybring-API-Key`, `Accept: application/json`). Booking API https://developer.bring.com/api/booking/ (`parties.pickupPoint.id` og `.countryCode`, begge påkrevd).

## Antakelser vi ikke har fått bekreftet

- At en testbestilling med `X-Bring-Test-Indicator` gir etikett tilbake. Bring skriver at testnummer bare gir testdata, men ikke noe om etiketten.
- At etikettlenken (`labels.link` eller `links.labels`) er en PDF som kan hentes med API-nøklene. Formatet er ikke beskrevet. Eksemplet ender på `.pdf`. Vi sender nøklene bare til bring.com, mybring.com, bring.no og posten.no over https, og sjekker at svaret starter med `%PDF`.
- At `labels.base64` er en PDF når den finnes.
- At Pakke til hentested (5800) uten `pickupPoint` sendes til nærmeste hentested. Tjenesteporteføljen kaller hentested valgfritt (VAS 1036). Kassen lar kunden velge blant de nærmeste hentestedene (se under). Uten svar fra Bring, eller uten valg, sendes pakken til nærmeste hentested som før.
- At https virker for Shipping Guide. OpenAPI-dokumentet oppgir `http://api.bring.com/shippingguide` som server.
- At Shipping Guide og Booking godtar `X-Bring-Client-URL`. Hodet står ikke i deres OpenAPI, men API-oversikten sier at det alltid kreves.
- At Pickup Point API godtar de samme nøklene som Shipping Guide uten kundenummer, og at `X-Bring-Client-URL` er unødvendig der (siden nevner det ikke, vi sender det likevel). Grensen er oppgitt som både 80 og 30 forespørsler i sekundet.
- At feltene `id`, `name`, `address`, `postalCode`, `city` og `distanceInKm` er de riktige, og at `id` fra Pickup Point API er det Booking API vil ha i `parties.pickupPoint.id` for 5800. Eksemplet i Booking API gjelder tjeneste 5901.
- Lengdegrensene for 5800 og 5600 (240 cm, og 360 cm lengde + omkrets) har vi bare fra tredjepart. Kassen sjekker bare vekt.
- At `priceWithAdditionalServices` er riktig pris når vi ikke ber om tilleggstjenester. Vi bruker den, ellers `priceWithoutAdditionalServices`.
- At `shippingDateTime` i UTC (`2026-11-02T08:30:00.000Z`) godtas. Bring sine eksempler har lokal tidssone.
- At sendingsnummeret er riktig sporingsnummer. Bring sin egen sporingslenke i svaret bruker sendingsnummeret.

## Valg vi har tatt

- Prisen fra Bring rundes opp til hele kroner i kassen, så butikken aldri tar for lite.
- Butikkens avtalepris (netPrice) brukes når Bring gir den, ellers listeprisen. Prisen er med MVA og fordeles på MVA-satsene som annen frakt.
- Samme handlekurv og postnummer gir samme pris i ti minutter, per serverprosess. Bare svar der alle tjenestene fikk pris, huskes.
- En bestilling holdes av på ordren før kallet til Bring. Bring har ingen idempotensnøkkel, så to klikk skal aldri gi to sendinger. Feiler kallet, slippes ordren. En bestilling som ikke ble ferdig, kan prøves på nytt etter to minutter.

## Drift

- Migrering 0011 må kjøres i produksjon før deploy: `ALTER TABLE "products" ADD COLUMN "weight_grams" integer;`. Kolonnen er nullbar, så koden som kjører nå, påvirkes ikke.
- Lokalt migrerer PGlite selv ved neste oppstart av dev-serveren.
- Tester: `npx vitest run tests/bring.test.ts`. Ingen nettverk: `fetch` er byttet ut med et falskt Bring.

## Slik tester Helene med en Mybring-testkonto

1. Opprett eller bruk en Mybring-bruker (mybring.com). Lag en API-nøkkel under kontoinnstillinger, API.
2. Be integrasjon.norge@bring.com om tilgang til testkundenummeret for pakker i Norge (PARCELS_NORWAY-00000000005, i API-et `5`), med økonomitilgang, så Shipping Guide gir priser.
3. I studioet: Innstillinger, Frakt med Bring. Velg Testmodus, lim inn e-posten, API-nøkkelen og kundenummer `5`. Lagre og test.
4. Velg tjenester, sett reservepriser og avsenderadresse, og lagre fraktvalg.
5. Sett vekt på noen varer. Handle i butikken, velg en Bring-tjeneste og skriv et postnummer. Prisen skal komme fra Bring.
6. Marker ordren som betalt (testbetaling), og trykk «Lag fraktetikett hos Bring». Sjekk sendingsnummeret under Sporing og last ned etiketten.
7. Prøv også med en vare uten vekt: kassen skal bruke reserveprisen, og ordresiden skal si hvorfor.
8. Bytt til Produksjon først når butikken har eget kundenummer og alt over virker. Da blir etikettene ekte sendinger som Bring fakturerer.
