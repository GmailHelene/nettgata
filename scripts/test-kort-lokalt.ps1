# Starter Nettgata lokalt med testnøkkelen fra Stripe, så kortbetaling kan prøves med testkort.
# Kjøres av Helene. Nøkkelen limes inn her, vises ikke, lagres ikke og forsvinner når vinduet lukkes.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

try {
  $secure = Read-Host "Lim inn testnøkkelen fra Stripe (sk_test_...) med Ctrl+V (ingenting vises), så Enter" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($key -notmatch '^(sk|rk)_test_') { throw "Dette er ikke en testnøkkel. Bruk nøkkelen fra sandkassen, aldri den ekte." }

  $env:STRIPE_SECRET_KEY = $key
  Write-Host "Starter Nettgata på http://localhost:3000. La dette vinduet stå åpent." -ForegroundColor Green
  npm run dev
}
catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
  Remove-Item Env:STRIPE_SECRET_KEY -ErrorAction SilentlyContinue
  $key = $null
}
