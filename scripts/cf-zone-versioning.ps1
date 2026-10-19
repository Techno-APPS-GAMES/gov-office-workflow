$ErrorActionPreference = 'Continue'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
$headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)"; 'Content-Type'='application/json' }
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$acct = $env:CLOUDFLARE_ACCOUNT_ID

$urls = @(
  "https://api.cloudflare.com/client/v4/zones/$zoneId/settings/versioning",
  "https://api.cloudflare.com/client/v4/zones/$zoneId/versioning",
  "https://api.cloudflare.com/client/v4/zones/$zoneId/versions",
  "https://api.cloudflare.com/client/v4/accounts/$acct/zones/$zoneId/versions",
  "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_settings"
)

foreach ($u in $urls) {
  Write-Host "GET $u"
  try {
    $r = Invoke-RestMethod -Uri $u -Headers $headers
    Write-Host ($r | ConvertTo-Json -Depth 8)
  } catch {
    Write-Host ("  -> " + $_.Exception.Message)
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  }
  Write-Host ''
}
