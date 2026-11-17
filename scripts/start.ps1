$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!(Test-Path '.venv/Scripts/python.exe')) { throw '먼저 scripts/setup.ps1을 실행하세요.' }
if (!(Test-Path 'dist/index.html')) { throw '먼저 npm run build를 실행하세요.' }
& .\.venv\Scripts\python.exe cad/server.py
