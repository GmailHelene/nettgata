# Klargjør produksjonsdatabasen og lager admin-brukeren. Kjøres av Helene.
# Verdiene skrives inn her og brukes bare i denne kjøringen:
# de vises ikke på skjermen, lagres ikke i filer og går ikke gjennom Claude.
#
# Hemmelighetene i Cloudflare settes ikke herfra:
# - DATABASE_URL legges inn i dashbordet (plattformen → Settings → Variables and Secrets)
# - SESSION_SECRET er allerede satt med en tilfeldig verdi
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Assert-Ok([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step feilet. Ingenting mer er gjort." }
}

try {
  Write-Host ""
  Write-Host "Oppsett av plattformen i produksjon" -ForegroundColor Cyan
  Write-Host "Ingenting du skriver her vises eller lagres i filer."
  Write-Host ""

  $dbUrl = Read-Secret "Lim inn DATABASE_URL fra Vercel (Ctrl+V, så Enter)"
  # Tål at hele linjen fra .env.local er kopiert: DATABASE_URL="postgresql://..."
  $dbUrl = ($dbUrl -replace '^\s*(export\s+)?[A-Za-z_]+\s*=\s*', '').Trim().Trim('"', "'")
  if ($dbUrl -notmatch '^postgres(ql)?://') {
    throw "Det ser ikke ut som en databaseadresse. Den skal starte med postgres:// eller postgresql://. Kjør skriptet på nytt."
  }
  $env:DATABASE_URL = $dbUrl

  Write-Host "1/2 Sjekker at tabellene er på plass..."
  npx tsx db/migrate.ts
  Assert-Ok "Migreringen"

  Write-Host "2/2 Lager admin-brukeren din og demo-nettstedet..."
  $email = (Read-Host "E-post du vil logge inn i studioet med").Trim()
  $password = Read-Secret "Velg passord (minst 12 tegn)"
  if ($password.Length -lt 12) { throw "Passordet må ha minst 12 tegn. Kjør skriptet på nytt." }
  $env:SEED_ADMIN_EMAIL = $email
  $env:SEED_ADMIN_PASSWORD = $password
  npx tsx db/seed.ts
  Assert-Ok "Oppretting av admin"

  Write-Host ""
  Write-Host "Ferdig. Studio: https://plattformen.helene721.workers.dev/studio" -ForegroundColor Green
  Write-Host "Lagre passordet i Bitwarden."
}
catch {
  Write-Host ""
  Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
  Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $dbUrl = $null; $password = $null
}
