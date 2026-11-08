# Drift

## Publisere
I `C:\Users\helen\Desktop\nettgata-deploy`, bare det som er på origin/main:

    git fetch -q origin && git checkout -q --detach origin/main && npm run cf:deploy

Kjør `npm ci --no-audit --no-fund` først hvis pakkene er endret. Migreringer kjøres før publisering med `scripts\Migrer produksjon.cmd`.

## Rulle tilbake
    npx wrangler deployments list
    npx wrangler rollback <versionId> -y

Kode rulles tilbake, databasen gjør ikke det. Er en migrering kjørt, må den gamle koden tåle den nye tabellen.

## Cloudflare-plan
Workeren må stå på Workers Paid. Gratisplanen stopper hver forespørsel etter 10 ms regnetid, og da svarer nettgata.no med 503 og «error code: 1102» på omtrent annenhver side. Det skjedde 8. november 2026.

## Overvåking
`/api/helse` svarer selv om sidene feiler, fordi den ikke bygger noen side. Oppetidsvarslingen må derfor også sjekke `https://nettgata.no/`.

## Sikkerhetskopi
Kopien tas hver natt og krypteres med en nøkkel avledet fra `SESSION_SECRET` (`lib/backup.ts`). Mister du hemmeligheten, er kopiene uleselige. Bytter du den, kan gamle kopier ikke leses med den nye. Ta vare på den gamle i Bitwarden.
