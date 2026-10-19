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
$acct = $env:CLOUDFLARE_ACCOUNT_ID
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$hostname = 'office-workflow-preview.walkwell.pk'
$tunnelId = '1a814d34-a4a1-47fd-a36c-688f31870aa9'
$target = "$tunnelId.cfargotunnel.com"

# Delete existing record(s)
$list = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?name=$hostname" -Headers $headers
foreach ($r in $list.result) {
  Write-Host "Deleting $($r.id) $($r.type) $($r.content)"
  Invoke-RestMethod -Method DELETE -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($r.id)" -Headers $headers | Out-Null
}

# Create fresh proxied CNAME
$body = @{
  type = 'CNAME'
  name = 'office-workflow-preview'
  content = $target
  proxied = $true
  ttl = 1
  comment = 'Gov office workflow named tunnel'
} | ConvertTo-Json -Compress

Write-Host 'Creating CNAME...'
$created = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Headers $headers -Body $body
Write-Host ($created | ConvertTo-Json -Depth 6)

# Also try Cloudflare tunnel route DNS endpoint
Write-Host '== tunnel route dns API =='
try {
  $route = Invoke-RestMethod -Method PUT -Uri "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel/$tunnelId/configurations" -Headers $headers -Body (@{
    config = @{
      ingress = @(
        @{ hostname = $hostname; service = 'http://127.0.0.1:3000'; originRequest = @{ noTLSVerify = $true } }
        @{ service = 'http_status:404' }
      )
    }
  } | ConvertTo-Json -Depth 20 -Compress)
  Write-Host 'ingress ok'
} catch {
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}

Start-Sleep 5
Write-Host '== DoH check =='
curl.exe -s "https://cloudflare-dns.com/dns-query?name=$hostname&type=A" -H "accept: application/dns-json"
Write-Host ''
curl.exe -s "https://cloudflare-dns.com/dns-query?name=$hostname&type=CNAME" -H "accept: application/dns-json"
Write-Host ''
