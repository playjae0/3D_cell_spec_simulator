#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then
  echo '먼저 Python 3.12 가상환경과 CAD 의존성을 설치하세요.' >&2; exit 1
fi
if [ ! -f dist/index.html ]; then
  echo '먼저 npm ci && npm run build를 실행하세요.' >&2; exit 1
fi
if [ -z "${POUCH_ALLOWED_ORIGINS:-}" ]; then
  echo 'POUCH_ALLOWED_ORIGINS에 사용자가 접속할 사내 URL을 지정하세요.' >&2; exit 1
fi
# Shared servers have a fixed URL. A collision must be reported, not relocated.
export POUCH_AUTO_PORT=0
unset POUCH_LAUNCH_READY
exec .venv/bin/python -u cad/server.py
