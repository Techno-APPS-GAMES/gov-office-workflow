$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}

$acct = $env:CLOUDFLARE_ACCOUNT_ID
$token = $env:CLOUDFLARE_API_TOKEN
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$hostname = 'office-workflow-preview.walkwell.pk'
$tunnelId = '1a814d34-a4a1-47fd-a36c-688f31870aa9'
$headers = @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
}

function Invoke-Cf($Method, $Uri, $BodyObj = $null) {
  $params = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($null -ne $BodyObj) {
    $params.Body = ($BodyObj | ConvertTo-Json -Depth 30 -Compress)
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
      Write-Host "API_ERROR $Method $Uri"
      Write-Host $text
    }
    throw
  }
}

Write-Host '== tunnels =='
$tunnels = Invoke-Cf GET "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel?is_deleted=false"
$tunnels.result | ForEach-Object { Write-Host ("{0} {1} status={2}" -f $_.name, $_.id, $_.status) }

# Ensure our tunnel exists
$tunnel = $tunnels.result | Where-Object { $_.id -eq $tunnelId -or $_.name -eq 'office-workflow-preview' } | Select-Object -First 1
if (-not $tunnel) { throw 'Tunnel missing — recreate needed' }
$tunnelId = $tunnel.id
Write-Host "Using tunnel $tunnelId"

Write-Host '== set ingress =='
Invoke-Cf PUT "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel/$tunnelId/configurations" @{
  config = @{
    ingress = @(
      @{
        hostname = $hostname
        service = 'http://127.0.0.1:3000'
      }
      @{ service = 'http_status:404' }
    )
  }
} | Out-Null

Write-Host '== dns records for hostname =='
$dns = Invoke-Cf GET "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?name=$hostname"
foreach ($r in @($dns.result)) {
  Write-Host ("delete {0} {1} {2}" -f $r.id, $r.type, $r.content)
  Invoke-Cf DELETE "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($r.id)" | Out-Null
}

Write-Host '== create proxied CNAME =='
$created = Invoke-Cf POST "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" @{
  type = 'CNAME'
  name = 'office-workflow-preview'
  content = "$tunnelId.cfargotunnel.com"
  proxied = $true
  ttl = 1
}
Write-Host ("created {0} proxied={1} content={2}" -f $created.result.name, $created.result.proxied, $created.result.content)

# Cloudflare sometimes needs the tunnel hostname association via hostname routes (Zero Trust)
Write-Host '== hostname route (if available) =='
try {
  $hr = Invoke-Cf POST "https://api.cloudflare.com/client/v4/accounts/$acct/routes/hostname" @{
    tunnel_id = $tunnelId
    hostname = $hostname
  }
  Write-Host ($hr | ConvertTo-Json -Depth 5 -Compress)
} catch {
  Write-Host 'hostname route endpoint not available (ok)'
}

Write-Host 'Waiting 15s for DNS...'
Start-Sleep 15
Write-Host '== DoH =='
curl.exe -s "https://cloudflare-dns.com/dns-query?name=$hostname&type=A" -H "accept: application/dns-json"
Write-Host ''
curl.exe -s "https://cloudflare-dns.com/dns-query?name=$hostname&type=CNAME" -H "accept: application/dns-json"
Write-Host ''
Write-Host "URL=https://$hostname/login"
