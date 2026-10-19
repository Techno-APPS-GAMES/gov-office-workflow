$ErrorActionPreference = 'Stop'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
$headers = @{ Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)" }
$zoneId = '29a7e2fa3be96604a690479d38d24784'
$z = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId" -Headers $headers
$r = $z.result
Write-Host ("name={0}" -f $r.name)
Write-Host ("status={0}" -f $r.status)
Write-Host ("type={0}" -f $r.type)
Write-Host ("paused={0}" -f $r.paused)
Write-Host ("plan={0}" -f $r.plan.name)
Write-Host ("ns_mode / vanity: {0}" -f ($r.vanity_name_servers -join ','))
Write-Host ("name_servers={0}" -f ($r.name_servers -join ','))
Write-Host ("original_name_servers={0}" -f ($r.original_name_servers -join ','))
Write-Host ("permissions={0}" -f ($r.permissions -join ','))
# dnssec
try {
  $ds = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dnssec" -Headers $headers
  Write-Host ("dnssec status={0}" -f $ds.result.status)
} catch { Write-Host ("dnssec err: " + $_.Exception.Message) }
# recount records
$dns = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=100" -Headers $headers
Write-Host ("dns_record_count={0}" -f $dns.result_info.total_count)
$dns.result | ForEach-Object { Write-Host (" - {0} {1} -> {2} proxied={3}" -f $_.type, $_.name, $_.content, $_.proxied) }
