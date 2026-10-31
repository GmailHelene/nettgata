# Plattformen

Norsk nettside- og nettbutikkplattform. Hva som bygges: `docs/PRODUKTSPEK.md`.

## Kjør lokalt

```bash
npm install
cp .env.example .env.local   # fyll inn SESSION_SECRET og SEED_ADMIN_*
npm run db:migrate           # PGlite i .data/ når DATABASE_URL er tom
npm run db:seed              # demo-nettsted for håndverkerpakken
npm run dev
```

- Studio: http://localhost:3000/studio
- Demo-nettsted: http://demo.localhost:3000

```bash
npm test             # Vitest mot PGlite i minnet
npm run typecheck
npm run lint
```

## Arkitektur

- Én Next.js-app serverer alle nettsteder. `app/[[...path]]` slår opp nettstedet på vertsnavnet (eget domene først, så `<slug>.<SITES_ROOT_DOMAIN>`).
- Studioet ligger under `/studio` og finnes bare på `PLATFORM_HOSTS`. Ingen proxy/middleware.
- Sider har kladd og publiserte versjoner (`page_versions`). Publisering lager en ny uforanderlig versjon; «Gå tilbake» publiserer en eldre versjon som ny.
- Seksjoner og felt er definert én gang i `lib/content/registry.ts`. Samme definisjon gir validering og redigeringsskjema.
- Tema er designtokens som må holde WCAG-kontrast 4.5:1 (`lib/theme.ts`).
- Database: Neon over HTTP i produksjon, PGlite lokalt og i tester.
- Hosting: Cloudflare Workers via OpenNext (`npm run cf:deploy`).

## Status fase 0 (31.10.2026)

Ferdig: datamodell, innlogging, domeneoppslag, studio med skjemaredigering, kladd, forhåndsvisningslenke, publisering, versjoner og tilbakerulling, demo for håndverkerpakken, 11 tester.

## Status fase 1a (31.10.2026)

Ferdig:
- Nettstedsinfo som én kilde (telefon, e-post, adresse, org.nr., åpningstider) som mates til meny, bunntekst, kontaktseksjon og strukturerte data
- Meny fra sidene, bunntekst med org.nr., «Hopp til innhold»-lenke
- Kontaktskjema med innboks i studioet, honningkrukke mot roboter, rate limiting og sletting av henvendelser
- Strukturerte data (schema.org per bransje), kanonisk lenke, sitemap.xml og robots.txt per domene
- Håndverkerpakken med tre designretninger og tre sider, laget fra bedriftens egne opplysninger
- «Nytt nettsted» med oppslag i Enhetsregisteret (kontrollsiffer sjekkes først)
- Sider: lag, slett, flytt, vis i menyen, publiser alle
- Innstillinger: navn, kontaktinfo og designretning, live med en gang
- Sperre mot gjentatte innloggingsforsøk (per e-post og per IP, IP lagres bare som hash)
- 26 tester, testet i nettleser mot ekte Brreg

Gjenstår før første pilot går live:
- Cloudflare-konto (Workers betalt plan, ca. 5 USD/mnd: bcrypt bruker mer CPU enn gratisnivået tillater) og Neon-prosjekt i Frankfurt
- Hemmeligheter med `wrangler secret put`, første deploy
- Cloudflare for SaaS for kundedomener, og domeneveiviser i studioet
- E-postvarsel til bedriften ved ny henvendelse (Brevo)
- Personvernerklæring generert fra nettstedsinfo (teksten må gjennom regelverksradaren)
- Bildeopplasting til R2 og en bildeseksjon
- Kantcaching av publiserte sider med tømming ved publisering
- Lenker i menyen virker ikke i forhåndsvisning (de peker til live-stier)
