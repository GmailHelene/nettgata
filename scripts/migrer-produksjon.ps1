# Oppdaterer tabellene i produksjonsdatabasen etter at nye migreringer er lagt til.
# Kjøres av Helene. Databaseadressen limes inn her, vises ikke og lagres ikke.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

try {
  $secure = Read-Host "Lim inn DATABASE_URL fra Bitwarden (Ctrl+V, så Enter)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $dbUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  $dbUrl = ($dbUrl -replace '^\s*(export\s+)?[A-Za-z_]+\s*=\s*', '').Trim().Trim('"', "'")
  if ($dbUrl -notmatch '^postgres(ql)?://') { throw "Det ser ikke ut som en databaseadresse. Kjør skriptet på nytt." }

  $env:DATABASE_URL = $dbUrl
  npx tsx db/migrate.ts
  if ($LASTEXITCODE -ne 0) { throw "Migreringen feilet." }
  Write-Host "Databasen er oppdatert." -ForegroundColor Green
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  $dbUrl = $null
}
