# AI-teamet (tillegget til 249 kr i måneden)

Kort utviklerdokumentasjon. Skrevet 01.11.2026. Plan godkjent av Helene samme dag, med Claude Opus 5.5.

## Hva det gjør

- **Hver natt** ser AI-teamet gjennom hvert nettsted som har tillegget aktivt i Stripe, og lager opptil 8 forslag. Det finnes tre roller: SEO, innhold og markedsføring, og butikk og drift. Hvert forslag sier hva som er svakt, hva endringen skal gi, og viser teksten slik den er nå og slik den blir.
- **Typer forslag:**
  - tittel og beskrivelse for Google
  - ny tekst i ett tekstfelt i én seksjon
  - utkast til blogginnlegg
  - innlegg til Facebook eller Instagram, som kunden kopierer selv fordi Meta-publisering er «Senere»
  - tips til butikken, der ingenting endres
- **Godkjenn** skriver endringen inn i **kladden**, aldri rett til det publiserte nettstedet. Kunden publiserer selv og kan gå tilbake til en tidligere versjon som vanlig. Et blogginnlegg blir en upublisert kladd under `/blogg`.
- **Utdatert:** har kunden endret teksten etter at forslaget ble laget, brukes ikke forslaget. Det kunden har skrevet, beholdes, og forslaget merkes «utdatert».
- **«Lag nye forslag nå»** i studioet kan brukes 3 ganger i døgnet. Disse kjøringene går direkte mot API-et, ikke via Batch API.
- **Studioet:** fanen AI-teamet (`/studio/nettsted/<id>/ai-teamet`) har et merke med antall nye forslag. Alle med tilgang til nettstedet kan godkjenne, på samme måte som alle kan redigere sider.

## Hvem som får det

`aiTeamActive()` i `lib/ai/access.ts` krever at tillegget ligger på abonnementet i Stripe (`billing.addon`, skrevet av webhooken) og at abonnementet er `active`, `trialing` eller `past_due`. «Fakturert utenom Stripe» gir ikke tillegget. Sperren sjekkes i studioet, i `runNow` og i nattkjøringen.

Tillegget velges i Checkout sammen med abonnementet (`ADDON_AVAILABLE = true` i `lib/billing/plans.ts`). Kunder som alt har abonnement, kan legge det til eller fjerne det under Abonnement (`lib/billing/addon.ts`). Da oppdateres abonnementet i Stripe med forholdsmessig pris (`create_prorations`) og 25 % mva.

## Modell og kostnad

| | |
|---|---|
| Modell | `claude-opus-5-5`, innsats `medium`, strukturert svar (JSON-skjema i `lib/ai/prompt.ts`) |
| Nattkjøring | Batch API, halv pris |
| Anslag | Rundt 22 kr i måneden per nettsted med daglig kjøring (15 000 tokens inn, 4 000 ut) |
| Kostnadstak | 40 kr per nettsted per kalendermåned (`MONTHLY_CAP_ORE`). Kjøringer som venter, regnes med 3 kr hver, så taket holder også da. Når taket er nådd, får kunden beskjed om pause til den 1. |
| Kurs | 11,5 kr per dollar (`NOK_PER_USD`), satt litt høyt med vilje |

Kostnaden per kjøring regnes ut fra `usage` i svaret og lagres i øre i `ai_runs.cost_ore`. Plattformadmin ser forbruket nederst på AI-siden.

Fallback-modell ved avslag (`fallbacks`) er ikke slått på, fordi Batch API ikke tillater det. Et avslag gir en feilet kjøring uten forslag.

## Hva som sendes til Anthropic

Bare det `buildSiteContext()` i `lib/ai/context.ts` bygger:

- **Nettstedet:** navn, type, bransjepakke og poststed.
- **Sidene:** teksten i alle sider fra kladden (inntil 30), seksjoner med id og type, SEO-tittel og beskrivelse. Bildeadresser og lenker fjernes, bare alt-teksten blir med.
- **Varene,** for nettbutikk: navn, status, beskrivelse (maks 600 tegn), priser og samlet lager (inntil 100).

Dette sendes **ikke**: henvendelser, ordre, kunder, brukere, e-postlogg, telefon, e-post og adresse. `tests/ai-teamet.test.ts` legger inn henvendelser, ordre og kontaktopplysninger med egne merkelapper og sjekker at ingen av dem finnes i forespørselen.

Personvernerklæringen (`lib/legal/personvern.ts`, flagget `ai`) og underleverandørlisten (`lib/legal/underleverandorer.ts`) dekker allerede dette. Anthropic Ireland og PBC er oppført, med behandling i USA, standardkontraktsbestemmelser og sletting innen 30 dager.

