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
$tunnelName = 'office-workflow-preview'
$cfDir = Join-Path $env:USERPROFILE '.cloudflared'
$headers = @{
  Authorization = "Bearer $token"
  'Content-Type' = 'application/json'
}

function CfApi($Method, $Uri, $Body = $null) {
  $params = @{ Method = $Method; Uri = $Uri; Headers = $headers }
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress) }
  return Invoke-RestMethod @params
}

Write-Host '== find or create tunnel =='
$existing = CfApi GET "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel?is_deleted=false&name=$tunnelName"
$tunnel = $existing.result | Where-Object { $_.name -eq $tunnelName } | Select-Object -First 1

if (-not $tunnel) {
  Write-Host "Creating tunnel $tunnelName..."
  # Cloudflare expects tunnel_secret as 32+ bytes, base64-encoded
  $secretBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($secretBytes)
  $tunnelSecret = [Convert]::ToBase64String($secretBytes)
  $created = CfApi POST "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel" @{
    name = $tunnelName
    tunnel_secret = $tunnelSecret
    config_src = 'cloudflare'
  }
  $tunnel = $created.result
  $creds = @{
    AccountTag = $acct
    TunnelSecret = $tunnelSecret
    TunnelID = $tunnel.id
    TunnelName = $tunnelName
  }
  $credPath = Join-Path $cfDir "$($tunnel.id).json"
  $creds | ConvertTo-Json | Set-Content -Path $credPath -Encoding UTF8
  Write-Host "Wrote $credPath"
} else {
  Write-Host "Tunnel exists: $($tunnel.id)"
}

$tunnelId = $tunnel.id
Write-Host "Tunnel ID: $tunnelId"

Write-Host '== get connector token =='
$tokenRes = CfApi GET "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel/$tunnelId/token"
$runToken = $tokenRes.result
if (-not $runToken) { throw 'No tunnel run token returned — API token may lack Tunnel:Edit permission' }
Set-Content -Path (Join-Path $cfDir 'office-workflow-preview.token') -Value $runToken -Encoding ASCII
Write-Host 'Saved run token'

Write-Host '== configure ingress (localhost:3000) =='
$configBody = @{
  config = @{
    ingress = @(
      @{ hostname = $hostname; service = 'http://127.0.0.1:3000' }
      @{ service = 'http_status:404' }
    )
  }
}
CfApi PUT "https://api.cloudflare.com/client/v4/accounts/$acct/cfd_tunnel/$tunnelId/configurations" $configBody | Out-Null
Write-Host 'Ingress configured'

Write-Host '== DNS CNAME =='
$dnsList = CfApi GET "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?type=CNAME&name=$hostname"
$dns = $dnsList.result | Select-Object -First 1
$cnameTarget = "$tunnelId.cfargotunnel.com"
if ($dns) {
  Write-Host "Updating existing DNS record $($dns.id)"
  CfApi PUT "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($dns.id)" @{
    type = 'CNAME'
    name = $hostname
    content = $cnameTarget
    proxied = $true
    ttl = 1
  } | Out-Null
} else {
  Write-Host 'Creating DNS CNAME'
  CfApi POST "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" @{
    type = 'CNAME'
    name = $hostname
    content = $cnameTarget
    proxied = $true
    ttl = 1
  } | Out-Null
}

Write-Host ''
Write-Host "READY_URL=https://$hostname"
Write-Host "TUNNEL_ID=$tunnelId"
