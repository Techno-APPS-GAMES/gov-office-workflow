# Fixes NXDOMAIN for office-workflow-preview.walkwell.pk on this PC.
# Self-elevates to Administrator if needed.

$ErrorActionPreference = 'Stop'
$HostName = 'office-workflow-preview.walkwell.pk'
$CFIP = '104.21.38.6'

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  Write-Host 'Not admin — relaunching with UAC elevation...'
  $self = $MyInvocation.MyCommand.Path
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$self`""
  ) | Out-Null
  exit
}

Write-Host 'Running as Administrator.'
Write-Host "Fixing DNS + hosts for $HostName ..."

Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  Write-Host ("  DNS -> 8.8.8.8 on " + $_.Name)
  try {
    Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses ('8.8.8.8', '8.8.4.4')
  } catch {
    Write-Host ("  Set-DnsClientServerAddress failed: " + $_.Exception.Message)
  }
  try {
    netsh interface ipv6 set dnsservers name="$($_.Name)" source=static address=none validate=no | Out-Null
    Write-Host ("  Cleared IPv6 DNS on " + $_.Name)
  } catch {}
}

$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$line = "$CFIP`t$HostName"
$existing = @()
if (Test-Path $hostsPath) {
  $existing = @(Get-Content $hostsPath | Where-Object { $_ -notmatch [regex]::Escape($HostName) })
}
$existing += $line
Set-Content -Path $hostsPath -Value $existing -Encoding ASCII
Write-Host "  hosts: $line"

Clear-DnsClientCache -ErrorAction SilentlyContinue
ipconfig /flushdns | Out-Null

Start-Sleep -Seconds 1
Write-Host ''
Write-Host 'Resolve check:'
try {
  Resolve-DnsName $HostName -Type A | Format-Table Name, IPAddress -AutoSize
} catch {
  Write-Host $_.Exception.Message
}

Write-Host ''
Write-Host "Open: https://$HostName/login"
Write-Host 'Press Enter to close'
[void][System.Console]::ReadLine()
