# Fiken-koblingen

Butikkeieren kobler nettbutikken til sin egen Fiken-konto under Betaling i studioet, og sender betalte ordre dit som salg med et trykk. Én ordre blir ett betalt salg («Annet salg» i Fiken) med én linje per MVA-sats. Ingenting sendes av seg selv.

Siden 2. november 2026 kobles det til med **OAuth2** (eieren logger inn hos Fiken og godtar), ikke med personlig API-nøkkel. Fiken skriver at personlige nøkler i tredjepartsløsninger bryter vilkårene deres. Gamle koblinger med personlig nøkkel leses ikke lenger, og butikken må koble til på nytt.

## Det Helene må gjøre før butikkene får Fiken

1. **Registrer deg som utvikler i Fiken:** Rediger konto, Profil, Andre innstillinger, huk av for utvikler.
2. **Lag en app** under API-fanen i brukerinnstillingene. Velg vanlig app med client secret (ikke «Uten client secret (PKCE)»). Redirect URL: **`https://nettgata.no/studio/fiken/callback`** (nøyaktig, med https og uten skråstrek til slutt). Vil du teste lokalt, legg også til `http://localhost:3000/studio/fiken/callback` og sett `FIKEN_REDIRECT_URI` til den adressen i `.env.local`.
3. **Legg inn verdiene i Cloudflare** (aldri i filer eller git):
   - `FIKEN_CLIENT_ID`: vanlig variabel (Variables), ikke hemmelig.
   - `FIKEN_CLIENT_SECRET`: Secret (`npx wrangler secret put FIKEN_CLIENT_SECRET`).
   Når begge er satt, er Fiken åpent for alle eiere av nettbutikker i studioet. Til da ser kundene «Fiken kommer snart», og bare plattformadmin ser selve koblingen (uten å kunne koble til).
4. **Test med et testselskap i Fiken** (se «Ikke bekreftet mot ekte Fiken» under). Appen kan brukes av opptil fem brukere mens den er under utvikling.
5. **Produksjonsstatus:** Fiken vil at to til tre ekte brukere har tatt den i bruk før du ber om produksjonsstatus på api@fiken.no. Over fem brukere krever produksjonsstatus.
6. Fiken nevnes ikke på salgssiden eller i annonser før du har testet med en ekte butikk.

## OAuth2, det vi bruker

Kilde: https://api.fiken.no/api/v2/docs/ (avsnittet «Authorization with OAuth2») og https://fiken.no/.well-known/oauth-authorization-server, lest 2. november 2026.

| | |
|---|---|
| Innlogging | `GET https://fiken.no/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256` |
| Kode til nøkler | `POST https://fiken.no/oauth/token`, `application/x-www-form-urlencoded`, Basic-innlogging med client id og client secret. `grant_type=authorization_code&code=...&redirect_uri=...&state=...&code_verifier=...` |
| Fornyelse | Samme endepunkt, `grant_type=refresh_token&refresh_token=...`. Svaret har ny tilgangsnøkkel og «possibly updated» fornyelsesnøkkel. Kommer det en ny, erstatter den den gamle |
| Levetid | `expires_in` i svaret (86157 sekunder, rundt et døgn, i eksempelet til Fiken). Fiken oppgir ingen levetid for fornyelsesnøkkelen til apper med client secret (for apper uten secret: 90 dager uten bruk) |
| Tilbaketrekking | `POST https://fiken.no/oauth/revoke` med `Authorization: Bearer <tilgangsnøkkel>`. Trekker tilbake hele tilgangen, også fornyelsesnøkkelen |
| Scopes | Ingen. Spesifikasjonen har `scopes: {}`, og vi ber ikke om noen |
| API-kall | Som før: `Authorization: Bearer <tilgangsnøkkel>` mot `https://api.fiken.no/api/v2` |

Eieren kan også fjerne tilgangen selv i Fiken: Rediger konto, Sikkerhet, Apper du har gitt tilgang til. Selskaper som lages etter at eieren ga tilgang, må legges til der.

### Slik er flyten bygget

