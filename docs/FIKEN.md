# Fiken-koblingen

Butikkeieren kobler nettbutikken til sin egen Fiken-konto under Betaling i studioet, og sender betalte ordre dit som salg med et trykk. Én ordre blir ett betalt salg («Annet salg» i Fiken) med én linje per MVA-sats. Ingenting sendes av seg selv.

**Viktig før kunder får bruke dette:** koblingen bruker personlig API-nøkkel, slik oppgaven ba om. Fiken skriver at personlige nøkler i tredjepartsløsninger bryter vilkårene deres, og at tredjeparter som integrerer på vegne av kundene sine, må bruke OAuth2. Se «Før lansering» nederst.

## Filer

| Fil | Hva |
|---|---|
| `lib/fiken/state.ts` | Skjema for `sites.shop.fiken`, `fikenView()` uten nøkkel. Ren, uten hemmeligheter |
| `lib/fiken/crypto.ts` | AES-GCM, nøkkel avledet fra SESSION_SECRET med HKDF (salt `nettgata-fiken`, info `fiken-api-nokkel-v1`). Nettstedet er tilleggsdata |
| `lib/fiken/client.ts` | Kallene mot Fiken, tidsavbrudd (15 s) og norske feilmeldinger |
| `lib/fiken/mapping.ts` | Ordre til salg. Bruker `allocateDiscount` og `vatBreakdown`, som kassen og MVA-rapporten |
| `lib/fiken/config.ts` | Koble til, test, valg av kontoer, koble fra |
| `lib/fiken/send.ts` | Sending, sperre mot samtidige sendinger, dobbeltsendingsvern, oversikt til studioet |
| `app/studio/nettsted/[siteId]/betaling/fiken-*.ts(x)` | Studioet: handlinger (bare eier, `hit()`) og seksjonen «Regnskap: Fiken» |
| `tests/fiken.test.ts` | Tester med etterlignet Fiken bak `fetch` og PGlite |

`updateShopSettings` i `lib/payments/config.ts` tar nå vare på `sites.shop.fiken`. Uten det slettet «Lagre butikkinnstillinger» koblingen.

## Fiken API v2, det vi bruker

Kilde der ikke annet står: den offisielle dokumentasjonen, https://api.fiken.no/api/v2/docs/ (spesifikasjonen ligger på https://api.fiken.no/api/v2/docs/swagger.yaml), lest 1. november 2026.

- Adresse: `https://api.fiken.no/api/v2`, bare HTTPS.
- Personlig API-nøkkel sendes som `Authorization: Bearer <nøkkel>`. Den lages i Fiken under Rediger konto, API, Personlige API-nøkler. Den går aldri ut på tid, og kan trekkes tilbake samme sted.
- API-tilgang koster 99 kr i måneden og bestilles under modultilgang i innstillingene i Fiken. Prisside: https://fiken.no/priser sier «Koble Fiken til andre systemer (API) 99 kr per måned, ekskl. mva» (lest 1. november 2026).
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

`sites.shop.fiken`: kryptert nøkkel (`secret`, `v1:iv:chiffer`), selskapet, om det er MVA-registrert og testselskap, kontolistene fra Fiken, valgene (konto per betalingsmåte, inntektskontoer), `testedAt`, `lastError` og en sperre (`lockUntil`) mens en sending pågår. Alt skrives i én SQL-setning som bare rører `fiken`. `readShopSettings()` tar ikke med feltet, og studioet får bare `fikenView()`, som plukker ut feltene uten nøkkelen.

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
9. Formatet på personlige nøkler. Vi krever bare synlige tegn uten mellomrom.
10. Ett tredjepartsprosjekt (github.com/Casper0301/fiken-mcp) skriver at Fiken ikke har `POST /sales`. Den offisielle spesifikasjonen har det («Creates a new sale. This corresponds to "Annet salg" in Fiken»).

Gebyrer fra Vipps og Klarna, utbetalinger til banken og kreditnota ved refusjon føres ikke. Ordre som er sendt og senere kansellert eller refundert, listes i studioet så eieren kan rette dem i Fiken.

## Før lansering til kunder: OAuth2

Fra dokumentasjonen: «Third parties that wish to integrate with Fiken on behalf of their customers must use the OAuth2 authorization method» og «Using personal API tokens in third-party applications violates Fiken's terms of service and may result in immediate API access termination.»

Det som må til:

1. Huke av for at du er utvikler i Fiken (Rediger konto, Profil, Andre innstillinger) og lage en app under API. Da får du Client ID og Client Secret.
2. Appen kan brukes av opptil fem brukere mens den utvikles. Fiken vil at to til tre ekte brukere er med før du ber om produksjonsstatus på api@fiken.no.
3. I koden endres bare tilkoblingen: «Koble til Fiken» sender eieren til `https://fiken.no/oauth/authorize`, og tilgangs- og fornyelsesnøkkelen lagres kryptert der den personlige nøkkelen ligger nå. Sending, mapping, logg og feilhåndtering er de samme.
