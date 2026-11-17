# 사내 실행·오프라인 인계

런타임은 브라우저 + 로컬 Python CAD 서비스다. HTML/JS/CSS는 dist에 번들링되며 Three.js도 포함된다. 실행 중 외부 CDN/API가 필요하지 않다. Python CAD 패키지는 대상 OS/Python 버전용으로 설치되어 있어야 한다. iPad만으로 Python CAD 서비스를 실행하는 구성은 제공하지 않는다.

## 의존성

- 화면: Node.js 22.12+ (빌드), Three.js 0.180.0 MIT, Vite 7.2.2 MIT. npm package-lock.json 고정.
- 형상: Python 3.12 64-bit, CadQuery 2.7.0 Apache-2.0, cadquery-ocp 7.8.1.1.post1, OpenCascade LGPL-2.1 with exception. 실제 배포 라이선스 파일과 고지 의무는 사내 검토한다.
- cad/requirements.lock.txt는 검증한 Linux/Python3.12 환경의 설치된 전이 의존성 버전 목록이다. Windows wheel 설치 검증을 수행한 잠금파일이라고 주장하지 않는다. 패키지별 메타데이터는 dependency-licenses.json.
- npm/Python 의존성 최초 설치에는 패키지 다운로드가 필요하다. 저장소/소스 ZIP에 대형 Python wheels 전체를 포함하지 않는다.

## 네트워크 차단 환경 준비

대상과 같은 OS/CPU/Python 버전의 인터넷 가능한 준비 PC에서:

```sh
python -m pip download -r cad/requirements.lock.txt -d wheelhouse
npm ci
npm run build
```

소스, dist, wheelhouse와 Python 설치 파일을 허용된 경로로 전달한다. 대상 PC에서:

```sh
python -m venv .venv
# Windows: .venv/Scripts/python.exe, Linux: .venv/bin/python
python -m pip install --no-index --find-links wheelhouse -r cad/requirements.lock.txt
```

위 마지막 명령의 python은 생성한 가상환경 실행 파일로 바꾼다. 이후 CAD 서버가 dist까지 제공하므로 운영 PC에는 Node/npm을 설치하지 않아도 실행할 수 있다. 사내에서 소스를 수정해 재빌드하려면 Node와 npm 의존성 캐시/설치본도 전달한다. Linux node_modules를 Windows로 복사해 사용하지 않는다.

## 인수 확인

1. 사내 Windows Chrome/Edge에서 CAD 서버 시작 및 첫 형상 생성.
2. 네트워크를 차단한 상태에서 공정 전환, 한쪽 리드/테이프/포켓 R 변경.
3. 실제 최소·최대 치수 조합에서 형상 검사. 특히 리드 통과부 국부 성형은 추가 구현 전 양산 적합 판정을 하지 않음.
4. JSON 저장→새 세션 재열기, 기준점과 표시/단면 복원.
5. STEP를 실제 사내 CAD로 열고 mm/알려진 기준 치수 비교. JSON 스펙을 별도 보관.
6. 실제 iPad/터치 조작 및 다수 관리 치수의 화면 성능 확인.

이 환경에서 Linux CPU CAD, 브라우저 CPU 표시 경로, 빌드와 로컬 API를 검증했다. 사내 Windows 설치, 실제 네트워크 격리 정책, iPad, GPU WebGL은 별도 인수 검증 대상이다.
