# Domenekobling: slik slås den på

Koden er ferdig og testet. Den er slått av i produksjon til plattformen har eget domene i Cloudflare.
Uten oppsett viser studioet «kommer snart». Lokalt kjører en simulert utgave, så hele flyten kan prøves.

## Slik virker det

1. Kunden skriver domenet i studioet (Innstillinger, Domene). Vi sjekker at det er kjøpt (DNS-oppslag).
2. Hvert domene får en egen, tilfeldig peker: `<token>.kunder.<plattformdomene>`. Vertsnavnene (www og hoveddomenet)
   meldes inn hos Cloudflare for SaaS.
3. Kunden legger inn CNAME for www og ANAME (eller videresending) for hoveddomenet hos forhandleren.
4. Studioet sjekker hvert 20. sekund mens siden er åpen. I tillegg sjekker bakgrunnsjobben hvert tiende minutt.
   Domenet aktiveres når Cloudflare har bekreftet det, sertifikatet er klart og DNS peker til nettopp denne pekeren.
5. Hoveddomenet, ekstra domener og gratisadressen sender videre (308) til hovedadressen.

Sikkerhet: Cloudflare sin egen sjekk ser bare at domenet peker til plattformen, ikke til hvilket nettsted.
Den unike pekeren gjør at ingen kan legge inn et domene de ikke eier og få det når eieren peker DNS hit.
Ubekreftede krav holdes av i 48 timer, og slettes etter 14 dager. Aktive domener som slutter å peke hit,
kobles fra etter 72 timer.

## Oppsett, steg for steg

1. Velg plattformdomenet og legg det til som sone i Cloudflare (Free holder).
2. Legg inn betalingskort på Cloudflare-kontoen. Kostnaden føres på Grønberg Tech Solutions.
3. Slå på Cloudflare for SaaS: SSL/TLS, Custom Hostnames.
4. DNS i plattformsonen, alle med oransje sky (proxied):
   - `fallback` AAAA `100::`. Sett den som Fallback Origin under Custom Hostnames.
   - `*.kunder` CNAME `fallback.<plattformdomene>`. Dette er pekerne kundene bruker.
   - `*` (gratisadresser `<navn>.<plattformdomene>`) CNAME `fallback.<plattformdomene>`.
5. Worker-rute `*/*` på plattformsonen til Workeren «plattformen».
6. API-token: My Profile, API Tokens, Create Token, Custom. Tilgang: Zone, SSL and Certificates, Edit,
   bare plattformsonen. Lagres i Bitwarden. Settes som hemmelighet `CF_API_TOKEN` på Workeren. Helene limer inn selv.
7. I `wrangler.jsonc`: `CF_ZONE_ID` (fra sonens oversikt), `CUSTOM_DOMAIN_TARGET` = `kunder.<plattformdomene>`,
   `SITES_ROOT_DOMAIN` = `<plattformdomene>`.
8. Migrer produksjon (`scripts/migrer-produksjon.ps1`, minst til 0007) og deploy.
9. Test med et eget testdomene: legg til, legg inn CNAME, se at det blir aktivt, at https virker og at
   hoveddomenet sender videre til www.

## Kostnad

Cloudflare for SaaS: 100 vertsnavn gratis, deretter 0,10 dollar per vertsnavn per måned (prisside oppdatert august 2026).
Et domene med ANAME bruker to (www og hoveddomenet), med videresending ett. Ventende vertsnavn teller også,
derfor slettes de etter 14 dager.

## Kjente grenser

- .no kan ikke kjøpes inne i plattformen. Cloudflare Registrar støtter ikke .no, og Domeneshop sitt API kan ikke
  registrere domener. Kunden kjøper selv, i eget navn.
- Hoveddomenet uten www trenger ANAME eller ALIAS hos forhandleren. Faste IP-adresser krever Enterprise hos Cloudflare.
- Ligger kundens DNS hos Cloudflare, må www-pekeren stå som «DNS only» (grå sky), ellers ser vi ikke CNAME-en.
- Kobling skal åpnes bare for betalende abonnement når betalingen er bygget.
