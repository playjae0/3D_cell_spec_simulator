$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
py -3.12 -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 (64-bit) 설치를 확인하세요.' }
& .\.venv\Scripts\python.exe -m pip install -r cad/requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw 'CAD 의존성 설치 실패. Windows wheel 지원을 확인하세요.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci 실패' }
npm run build
if ($LASTEXITCODE -ne 0) { throw '빌드 실패' }
Write-Host '설치 완료. scripts/start.ps1 실행 후 http://127.0.0.1:8765 열기'
