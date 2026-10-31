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

Gjenstår før noe går live:
- Rate limiting på innlogging (Cloudflare-regel eller Durable Object)
- Cloudflare Workers betalt plan: bcrypt bruker mer CPU enn gratisnivået tillater
- Neon-prosjekt i Frankfurt, `wrangler secret put` for hemmeligheter
- Cloudflare for SaaS for kundedomener, og domeneveiviser i studioet
- Kantcaching av publiserte sider med tømming ved publisering
- Bildeopplasting til R2, flere seksjoner, flere sider per nettsted fra studioet
