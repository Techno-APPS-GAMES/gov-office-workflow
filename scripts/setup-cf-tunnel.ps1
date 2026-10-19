$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}

$acct = $env:CLOUDFLARE_ACCOUNT_ID
$token = $env:CLOUDFLARE_API_TOKEN
$headers = @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
}

Write-Host '== verify token =='
$verify = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$acct/tokens/verify" -Headers $headers
$verify | ConvertTo-Json -Depth 6

Write-Host '== list zones =='
$zones = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/zones?per_page=50' -Headers $headers
$zones.result | ForEach-Object { Write-Host ("zone: {0} ({1})" -f $_.name, $_.id) }
if (-not $zones.result) { Write-Host 'NO_ZONES' }

Write-Host '== list tunnels =='
try {
  $tunnels = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel?is_deleted=false" -Headers $headers
  $tunnels.result | ForEach-Object { Write-Host ("tunnel: {0} id={1} status={2}" -f $_.name, $_.id, $_.status) }
} catch {
  Write-Host ("TUNNEL_LIST_ERROR: " + $_.Exception.Message)
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