1. **«Koble til Fiken»** (bare eieren, `startFikenConnectAction`) lager en `state` og sender nettleseren til Fiken. `state` er `base64url(JSON).base64url(HMAC-SHA256)` med nettsted, bruker, en tilfeldig verdi og utløp om ti minutter. HMAC-nøkkelen er avledet fra SESSION_SECRET med HKDF (info `fiken-oauth-state-v1`), så den aldri er den samme som for økter.
2. **PKCE:** `code_verifier` er HMAC av den tilfeldige verdien i `state`. Den lagres ikke, og kan ikke regnes ut av den som bare ser adressen. Fiken anbefaler PKCE også for apper med client secret.
3. **`/studio/fiken/callback`** (`app/studio/fiken/callback/route.ts`, logikken i `fikenCallback` i `lib/fiken/connect.ts`): sjekker signatur og utløp, at innlogget bruker er den som startet, at brukeren fortsatt er eier av nettbutikken, og at `state` ikke er brukt før (`rate_limit_events` med nøkkel `fiken-oauth-state:<verdi>`, grense 1). Fiken godtar dessuten hver kode bare én gang. Så byttes koden mot nøkler, og eieren sendes til Betaling med en kort kode for resultatet (`?fiken=koblet|velg|avbrutt|utlopt|ingen-tilgang|ingen-selskap|feil`). Koden og state blir aldri med videre.
4. **Selskap:** har brukeren ett selskap i Fiken, er butikken koblet til med en gang. Har brukeren flere, lagres listen, og eieren velger i studioet (`chooseFikenCompany`, som henter listen på nytt fra Fiken).
5. **Fornyelse:** `fikenAccessToken` fornyer når det er under fem minutter igjen, før en sending, test eller valg av selskap. De nye nøklene lagres kryptert i én betinget `UPDATE` (bare hvis de gamle fortsatt ligger der). Fornyer to forespørsler samtidig, bruker den som tapte nøklene vinneren lagret.
6. **Fornyelsen feiler:** svarer Fiken 400 eller 401 (koden eller fornyelsesnøkkelen er ugyldig eller trukket tilbake), settes `needsReconnect`, `lastError` og `testedAt: null`, og `fiken.needs_reconnect` logges. Studioet viser «Må kobles til på nytt» under Betaling og en advarsel under «Dette bør du se på» på oversikten. Nettverksfeil og 5xx kobler ikke fra.
7. **«Koble fra»** trekker tilbake tilgangen hos Fiken og sletter nøklene. Svarer ikke Fiken, slettes de hos oss likevel, og eieren får beskjed om å fjerne appen i Fiken.

## Filer

| Fil | Hva |
|---|---|
| `lib/fiken/state.ts` | Skjema for `sites.shop.fiken`, `fikenView()` uten nøkler. Ren, uten hemmeligheter |
| `lib/fiken/oauth.ts` | OAuth2: adresser, `state` med signatur, PKCE, kode til nøkler, fornyelse, tilbaketrekking, `fikenAvailableTo` |
| `lib/fiken/connect.ts` | «Koble til Fiken» og callback (`fikenCallback`) |
| `app/studio/fiken/callback/route.ts` | Ruten Fiken sender eieren tilbake til |
| `lib/fiken/crypto.ts` | AES-GCM, nøkkel avledet fra SESSION_SECRET med HKDF (salt `nettgata-fiken`, info `fiken-api-nokkel-v1`). Nettstedet er tilleggsdata |
| `lib/fiken/client.ts` | Kallene mot Fiken, tidsavbrudd (15 s) og norske feilmeldinger |
| `lib/fiken/mapping.ts` | Ordre til salg. Bruker `allocateDiscount` og `vatBreakdown`, som kassen og MVA-rapporten |
| `lib/fiken/config.ts` | Lagring av nøklene, fornyelse (`fikenAccessToken`), valg av selskap, test, valg av kontoer, koble fra |
| `lib/fiken/send.ts` | Sending, sperre mot samtidige sendinger, dobbeltsendingsvern, oversikt til studioet |
| `app/studio/nettsted/[siteId]/betaling/fiken-*.ts(x)` | Studioet: handlinger (bare eier, `hit()`) og seksjonen «Regnskap: Fiken» |
| `tests/fiken.test.ts` | Tester med etterlignet Fiken bak `fetch` og PGlite |

`updateShopSettings` i `lib/payments/config.ts` tar nå vare på `sites.shop.fiken`. Uten det slettet «Lagre butikkinnstillinger» koblingen.

## Fiken API v2, det vi bruker

Kilde der ikke annet står: den offisielle dokumentasjonen, https://api.fiken.no/api/v2/docs/ (spesifikasjonen ligger på https://api.fiken.no/api/v2/docs/swagger.yaml), lest 1. november 2026.

