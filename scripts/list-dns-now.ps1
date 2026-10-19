$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
$headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)" }
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$dns = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=100" -Headers $headers
$dns.result | ForEach-Object {
  '{0,-6} {1,-45} {2} proxied={3}' -f $_.type, $_.name, $_.content, $_.proxied
}
Write-Host ('total=' + $dns.result_info.total_count)
