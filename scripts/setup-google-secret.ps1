# Puts the Google OAuth Client Secret in the two places the backend needs it,
# without saving it to disk or showing it on screen:
#   1. Supabase Auth -> Google provider (for "Sign in with Google")
#   2. Edge Function secret GOOGLE_CLIENT_SECRET (for Drive / Sheets)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$secure = Read-Host "Paste the Google Client Secret (starts with GOCSPX-) and press Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$secret = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)).Trim()
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if (-not $secret.StartsWith("GOCSPX-")) {
  Write-Host "That is not the Client secret (it must start with GOCSPX-; the Client ID ends with .apps.googleusercontent.com). Nothing was changed."
  exit 1
}

try {
  Write-Host "1/2 Saving the Edge Function secret..."
  npx.cmd --yes supabase@2.121.0 secrets set "GOOGLE_CLIENT_SECRET=$secret" | Out-Null

  Write-Host "2/2 Enabling Sign in with Google in Supabase Auth..."
  $env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET = $secret
  "y" | npx.cmd --yes supabase@2.121.0 config push | Select-String -Pattern "external|google|pushed|Error" | ForEach-Object { $_.Line }
}
finally {
  Remove-Item Env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET -ErrorAction SilentlyContinue
  $secret = $null
}
Write-Host "Done. You can close the Google Cloud dialog now (click OK)."