- Adresse: `https://api.fiken.no/api/v2`, bare HTTPS.
- Tilgangsnøkkelen fra OAuth2 sendes som `Authorization: Bearer <nøkkel>`.
- API-tilgang koster 99 kr i måneden eks. mva per selskap, betalt til Fiken, og bestilles under modultilgang i innstillingene i Fiken. Prisside: https://fiken.no/priser sier «Koble Fiken til andre systemer (API) 99 kr per måned, ekskl. mva» (sjekket på nytt 2. november 2026, uendret).
- Bare ett kall om gangen. Samtidige kall kan gi 429, og over fire kall i sekundet kan bli bremset. Vi sender ett og ett med 250 ms pause, maks 40 ordre per trykk.
- Beløp er heltall i øre. Datoer er `yyyy-MM-dd`.
- Fiken anbefaler `X-Request-ID` (UUID) på alle kall. Vi sender det.

| Kall | Brukes til |
|---|---|
| `GET /companies` | Sjekke nøkkelen og liste selskapene. Gir `slug`, `name`, `organizationNumber`, `vatType` (`no`, `yearly`, `monthly`, `bi-monthly`), `hasApiAccess`, `testCompany` |
| `GET /companies/{slug}` | Test av tilkoblingen |
| `GET /companies/{slug}/bankAccounts?inactive=false` | Kontoer pengene kan komme inn på. `accountCode` som `1920:10001` brukes som `paymentAccount` |
| `GET /companies/{slug}/accounts?fromAccount=3000&toAccount=3999` | Inntektskontoene |
| `POST /companies/{slug}/sales` | Lagre salget. Svarer 201 med `Location`, og salgs-ID-en er siste del av adressen |
| `GET /companies/{slug}/sales?saleNumber=1001` | Bare etter tidsavbrudd eller 5xx: finnes salget allerede? |

Salget vi sender (feltene er fra `saleRequest` og `orderLine` i spesifikasjonen):

```json
{
  "date": "2026-11-01",
  "kind": "cash_sale",
  "saleNumber": "1001",
  "currency": "NOK",
  "totalPaid": 103050,
  "paymentAccount": "1920:10002",
  "paymentDate": "2026-11-01",
  "lines": [
    { "description": "Ordre 1001 fra nettbutikken, varer og frakt med 25 % MVA", "netPrice": 31781, "vat": 7945, "vatType": "HIGH", "account": "3000" },
    { "description": "Ordre 1001 fra nettbutikken, varer og frakt med 15 % MVA", "netPrice": 33506, "vat": 5026, "vatType": "MEDIUM", "account": "3000" },
    { "description": "Ordre 1001 fra nettbutikken, varer og frakt med 0 % MVA", "netPrice": 24792, "vat": 0, "vatType": "EXEMPT", "account": "3100" }
  ]
}
```

