# Kustom Checkout

Kustom er tidligere Klarna Checkout, eget selskap (Kustom AB, org.nr. 559463-5038) siden 2024. Butikken har egen avtale og egne nøkler. Kustom er ikke underleverandør til Nettgata.

Kilder (sjekket 02.11.2026): docs.kustom.co, særlig Authentication, Create order, Order payload, Render and update, Confirmation and push, Validation callback, Idempotency and retries og Order Management API.

## Valg av kasseløsning

Kustom er et eget valg i kassen, ved siden av Vipps og Klarna. Kunden fyller ut vår kasse som før (varer, frakt med Bring-pris låst på serveren, rabatt, adresse), velger Kustom og sendes til vår egen side `/api/betaling/kustom`, som viser Kustom-kassen (html_snippet). Kunden velger betalingsmåte inne i Kustom.

Hvorfor slik: hele resten av kassen (frakt, Bring, rabatt, lager, kjøpsvilkår) er felles for alle betalingsmåter og lages på serveren før betalingen. Kustom-kassen blir dermed bare betalingssteget, på samme måte som Vipps og Klarna. Siden er ren HTML fra serveren, så skriptet i snutten kjører som det er (ingen gjenskaping av script-elementer i React).

## Flyt

1. `startPayment`: POST `/checkout/v3/orders` med samme ordrelinjer som Klarna (`klarnaOrderBody`), `merchant_reference1` = ordrenummer, `merchant_reference2` = ordre-ID. Ingen idempotensnøkkel (Checkout API tar ikke imot den). `payment_ref` = `kustom:<miljø>:<ordre-ID>`.
2. Kassesiden henter fersk snutt hver gang. Er ordren ikke ubetalt, eller kassen ikke `checkout_incomplete`, sendes kunden til kvitteringen.
3. Validering (`/api/betaling/kustom/valider`, bare med https, `require_validate_callback_success: true`): godtar bare når ordren venter på betaling og beløp, valuta og referanser stemmer. Ellers 303 til kvitteringen. Dette hindrer betaling av en ordre vi har kansellert, fordi kassen hos Kustom ikke kan stenges.
4. Bekreftelse (`/api/betaling/retur`) og push (`/api/betaling/kustom/push`) gjør samme sjekk: henter ordren fra Order Management, sjekker valuta, beløp og begge referansene, kvitterer (acknowledge) og merker ordren betalt. Push-innholdet brukes aldri. Gjentatt push kvitterer på nytt med samme idempotensnøkkel og gir ingen ny «betalt».
5. Bakgrunnsjobben fanger opp betalte ordre og kansellerer kasser som ikke er fullført etter en time.
6. Sendt: capture. Kansellert før trekk: cancel. Refundert: full refusjon. Alle med `Kustom-Idempotency-Key` (UUID v5 av handling og ordre-ID).

## CSP

Butikksidene har ingen Content-Security-Policy i dag. Får de det, må kassesiden tillate `*.kustom.co` i `script-src` og `frame-src`. Kassesiden sender `Cross-Origin-Opener-Policy: same-origin-allow-popups`, som Kustom krever hvis siden har COOP.

## Testing

Kustom krever offentlig https for push og bekreftelse, så playground-testen må gjøres på et ekte domene (ikke localhost). Testnøkler: Kustom playground-portal, Developers, API, Generate new. Passordet begynner med `kco_test_api_` og vises bare én gang.

## Åpne punkter

- Fiken-koblingen kjenner ikke Kustom som betalingsmåte ennå (`lib/fiken/state.ts`).
- Ikke prøvd mot Kustom playground.
- Ikke på salgssiden før det er testet.
