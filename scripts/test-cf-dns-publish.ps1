$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
$headers = @{
  Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)"
  'Content-Type' = 'application/json'
}
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$tunnelId = '1a814d34-a4a1-47fd-a36c-688f31870aa9'

# Create a plain A record test
$testName = 'gow-dns-test'
$body = @{ type='A'; name=$testName; content='203.0.113.10'; proxied=$false; ttl=120 } | ConvertTo-Json -Compress
$created = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Headers $headers -Body $body
Write-Host ("created test id={0} name={1}" -f $created.result.id, $created.result.name)
Start-Sleep 3
Write-Host 'DoH test A:'
curl.exe -s "https://cloudflare-dns.com/dns-query?name=gow-dns-test.walkwell.pk&type=A" -H "accept: application/dns-json"
Write-Host ''

# Recreate tunnel hostname as DNS-only CNAME
$list = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?name=office-workflow-preview.walkwell.pk" -Headers $headers
foreach ($r in $list.result) {
  Invoke-RestMethod -Method DELETE -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($r.id)" -Headers $headers | Out-Null
}
$cname = @{
  type='CNAME'
  name='office-workflow-preview'
  content="$tunnelId.cfargotunnel.com"
  proxied=$false
  ttl=120
} | ConvertTo-Json -Compress
$c = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Headers $headers -Body $cname
Write-Host ("created cname proxied=false id={0}" -f $c.result.id)
Start-Sleep 3
Write-Host 'DoH CNAME:'
curl.exe -s "https://cloudflare-dns.com/dns-query?name=office-workflow-preview.walkwell.pk&type=CNAME" -H "accept: application/dns-json"
Write-Host ''
Write-Host 'DoH A:'
curl.exe -s "https://cloudflare-dns.com/dns-query?name=office-workflow-preview.walkwell.pk&type=A" -H "accept: application/dns-json"
Write-Host ''

# cleanup test A
Invoke-RestMethod -Method DELETE -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($created.result.id)" -Headers $headers | Out-Null
Write-Host 'cleaned test A'
