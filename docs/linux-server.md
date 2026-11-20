# Linux 사내 서버 실행

Linux x64 서버 한 대에서 웹 화면과 실제 CAD를 실행하고 사용자는 브라우저로 접속한다. 사용자 PC에는 EXE/Python/Node 설치가 필요 없다. Windows 실행 ZIP을 Linux에서 실행하지 않는다. `dist-preview`는 읽기 전용이므로 편집 서버에는 일반 `dist`를 사용한다.

이 안내는 `feat/linux-server` 브랜치의 서버 설정을 사용한다. 기존 main/Windows 시험판은 루프백 전용이며 아래 환경변수만 넣어도 외부 접속이 되는 버전이 아니다. 서버 운영에는 고정 포트를 쓰고 자동 포트 이동은 끈다.

## 1. 최초 설치

Ubuntu 24.04 x64 수준의 Linux, **Python 3.12 + venv**, **Node.js 22.12 이상과 npm**, Git이 준비된 상태를 기준으로 한다. Node는 화면 빌드에만 필요하다. 서버에서 Python/CadQuery는 계속 필요하다. Docker는 필수가 아니다. 최초 패키지 설치 시 인터넷 또는 사내 패키지 미러가 필요하며 구동 중 외부 API/CDN은 필요 없다. 빈 서버에서 설치 권한이 없다면 담당자가 런타임을 준비해야 한다.

```sh
git clone --branch feat/linux-server https://github.com/playjae0/3D_cell_spec_simulator.git CellStudio
cd CellStudio
python3.12 -m venv .venv
.venv/bin/python -m pip install -r cad/requirements.lock.txt
npm ci
npm run build
```

Python/CadQuery 확인: `.venv/bin/python -c "import cadquery; print(cadquery.__version__)"` → 2.7.0. 경량 OS 이미지에서 공유 라이브러리 누락이 나오면 그 오류에 지정된 OS 라이브러리를 서버 담당자가 설치한다. Python/CadQuery 설치를 건너뛰고 정적 HTTP 서버만 실행하면 편집할 수 없다.

## 2. 사내 IP로 시험 실행

아래 **10.10.20.30은 예시**다. `hostname -I`에서 확인한 서버의 실제 사내 IPv4 주소를 두 곳 모두 바꾼다. 허용 URL은 사용자가 브라우저에서 여는 주소와 같아야 한다.

```sh
POUCH_HOST=10.10.20.30 \
POUCH_PORT=8765 \
POUCH_ALLOWED_ORIGINS=http://10.10.20.30:8765 \
sh scripts/start-server.sh
```

다른 PC에서 **http://10.10.20.30:8765**를 연다. 서버/사내 방화벽은 담당자가 승인한 사용자 대역에서 TCP 8765 접속을 허용해야 한다. 사용자 PC의 `localhost`는 서버가 아닌 사용자 자신의 PC이므로 쓰지 않는다.

- 웹과 `/api/*`를 같은 주소로 제공한다. 다른 Origin이나 Host는 403으로 거부한다. 와일드카드 CORS는 제공하지 않는다.
- `POUCH_HOST` 기본값은 `127.0.0.1`이다. 외부로 바인딩할 때 허용 URL이 없으면 시작을 거부한다. `0.0.0.0`도 가능하나 모든 인터페이스에 바인딩하므로 실제 사내 IP 하나를 지정하는 편이 명확하다.
- 여러 접속 주소가 필요한 경우 `POUCH_ALLOWED_ORIGINS=http://10.10.20.30:8765,https://cell.example.internal`처럼 쉼표로 명시한다. 경로/와일드카드가 아닌 원점 URL만 입력한다.
- 로그인/권한 기능은 앱에 없다. 사내망 또는 기존 사내 HTTPS·접근권한 프록시 범위에서 운영한다. 이 설정만으로 인터넷 공개 서비스가 준비되는 것은 아니다.
- 수동 실행을 종료하려면 해당 터미널에서 Ctrl+C. SSH 접속을 끊어도 계속 운영하려면 다음 서비스 구성을 사용한다.

## 3. 계속 실행하기: systemd

