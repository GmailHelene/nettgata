# Betaling for plattformen: Stripe

Kundene betaler abonnementet med kort hos Stripe. Koden er ferdig og testet mot falske Stripe-svar (`tests/abonnement.test.ts`).
Uten nøkler sier studioet at kortbetaling ikke er slått på ennå, og webhooken svarer 503.

Sjekket mot Stripe sin dokumentasjon og bokføringsforskriften 01.11.2026.

## Slik virker det

1. Kunden åpner fanen **Abonnement** på nettstedet og velger månedlig eller årlig betaling, tillegget og eventuelt oppstart.
   Planen følger typen nettsted: en nettside får Nettside, en nettbutikk får Nettbutikk.
2. Studioet henter prisene fra Stripe med oppslagsnøkler (lookup keys) og sjekker beløp, valuta og intervall mot de vedtatte prisene
   i `lib/billing/plans.ts`. Det sjekker også at 25 % mva er satt opp. Stemmer noe ikke, stoppes betalingen. Kunden får en
   vanlig melding, og du ser nøyaktig hva som er galt når du er logget inn som plattformadmin.
3. Kunden betaler i Stripe Checkout på norsk og fyller inn fakturaadresse og eventuelt MVA-nummer.
4. Webhooken oppdaterer nettstedet. Studioet sjekker også betalingen selv når kunden kommer tilbake, så kunden slipper å vente.
5. Etterpå sender knappen «Bytt kort, se fakturaer eller si opp» kunden til Stripe sin kundeportal.
6. Eget domene kan bare kobles til med aktivt abonnement, eller når du har slått på «Fakturert utenom Stripe» for nettstedet.
   Som plattformadmin kan du alltid koble til. Domener som allerede er koblet til, blir stående.

Bare eieren av et nettsted kan bestille og endre abonnementet. Redaktører ser bare statusen.

## Før du starter

Gjør alt først i **testmodus**, prøv en betaling, og gjør det samme i live. Priser, skattesats, webhook og nøkler er separate
i de to modusene.

Bruk helst en **egen Stripe-konto for Nettgata** (kontomenyen øverst til venstre, «New account»), selv om det er samme
foretak som Bedriftsflyt. Navnet kundene ser på kvittering, faktura og kortutskrift, fakturanummerserien, kundeportalen og
webhookene hører til kontoen. Deler du konto med Bedriftsflyt, ser Nettgata-kundene Bedriftsflyt sitt navn, eller omvendt.
Koden tåler en delt konto: hendelser om abonnementer som ikke hører til et nettsted på plattformen, blir bare kvittert.

## 1. Bedriftsopplysninger