MVA-typer for salg: 25 % `HIGH`, 15 % `MEDIUM`, 12 % `LOW`. 0 % er `EXEMPT` («fritatt», for eksempel bøker) når selskapet er MVA-registrert, og `NONE` når det ikke er det (`vatType: "no"` på selskapet). Et selskap uten MVA-registrering skal føre salg uten MVA (https://blogg.fiken.no/registrering-i-merverdiavgiftsregisteret), så ordre med MVA stoppes med en forklaring i stedet for å sendes.

`date` er bestillingsdatoen i norsk tid, som i salgs- og MVA-rapporten. `paymentDate` er når ordren ble betalt. Ingen personopplysninger sendes, bare ordrenummeret.

## Lagring

`sites.shop.fiken`: `auth: "oauth"`, en tilfeldig `connectionId` per tilkobling, kryptert tilgangs- og fornyelsesnøkkel (`secret`, `v1:iv:chiffer` av JSON), `expiresAt`, selskapet (eller `companyChoices` til eieren har valgt), `needsReconnect`, om det er MVA-registrert og testselskap, kontolistene fra Fiken, valgene (konto per betalingsmåte, inntektskontoer), `testedAt`, `lastError` og en sperre (`lockUntil`) mens en sending pågår. Alt skrives i én SQL-setning som bare rører `fiken`. Oppdateringer fra test og sending gjelder bare tilkoblingen de startet på (`connectionId`), siden `secret` byttes ved hver fornyelse. `readShopSettings()` tar ikke med feltet, og studioet får bare `fikenView()`, som plukker ut feltene uten nøkler, `connectionId` og `expiresAt`. Ingen ny migrering.

Forslag ved tilkobling: Vipps og Klarna til en bankkonto i Fiken med samme navn, ellers driftskontoen (1920). Faktura og betaling ved henting er av, fordi de ofte allerede er ført i Fiken (faktura laget der) eller i et kassesystem. Fiken anbefaler egen bankkonto i Fiken for Vipps-betalinger (https://hjelp.fiken.no/salg-med-vipps-bedrift).

## Hvilke ordre som sendes

Status `paid` eller `fulfilled`, bestilt i perioden (denne eller forrige måned, norsk tid), betalingsmåte som eieren har valgt, ikke sendt før, og over 0 kr. Testbetaling sendes aldri. Ordre betalt i testmiljøet hos Vipps eller Klarna (`payment_ref` med `:test:`) sendes bare til et testselskap i Fiken.

## Ingen dobbeltsending

- Før sending: revisjonsloggen sjekkes etter `order.fiken_sent` med ordrens `orderId` i `detail`. Etterpå logges samme handling med `saleId`.
- Sperre i `sites.shop.fiken.lockUntil`, satt med én betinget `UPDATE`, så to trykk samtidig aldri sender samme ordre. Sperren gjelder i maks fem minutter.
- Tidsavbrudd eller 5xx ved lagring logges som `order.fiken_failed` med `uncertain: true`. Neste gang spør vi Fiken etter salgsnummeret først. Finnes et salg med samme dato og beløp, logges ordren som sendt (`recovered: true`) uten nytt salg.
- Kobler butikken fra og til igjen, sendes ingenting på nytt, fordi loggen blir liggende.

## Feil

401, 403, 404 og 429 stopper sendingen med en gang, fordi resten ville feilet likt. 401, 403 og 404 lagres også som `lastError` og vises i studioet. 400 og 5xx gjelder bare den ene ordren, og de andre sendes. To nettverksfeil på rad stopper sendingen.

## Ikke bekreftet mot ekte Fiken

Testene går mot et etterlignet API. Dette må prøves med et testselskap i Fiken før koblingen tas i bruk:

1. At `kind: "cash_sale"` med `paymentAccount`, `paymentDate` og `totalPaid` gir et betalt salg. Spesifikasjonen sier ikke hvilke felt `cash_sale` krever, eller hva forskjellen på `invoice` og `external_invoice` er.
2. At `account` på salgslinjen er inntektskontoen. Spesifikasjonen kaller feltet «Expense account (kostnadskonto)», trolig kopiert fra kjøp.
3. At 0 % skal være `EXEMPT`. Selger butikken noe som er unntatt fra MVA-loven, er `NONE` riktig.
4. Formatet på feilsvar er ikke beskrevet. Vi leter etter `message`, `errorMessage`, `error_description` og lignende.
5. At `GET /sales?saleNumber=` finner salget, og at `netAmount + vatAmount` er bruttobeløpet.
6. Om Fiken godtar to salg med samme salgsnummer. Vi stoler ikke på at Fiken stopper det.
7. At `hasApiAccess: false` betyr at API-modulen mangler. Vi viser det bare som et hint.
8. Om et testselskap i Fiken har API-tilgang uten å betale for modulen.
9. OAuth2-flyten mot ekte Fiken: at Basic-innloggingen, PKCE med client secret og `state` i tokenkallet godtas, og hva Fiken svarer når fornyelsesnøkkelen er trukket tilbake (vi regner 400 og 401 som «koble til på nytt»).
10. Ett tredjepartsprosjekt (github.com/Casper0301/fiken-mcp) skriver at Fiken ikke har `POST /sales`. Den offisielle spesifikasjonen har det («Creates a new sale. This corresponds to "Annet salg" in Fiken»).

Gebyrer fra Vipps og Klarna og utbetalinger til banken føres ikke.

## Kreditnotaer: føres for hånd

Nettgata lager kreditnota av seg selv når en betalt ordre kanselleres eller refunderes (`lib/shop/credit-notes.ts`), men den sendes **ikke** til Fiken:

- `POST /companies/{slug}/creditNotes/full` og `/partial` krever `invoiceId`, altså en faktura laget i Fiken. Salget vi sender, er «Annet salg» (`/sales`), ikke en faktura. Uavhengige kreditnotaer (`/creditNotes/drafts`) krever `customerId`, og vi sender ingen kunde til Fiken.
- Spesifikasjonen sier ingenting om negative beløp på `/sales`. Det er ikke dokumentert at et negativt «Annet salg» er lov.
- `PATCH /sales/{saleId}/delete` lager en motpostering og merker salget som slettet. Spesifikasjonen sier ikke hvilken dato motposteringen får, og en sletting er ikke en kreditnota.

Ordre som er sendt og senere kansellert eller refundert, listes derfor i studioet med salgs-ID i Fiken og kreditnotanummeret i Nettgata, så eieren fører kreditnotaen i Fiken. Kan sendes automatisk senere hvis en test med et testselskap viser at et negativt «Annet salg» med samme MVA-linjer blir godtatt.