관리자가 앱을 `/opt/cellstudio`에 설치하고 전용 일반 계정 `cellstudio`가 소스·빌드·가상환경을 읽고 실행할 수 있게 준비한 뒤 사용한다. 다른 설치 경로/계정이면 서비스 파일의 두 경로와 User를 함께 바꾼다. 기존 설치 폴더에 다른 버전을 덮기보다 새 폴더에서 호환성을 확인한다.

```sh
sudo cp deploy/linux/cellstudio.env.example /etc/cellstudio.env
sudoedit /etc/cellstudio.env
sudo cp deploy/linux/cellstudio.service /etc/systemd/system/cellstudio.service
sudo systemctl daemon-reload
sudo systemctl enable --now cellstudio
sudo systemctl status cellstudio
```

`/etc/cellstudio.env`의 IP/URL을 2번처럼 실제 값으로 고친다. 기본 예시 그대로면 자기 서버에서만 접속된다. 이 서비스는 소스 설치와 계정 생성을 대신 수행하지 않는다.

```sh
sudo systemctl stop cellstudio      # 서버 종료 / 포트 반환
sudo systemctl restart cellstudio   # 설정 변경 후 재시작
sudo journalctl -u cellstudio -n 100 --no-pager
```

## 4. 기존 HTTPS 프록시가 있는 경우

CAD는 루프백에 두고 `POUCH_HOST=127.0.0.1`, `POUCH_ALLOWED_ORIGINS=https://cell.example.internal`로 실행한다. 기존 게이트웨이에서 `/` 전체를 `http://127.0.0.1:8765`로 전달하고 사용자 Host와 Origin을 보존한다. [Nginx 예시](../deploy/linux/nginx.conf.example)는 도메인·사내 인증서·기존 접근 권한 구성을 담당자가 적용하는 참고 파일이다. SSO나 인증서 발급 기능을 포함하지 않는다. 공개 포트를 새로 여는 작업은 이 저장소 변경에서 수행하지 않았다.

## 5. 데이터·여러 사용자·검증 범위

현재 모델/개정 보관함은 **각 사용자 브라우저의 로컬 저장소**다. 셀 JSON 저장도 각 사용자 PC로 내려받는다. 다른 사용자의 파일이 자동으로 보이거나 한 모델을 동시에 공동 편집하는 기능은 없다. 여러 요청의 CAD 계산은 기존 잠금으로 순차 처리하므로 접속자가 늘면 기다릴 수 있다. 대규모 동시 사용 부하와 자동 확장/작업 취소는 검증하지 않았다.

주소·프로필이 바뀌면 브라우저 보관함도 달라진다. 이전 작업은 셀 JSON 또는 전체 보관함 백업으로 옮긴다. 중요한 모델은 브라우저 저장소만 의존하지 않는다.

개발 검증 명령:

이번 개발 환경에서 JS 89개, 접속 정책 6개, 기존 포트 6개 검사와 일반 웹 빌드를 통과했다. Linux의 실제 네트워크 인터페이스에 바인딩한 HTTP/CAD 검사도 통과했다. 탭 폭 **32→34 mm**, 실제 탭 체적 **1331.019734→1414.219734 mm³**, 반대극 보존, 두 요청의 토큰/개정/형상 분리, 잘못된 치수 422와 잘못된 Host/Origin 403을 확인했다. 사내 서버 실배포, 다른 물리 PC에서의 접속, systemd/Nginx 운영은 아직 수행하지 않았다.

```sh
python -m unittest discover -s tests -p 'test_server_access.py' -v
python scripts/check_server_access.py
```

`check_server_access.py --bind-host <개발 머신의 IPv4>`는 실제 TCP 바인딩, 웹/health, Host·Origin 거부, 두 클라이언트의 요청 분리, 실제 탭 치수 변경과 반대극 보존, 422를 확인하고 자신이 기동한 서버를 종료한다. 가상 예제만 사용한다. 테스트 실행에도 Python/CadQuery와 일반 `dist`가 필요하다. 실제 사내 서버의 방화벽·DNS·HTTPS·다른 PC 접속·systemd 운영은 그 환경에서 별도 확인해야 한다.
