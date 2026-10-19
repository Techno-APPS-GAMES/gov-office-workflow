$ErrorActionPreference = 'Continue'
$envFile = Join-Path $env:USERPROFILE '.cloudflared\gov.env'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim()
}
$h = @{ Authorization = "Bearer $($env:CLOUDFLARE_API_TOKEN)"; 'Content-Type'='application/json' }
$z = '29a7e2fa3be96604a690479d38d24784'
$urls = @(
  "https://api.cloudflare.com/client/v4/zones/$z/version_management/versions",
  "https://api.cloudflare.com/client/v4/zones/$z/version_management",
  "https://api.cloudflare.com/client/v4/zones/$z/settings",
  "https://api.cloudflare.com/client/v4/zones/$z/dns_records?search=office-workflow"
)
foreach ($u in $urls) {
  Write-Host "==== $u"
  try {
    $r = Invoke-WebRequest -Uri $u -Headers $h -UseBasicParsing
    Write-Host $r.Content.Substring(0, [Math]::Min(1500, $r.Content.Length))
  } catch {
    Write-Host $_.Exception.Message
    try {
      $sr = $_.Exception.Response.GetResponseStream()
      $rd = New-Object IO.StreamReader($sr)
      Write-Host $rd.ReadToEnd()
    } catch {}
  }
}
