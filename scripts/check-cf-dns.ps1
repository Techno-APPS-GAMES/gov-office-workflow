$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
$headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)" }
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$zone = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId" -Headers $headers
Write-Host ("zone status={0} name={1}" -f $zone.result.status, $zone.result.name)
Write-Host ("ns: {0}" -f ($zone.result.name_servers -join ', '))
$dns = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?name=office-workflow-preview.walkwell.pk" -Headers $headers
$dns.result | ForEach-Object {
  Write-Host ("record type={0} name={1} content={2} proxied={3} id={4}" -f $_.type, $_.name, $_.content, $_.proxied, $_.id)
}
if (-not $dns.result) { Write-Host 'NO_DNS_RECORD' }

# Also list all DNS for walkwell.pk briefly
$all = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=20" -Headers $headers
Write-Host '--- sample records ---'
$all.result | Select-Object -First 10 | ForEach-Object {
  Write-Host ("{0} {1} -> {2}" -f $_.type, $_.name, $_.content)
}
