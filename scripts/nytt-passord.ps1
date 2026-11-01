# Viser hvilken e-post du logger inn i studioet med, og setter nytt passord om du vil. Kjøres av Helene.
# Databaseadressen og passordet vises ikke på skjermen, lagres ikke i filer og går ikke gjennom Claude.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

try {
  $dbUrl = Read-Secret "Lim inn DATABASE_URL fra Vercel (Ctrl+V, så Enter)"
  $dbUrl = ($dbUrl -replace '^\s*(export\s+)?[A-Za-z_]+\s*=\s*', '').Trim().Trim('"', "'")
  if ($dbUrl -notmatch '^postgres(ql)?://') { throw "Det ser ikke ut som en databaseadresse. Kjør skriptet på nytt." }
  $env:DATABASE_URL = $dbUrl

  npx tsx db/reset-password.ts
  if ($LASTEXITCODE -ne 0) { throw "Fikk ikke kontakt med databasen." }

  Write-Host ""
  $email = (Read-Host "Vil du sette nytt passord? Skriv e-posten, eller trykk Enter for å avslutte").Trim()
  if (-not $email) {
    Write-Host "Ingenting er endret."
    return
  }
  $password = Read-Secret "Nytt passord (minst 12 tegn)"
  $again = Read-Secret "Skriv det nye passordet en gang til"
  if ($password -ne $again) { throw "Passordene er ikke like. Ingenting er endret." }
  if ($password.Length -lt 12) { throw "Passordet må ha minst 12 tegn. Ingenting er endret." }
  $env:RESET_EMAIL = $email
  $env:RESET_PASSWORD = $password
  npx tsx db/reset-password.ts
  if ($LASTEXITCODE -ne 0) { throw "Passordet ble ikke endret." }
  Write-Host ""
  Write-Host "Ferdig. Logg inn på https://nettgata.no/studio, og lagre passordet i Bitwarden." -ForegroundColor Green
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
  Remove-Item Env:DATABASE_URL, Env:RESET_EMAIL, Env:RESET_PASSWORD -ErrorAction SilentlyContinue
  $dbUrl = $null; $password = $null; $again = $null
}