[Account details](https://dashboard.stripe.com/settings/account):

- Juridisk navn som i Enhetsregisteret: **GRØNBERG TECH SOLUTIONS**, enkeltpersonforetak, org.nr. **927 889 404**.
  Registrert i Merverdiavgiftsregisteret fra 10.07.2026 (sjekket i Enhetsregisteret 01.11.2026).

[Public details](https://dashboard.stripe.com/settings/public):

- Offentlig navn: **Nettgata**. Kortutskrift (statement descriptor): **NETTGATA**.
- Support-e-post: kontakt@helene.cloud. Nettsted: https://nettgata.no.
- Support-adresse og telefon kan slås av. For et enkeltpersonforetak krever bokføringsforskriften § 5-1-2 bare navn og
  org.nr. med MVA på fakturaen. Adressen kreves for AS, ASA og filialer, ikke for deg. Stripe vil likevel ha adressen din
  i kontoopplysningene, men det er ikke det samme som at den står på fakturaen.

## 2. Mva 25 %

Prisene er uten mva, og 25 % legges på. Koden finner oppsettet selv, så du skal ikke lime inn noen ID.

**Anbefalt, gratis: en fast skattesats.** [Tax rates](https://dashboard.stripe.com/tax-rates) (i testmodus:
https://dashboard.stripe.com/test/tax-rates), ny sats:

| Felt | Verdi |
|---|---|
| Type | VAT |
| Visningsnavn (display name) | MVA |
| Prosent | 25 |
| Land / region | Norge (NO) |
| Inkludert i prisen (inclusive) | **Nei**. Mvaen skal komme i tillegg |

Koden bruker en aktiv sats på 25 % for Norge som ikke er inkludert i prisen. En inkludert sats, som den Bedriftsflyt bruker,
blir ikke valgt.

**Alternativ: Stripe Tax.** Koster 0,5 % av hver betaling. Registrer Norge under Tax, Registrations, legg inn hovedkontor,
og sett alle prisene til «Exclude tax» (tax behavior exclusive). Koden bruker Stripe Tax bare når det ikke finnes en fast sats.

Den faste satsen legger alltid på norsk mva. Får du en kunde som er en bedrift i utlandet, må den håndteres for seg.

## 3. Skatte-ID, nummerserie og bunntekst

[Invoice template](https://dashboard.stripe.com/settings/billing/invoice):

- **Tax ID:** legg til «Norwegian VAT number» (`no_vat`) med verdien `927889404MVA`, og velg at den vises på alle fakturaer.
  Da står org.nr. med MVA bak, slik § 5-1-2 krever.
- **Nummerering:** velg «Sequentially across your account». Stripe bruker «per kunde» som standard i Norge, fordi Norge ikke
  er i EU. Bokføringsforskriften § 5-1-3 krever maskinelt tildelte nummer i en kontrollerbar sekvens, og én serie for hele
  kontoen er det enkleste å kontrollere. Prefiks: `NETTGATA` (maks 12 store bokstaver eller tall). Fakturaene blir da
  NETTGATA-0001, NETTGATA-0002 og så videre.
  Dette blir en egen serie ved siden av dine egne fakturaer fra 3001. Skriv inn i dokumentasjonen av regnskapet at du har to
  serier, og hvor hver av dem kommer fra.
- **Bunntekst (footer):** `Grønberg Tech Solutions · Org.nr. 927 889 404 MVA · nettgata.no · kontakt@helene.cloud`
- **Språk:** koden setter norsk på hver kunde (`preferred_locales: nb`), så faktura og kvittering kommer på norsk.
  Har kunden org.nr. i studioet, legges det inn som eget felt på fakturaen («Org.nr.»).

## 4. Produkter og priser

Lag fem produkter. Alle prisene i NOK, uten mva, med «Exclude tax» når Stripe Tax brukes. Oppslagsnøkkelen (lookup key) må
være nøyaktig som i tabellen.

| Produkt | Pris | Type | Oppslagsnøkkel |
|---|---|---|---|
| Nettgata Nettside | 199 kr | Månedlig | `nettgata_nettside_mnd` |
| Nettgata Nettside | 2 028 kr | Årlig (169 kr per måned) | `nettgata_nettside_ar` |
| Nettgata Nettbutikk | 399 kr | Månedlig | `nettgata_nettbutikk_mnd` |
| Nettgata Nettbutikk | 4 068 kr | Årlig (339 kr per måned) | `nettgata_nettbutikk_ar` |
| AI-team og sosiale medier | 249 kr | Månedlig | `nettgata_tillegg_ai_mnd` |
| AI-team og sosiale medier | 2 988 kr | Årlig (12 x 249 kr) | `nettgata_tillegg_ai_ar` |
| Oppstart nettside | 3 900 kr | Engangsbeløp | `nettgata_oppstart_nettside` |
| Oppstart nettbutikk | 9 900 kr | Engangsbeløp | `nettgata_oppstart_nettbutikk` |

De to prisene for AI-team og sosiale medier kan vente. Tillegget er skjult i studioet til det er lansert (`ADDON_AVAILABLE` i `lib/billing/plans.ts`), så ingen kan bestille det før det finnes.

Tillegget har en årspris fordi Stripe Checkout ikke kan ha måned og år i samme abonnement. Det er ikke en ny pris, bare 249 kr
i måneden fakturert for et år om gangen.

Oppslagsnøkkelen settes på prisen i dashbordet, under de avanserte valgene for prisen. Finner du ikke feltet, kan du sette den
i Workbench-skallet: `stripe prices update price_... --lookup-key=nettgata_nettside_mnd`.

Skal en pris endres senere: lag en ny pris i Stripe, flytt oppslagsnøkkelen til den, og endre beløpet i `lib/billing/plans.ts`.
Gjør du bare det ene, stopper betalingen med en melding om hvilken pris som ikke stemmer. Det er med vilje.

## 5. Kundeportalen

[Customer portal](https://dashboard.stripe.com/settings/billing/portal):

- Fakturahistorikk: på.
- Oppdatere betalingsmåte: på.
- Kundeinformasjon: la kunden endre e-post, fakturaadresse og skatte-ID.
- Oppsigelse: på, «at end of billing period», uten tilbakebetaling. Studioet lover kunden at abonnementet gjelder ut perioden
  som er betalt.
- Bytte abonnement (subscription update): av. Bytte mellom måned og år, eller legge til tillegget, gjør du foreløpig i Stripe.
- Lenker til vilkår og personvernerklæring når de er publisert.
- Standard returadresse: https://nettgata.no/studio. Koden sender uansett med adressen til nettstedets abonnementsside.

## 6. E-post og betalinger som feiler

[Email notifications and customer management](https://dashboard.stripe.com/settings/billing/automatic):

- Send kvittering når betalingen går gjennom, og send ferdige fakturaer på e-post.
- Slå på e-post om fornyelse som kommer. Funksjonskartet sier varsel 30 dager før fornyelse. Antall dager velges under
  «Upcoming renewal events».
- Betalinger som feiler: slå på Smart Retries og e-post til kunden med lenke for å oppdatere kortet.
- Når alle forsøk har feilet: velg «Cancel the subscription». Mens Stripe prøver igjen (status past_due) beholder kunden
  tilgangen. Når abonnementet er avsluttet, kan kunden ikke koble til nye domener.

## 7. Webhook

Workbench, fanen [Webhooks](https://dashboard.stripe.com/webhooks), «Create an event destination»:

1. Velg «Your account».
2. API-versjon: **2026-09-30.endive**. Det er den samme som koden bruker (`STRIPE_API_VERSION` i `lib/billing/stripe.ts`).
3. Hendelser:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Type: Webhook endpoint. Adresse: **https://nettgata.no/api/stripe/webhook**
5. Kopier «Signing secret» (begynner med `whsec_`). Den blir `STRIPE_WEBHOOK_SECRET`.

Testmodus og live har hver sin webhook og hver sin hemmelighet.

Svarene fra plattformen: 200 når hendelsen er mottatt, 400 når signaturen ikke stemmer, 503 når hemmelighetene mangler og 500
når noe feiler underveis. Ved 503 og 500 sender Stripe hendelsen på nytt i opptil tre dager, så ingenting går tapt mens du
setter opp. Under «Event deliveries» på webhooken ser du hva som er sendt og hva plattformen svarte.

En testhendelse (for eksempel `stripe trigger invoice.paid`) hører ikke til noe nettsted og blir bare kvittert. Det viser at
signaturen virker. En ekte prøvebetaling i testmodus (punkt 10) viser resten.

## 8. Hemmeligheter på Workeren

To hemmeligheter, satt som **Secret** på Workeren, aldri som vanlig variabel og aldri i `wrangler.jsonc` eller andre filer:

| Navn | Verdi |
|---|---|
| `STRIPE_SECRET_KEY` | Helst en begrenset nøkkel (`rk_live_...`), se under. En vanlig hemmelig nøkkel (`sk_live_...`) virker også |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` fra webhooken i punkt 7 |

```powershell
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Eller i Cloudflare-dashbordet: plattformen, Settings, Variables and Secrets. Legg begge i Bitwarden.

Den begrensede nøkkelen lages under [API keys](https://dashboard.stripe.com/apikeys) med disse tilgangene:

| Ressurs | Tilgang |
|---|---|
| Prices | Read |
| Tax rates | Read |
| Customers | Write |
| Checkout Sessions | Write |
| Subscriptions | Read |
| Customer portal | Write |
| Tax settings (bare med Stripe Tax) | Read |

Mangler en tilgang, ser du feilmeldingen fra Stripe på abonnementssiden når du er logget inn som plattformadmin.

Lokalt: sett testnøkkelen i terminalen før `npm run dev` (`$env:STRIPE_SECRET_KEY = "sk_test_..."`), og la Stripe CLI sende
hendelsene videre med `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Kommandoen skriver ut en egen
`whsec_` som settes som `$env:STRIPE_WEBHOOK_SECRET` i samme terminal.

## 9. Databasen: migrering 0010 før deploy

`drizzle/0010_abonnement.sql` er én migrering for tre ting, så du bare trenger å kjøre én:

- kolonnen `billing` på `sites` (abonnementet)
- kolonnen `redirects` på `sites` (301-omdirigeringer ved flytting fra gammel nettside)
- tabellen `invitations` (invitasjoner til et nettsted)

Kjør den mot produksjonsdatabasen **før** ny kode deployes:

```powershell
.\scripts\migrer-produksjon.ps1
```

Kommer koden ut før migreringen, feiler alle sider som leser nettsteder, fordi kolonnene ikke finnes.

## 10. Prøv i testmodus

1. Sett opp punkt 1 til 8 i testmodus, med testnøkler.
2. Åpne et nettsted i studioet, fanen Abonnement. Velg for eksempel månedlig med oppstart.
3. Betal med kortet 4242 4242 4242 4242, en dato fram i tid og hvilken som helst CVC.
4. Tilbake i studioet skal det stå «Aktivt» og neste betalingsdato.
5. Åpne fakturaen i Stripe og sjekk: norsk språk, nummer NETTGATA-0001, MVA 25 % i kroner, Grønberg Tech Solutions med
   927889404MVA, kjøpers navn og adresse, perioden på hver linje.
6. Trykk «Bytt kort, se fakturaer eller si opp» og si opp. Studioet skal vise «Sagt opp» med sluttdato.
7. Prøv å koble til et domene på et nettsted uten abonnement, logget inn som eier og ikke som admin. Du skal få beskjed om at
   eget domene er med i abonnementet.

## 11. Norske fakturakrav

Bokføringsforskriften § 5-1-1 til § 5-1-3, sjekket på Lovdata 01.11.2026:

| Krav | Hvor det er løst |
|---|---|
| Nummer og dato, kontrollerbar sekvens (§ 5-1-1 nr. 1, § 5-1-3) | Stripe nummererer når fakturaen er ferdig. Én serie for hele kontoen (punkt 3) |
| Selger: navn og org.nr. etterfulgt av MVA (§ 5-1-2) | Kontonavnet, skatte-ID-en 927889404MVA og bunnteksten (punkt 1 og 3) |
| Kjøper: navn, og adresse eller org.nr. (§ 5-1-2) | Checkout krever fakturaadresse. Bedriftsnavn og MVA-nummer kan fylles inn, og org.nr. fra studioet legges på kunden |
| Ytelsens art og omfang (nr. 3) | Produktnavnene og beskrivelsen på abonnementet, for eksempel «Nettside for Rørlegger Hansen» |
| Tidspunkt og sted for levering (nr. 4) | Perioden står på hver linje. Tjenesten leveres på nett |
| Vederlag og forfall (nr. 5) | Beløpene, og datoen kortet trekkes |
| Mva i norske kroner (nr. 6) | Skattesatsen på 25 %, alt i NOK |
| Utstedes senest én måned etter levering (§ 5-2-2) | Abonnementet faktureres forskuddsvis for hver periode |
| «Foretaksregisteret» på fakturaen | Gjelder AS, ASA og filialer. Ikke påkrevd for et enkeltpersonforetak |

Oppbevaring: fakturaene er primærdokumentasjon og skal oppbevares i fem år etter regnskapsårets slutt
(bokføringsloven § 13), med sikkerhetskopi. Ikke regn med at Stripe-kontoen er arkivet. Last ned fakturaene hver måned
(Billing, Invoices, eksport) og legg dem sammen med de andre i `HELENE CLOUD REGNSKAP`, eller koble Stripe til
regnskapsprogrammet.

## 12. Valg og grenser du bør vite om

- Tillegget AI-team og sosiale medier står under «Senere» i produktspesifikasjonen. Det er skjult på abonnementssiden og
  avvises av serveren til `ADDON_AVAILABLE` i `lib/billing/plans.ts` settes til `true`, så ingen kan betale for noe som
  ikke er levert. Prisene for tillegget i Stripe kan vente til da.
- Bytte mellom måned og år, legge til tillegget, eller bytte plan når et nettsted blir nettbutikk, gjøres i Stripe-dashbordet.
- Slettes et nettsted, må abonnementet sies opp i Stripe. Hendelser om det blir bare kvittert.
- Oppstarten betales sammen med første betaling. Studioet viser «Oppstart: Betalt» med dato, så du ser hvem som har kjøpt den.
- Kunder du fakturerer selv: fanen Abonnement, boksen «For plattformadmin», «Fakturert utenom Stripe». Notatet ser bare du.
  Har kunden også et abonnement i Stripe, må det sies opp der, ellers betaler kunden to ganger.

## Filer

- `lib/billing/plans.ts`: priser, oppslagsnøkler og utregning av første betaling
- `lib/billing/stripe.ts`: Stripe-klienten med fetch, låst API-versjon
- `lib/billing/webhook.ts`: sjekk av Stripe-Signature (HMAC-SHA256, fem minutters vindu)
- `lib/billing/checkout.ts`: priser, mva, kunde, Checkout og kundeportal
- `lib/billing/sync.ts`: hendelsene fra Stripe, bekreftelse når kunden kommer tilbake, «fakturert utenom Stripe»
- `lib/billing/state.ts`: hva som lagres, hvem som regnes som betalende, og teksten kunden ser
- `app/api/stripe/webhook/route.ts`: webhooken
- `app/studio/nettsted/[siteId]/abonnement/`: fanen Abonnement
