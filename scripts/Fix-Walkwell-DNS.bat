@echo off
:: Double-click this file — it will ask for Administrator permission
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-walkwell-dns-admin.ps1"
pause
