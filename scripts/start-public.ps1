# Start local stack + stable Cloudflare named tunnel (office-workflow-preview.walkwell.pk)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host 'Starting Postgres...'
Start-Process powershell -ArgumentList '-NoProfile','-Command', "Set-Location '$root'; `$env:PG_PORT='5433'; npm run db:local -w @gow/api" -WindowStyle Minimized
Start-Sleep 4

Write-Host 'Starting API...'
Start-Process powershell -ArgumentList '-NoProfile','-Command', "Set-Location '$root'; npm run start:dev -w @gow/api" -WindowStyle Minimized
Start-Sleep 6

Write-Host 'Starting Web...'
if (Test-Path 'apps\web\.next\BUILD_ID') {
  Start-Process powershell -ArgumentList '-NoProfile','-Command', "Set-Location '$root'; npm run start -w @gow/web" -WindowStyle Minimized
} else {
  Start-Process powershell -ArgumentList '-NoProfile','-Command', "Set-Location '$root'; npm run dev -w @gow/web" -WindowStyle Minimized
}
Start-Sleep 5

$tokenPath = Join-Path $env:USERPROFILE '.cloudflared\office-workflow-preview.token'
if (-not (Test-Path $tokenPath)) { throw "Missing tunnel token at $tokenPath - run scripts/create-cf-named-tunnel.ps1 first" }
$tok = (Get-Content $tokenPath -Raw).Trim()
Write-Host 'Starting Cloudflare named tunnel...'
Start-Process cloudflared -ArgumentList @('tunnel','run','--token',$tok) -WindowStyle Minimized

Write-Host ''
Write-Host 'Public URL: https://office-workflow-preview.walkwell.pk/login'
Write-Host 'Local URL:  http://localhost:3000/login'
