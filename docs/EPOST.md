# E-post: slik slås den på

Koden er ferdig og testet. Uten oppsett sendes ingenting: e-postene lagres bare i loggen, og ordresiden
viser «Ikke sendt, e-post er ikke slått på ennå». Lokalt kan hver e-post forhåndsvises fra ordresiden.

## Hva som sendes

| E-post | Til | Når | Kan slås av |
|---|---|---|---|
| Ordrebekreftelse | Kunden | Ved bestilling | Nei |
| Ny ordre | Butikken | Ved bestilling | Ja |
| «Pakken er på vei» med sporing | Kunden | Ordren markeres som sendt (ikke for henting) | Ja |
| Ny henvendelse | Bedriften | Kontaktskjemaet sendes | Ja |
| Timen er bestilt, med avbestillingslenke | Kunden | Egen booking (se `BOOKING.md`) | Nei |
| Ny time | Bedriften | Egen booking | Ja, under Booking |
| Timen er avbestilt | Kunden | Kunden eller bedriften avbestiller | Nei |
| Time avbestilt | Bedriften | Kunden avbestiller med lenken | Ja, under Booking |
| Bekreft påmeldingen (dobbel opt-in) | Den som meldte seg på | Påmelding til nyhetsbrevet | Nei |
| Nyhetsbrev, med avmeldingslenke og List-Unsubscribe | Bekreftede abonnenter | Bedriften trykker «Send», i porsjoner hvert tiende minutt | Abonnenten melder seg av |
| Testutgave av nyhetsbrevet | Den som er logget inn | «Send testutgave til meg» | Nei |
| Månedsrapport: besøk, mest leste sider, kilder, henvendelser, ordre og omsetning, «fiks nå» | Eieren, og redaktører som slår den på | Den 1. i måneden (norsk tid), i porsjoner hvert tiende minutt | Ja, per bruker under Innstillinger, Rapporter på e-post |
| «X nye forslag» fra den ukentlige AI-rapporten | Eieren, og redaktører som slår den på | Når en ukentlig kjøring gir forslag | Ja, per bruker under Innstillinger, Rapporter på e-post |

Avsender er alltid plattformens adresse (`EMAIL_FROM`), med butikkens navn som avsendernavn. Svar fra kunden
går til butikkens kontaktadresse (replyTo), og svar på en henvendelse går rett til den som skrev.
Varsler går til adressen under Innstillinger, Varsler på e-post, ellers til kontaktadressen.

E-postene sendes etter at kunden har fått svar (`after()`), så kassen aldri venter på e-posten.
En e-post som feiler stopper ingenting, men står som «Feilet» med feilmeldingen på ordren.
Innholdet lagres ikke, bare mottaker, emne og status.

## Oppsett (Helene gjør)

1. I Brevo: Senders, Domains & Dedicated IPs, Domains, legg til `nettgata.no`. Brevo viser DNS-oppføringer
   (kode, DKIM og DMARC). Send dem til Claude, eller legg dem inn i Cloudflare under nettgata.no, DNS.
2. SPF i `docs/dns/nettgata.no.zone` er `v=spf1 -all` (ingen e-post). Den må endres etter Brevo sin
   veiledning før e-post sendes, ellers havner e-postene i søppelpost.
3. I Brevo: SMTP & API, API Keys, lag en nøkkel «Nettgata». Lagre den i Bitwarden.
4. Cloudflare: Workers & Pages, plattformen, Settings, Variables and Secrets, Add. Type Secret,
   navn `BREVO_API_KEY`, lim inn nøkkelen.
5. Claude setter `EMAIL_FROM` (for eksempel `ordre@nettgata.no`) i `wrangler.jsonc` og deployer.

Nyhetsbrev sendes som vanlig transaksjonell e-post, én per mottaker, maks 150 per kjøring av bakgrunnsjobben
(`NEWSLETTER_PER_RUN` i `lib/nyhetsbrev/send.ts`). Hver mottaker har status i `newsletter_deliveries`, og innholdet
lagres ikke i `email_log`. Brevo sitt eget krav til markedsføringsepost bør sjekkes før de første nyhetsbrevene går ut.

Månedsrapporten (`lib/rapport/maned.ts`) og e-posten om ukentlige forslag (`lib/rapport/ai-epost.ts`) sendes fra «Nettgata»
til brukerne i studioet, ikke til bedriftens kunder. Månedsrapporten sendes til 25 nettsteder per kjøring
(`MONTHLY_REPORT_SITES_PER_RUN`) fra den 1. til og med den 3. Raden i `monthly_reports` lages før noe sendes, så samme
rapport aldri går ut to ganger. Begge logges i `email_log` (`manedsrapport` og `ai-forslag`).

Kostnad: Brevo sin gratisplan har en daglig grense. Når butikkene sender mer, må planen oppgraderes.
Kostnaden føres på Grønberg Tech Solutions.

## Før lansering

Ordrebekreftelsen lenker til kjøpsvilkårene og angreretten. Om bekreftelsen oppfyller kravene til
bekreftelse på varig medium, må sjekkes mot regelverksradaren før første ekte kunde.
