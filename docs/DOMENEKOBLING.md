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

## Valgt navn: Nettgata (31.10.2026)

Plattformdomenet er `nettgata.no`. Verdiene under brukes i oppsettet:

| Hva | Verdi |
|---|---|
| Plattform og studio | `nettgata.no` (studio på `nettgata.no/studio`) |
| Gratisadresser | `<navn>.nettgata.no` (`SITES_ROOT_DOMAIN=nettgata.no`) |
| Pekeren kundene bruker | `<token>.kunder.nettgata.no` (`CUSTOM_DOMAIN_TARGET=kunder.nettgata.no`) |
| Reserveadresse (fallback) | `fallback.nettgata.no` |

Underdomener som `www`, `studio`, `kunder`, `fallback`, `mail` og `test` kan aldri bli en kundes gratisadresse (se `RESERVED_SLUGS` i `lib/sites.ts`).

### Helene gjør

Ferdig 31.10.2026: nettgata.no og nettgata.com er kjøpt i Grønberg Tech Solutions sitt navn, lagt til i Cloudflare (Free)
og har fått Cloudflare sine navnetjenere (eloise og mark). Betalingskort ligger i Cloudflare.

Når Cloudflare har sendt e-post om at nettgata.no er aktivt:

1. **DNS:** nettgata.no, DNS, Records, «Import and Export», Import. Velg filen `docs/dns/nettgata.no.zone`
   og huk av «Proxy imported DNS records». Sjekk etterpå at alle fem AAAA-oppføringene har oransje sky.
   31.10.2026 kom de inn med grå sky likevel, og da blir Fallback Origin stående på «Pending Deployment (Error)».
2. **Cloudflare for SaaS:** nettgata.no, SSL/TLS, Custom Hostnames. Slå det på, og sett Fallback Origin til
   `fallback.nettgata.no`.
3. **API-nøkkel:** Profil, API Tokens, Create Token, Custom token. Navn «Nettgata domenekobling». Tilgang:
   Zone, SSL and Certificates, Edit. Zone Resources: Include, Specific zone, nettgata.no. Ingen andre tilganger.
   Lagre nøkkelen i Bitwarden.
4. **Hemmelighet:** Workers & Pages, plattformen, Settings, Variables and Secrets, Add. Type Secret,
   navn `CF_API_TOKEN`, lim inn nøkkelen.
5. **Zone ID:** Står på oversiktssiden for nettgata.no, under «API». Den er ikke hemmelig og kan sendes til Claude.

### Claude gjør ved oppstart

- `wrangler.jsonc`: ruter `*/*` (sone nettgata.no) og `*nettgata.com/*` (sone nettgata.com), og variablene
  `PLATFORM_HOSTS=nettgata.no,plattformen.helene721.workers.dev`, `SITES_ROOT_DOMAIN=nettgata.no`,
  `CF_ZONE_ID`, `CUSTOM_DOMAIN_TARGET=kunder.nettgata.no`,
  `PLATFORM_ALIASES=nettgata.com,www.nettgata.com,www.nettgata.no`, `PLATFORM_CANONICAL_HOST=nettgata.no`.
- Deploy, så test: nettgata.no, www og nettgata.com sender videre, en gratisadresse, og et testdomene
  (for eksempel et underdomene av helene.cloud) gjennom hele veiviseren.
- Når kundene kommer: Workers gratisplan tåler 100 000 forespørsler i døgnet. Oppgrader til Workers Paid før det.

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