## Lagring

- `ai_runs` (migrering 0012): én rad per kjøring med nettsted, `natt` eller `manuell`, status (`venter`, `ferdig`, `feilet`), batch-id, tokens, kostnad i øre, antall forslag og feil.
- `ai_suggestions`: rolle, type, side, seksjon, felt, verdien før, forslaget, begrunnelse, effekt, status (`ny`, `godkjent`, `avvist`, `utdatert`), hvem som bestemte og når.
- Revisjonsloggen får `ai.run_started`, `ai.approved`, `ai.rejected`, `billing.addon_added` og `billing.addon_removed`.
- Avviste og utdaterte forslag slettes etter 90 dager (`lib/retention.ts`, hver natt). Godkjente beholdes som historikk.

## Bakgrunnsjobber

| Jobb | Når | Hva |
|---|---|---|
| `/api/cron/ai-natt` | Hver natt, 01:30 UTC (sammen med sikkerhetskopien) | Sender én forespørsel per nettsted med tillegg og plass under taket, i én batch |
| `/api/cron/ai` | Hvert tiende minutt | Henter svar fra ferdige batcher. En kjøring behandles bare én gang. Kjøringer eldre enn 26 timer settes til feilet |

Begge krever cron-nøkkelen fra `SESSION_SECRET`, som de andre jobbene. Mangler `ANTHROPIC_API_KEY`, gjør jobbene ingenting.

## Sikkerhet mot feil fra modellen

`validateSuggestions()` i `lib/ai/suggestions.ts` forkaster forslag som:
- peker på en side som ikke tilhører nettstedet
- peker på en seksjon eller et felt som ikke finnes
- gjelder et felt som ikke er et tekstfelt
- er for lange, eller er lik dagens tekst
- er et innlegg til sosiale medier uten kanal

Tankestrek byttes til vanlig bindestrek. Teksten valideres på nytt av `saveDraft` når kunden godkjenner. Prompten sier at innholdet er data og ikke instruksjoner.

## Filer

| Fil | Hva |
|---|---|
| `lib/ai/config.ts` | Modell, priser, kostnadstak, grenser og `costOre()` |
| `lib/ai/access.ts` | `aiTeamActive()`, også i nettleseren |
| `lib/ai/client.ts` | Anthropic-klienten bak et lite grensesnitt, `setAiClientForTests()` |
| `lib/ai/context.ts` | Det eneste som bestemmer hva AI-en får se |
| `lib/ai/prompt.ts` | Systemprompt, JSON-skjema og forespørselen |
| `lib/ai/suggestions.ts` | Validering, Godkjenn, Avvis og lister |
| `lib/ai/runs.ts` | Manuell kjøring, nattkjøring, henting av batcher og kostnadstak |
| `lib/billing/addon.ts` | Legge til og fjerne tillegget på et abonnement som løper |
| `app/studio/nettsted/[siteId]/ai-teamet/` | Studiosiden |
| `tests/ai-teamet.test.ts` | Tester med falsk Anthropic og falsk Stripe |

## Før lansering (Helene)

1. **Stripe:** gjort 01.11.2026. Produktet «Nettgata AI-team» finnes i live (acct_1UWp4gD4xnLUsEMI) med `nettgata_tillegg_ai_mnd` (249 kr månedlig) og `nettgata_tillegg_ai_ar` (2 988 kr årlig), NOK og uten mva. Koden sjekker beløp, valuta, intervall og mva mot `lib/billing/plans.ts` før hver betaling.
2. **Anthropic:** lag en API-nøkkel i Anthropic Console, gjerne i et eget arbeidsområde med månedlig forbruksgrense. Legg den inn som Secret i Cloudflare:
   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   Lim inn nøkkelen når den spør. Den lagres bare i Cloudflare, aldri i filer eller git.
3. **Deploy** med `npm run cf:deploy` etter at migrering 0012 er kjørt mot Neon (`npm run db:migrate` med `DATABASE_URL`).
4. **Prøv på ett nettsted:** gi et testnettsted tillegget i Stripe testmodus, trykk «Lag nye forslag nå», godkjenn ett og avvis ett.

Skal tillegget skjules igjen, settes `ADDON_AVAILABLE = false`. Da kan det ikke kjøpes, men kunder som har det, beholder det.

## Ikke med ennå

- Ukentlig rapport for alle i grunnprisen. Motoren kan brukes, med en annen sperre.
- Effektmåling i neste rapport.
- Publisering rett til Facebook og Instagram.
- Nyhetsbrev, alt-tekst på bilder (AI-en ser ikke bildene) og helsesjekk av skjema og lenker.
