# Pouch Cell · 치수 & 스펙 스튜디오 v1.5

낱장 적층형·양끝 리드 파우치 셀의 CAD 기반 치수 관리 시제품입니다. 모든 기본 치수는 **가상 예시**입니다. 사내 제품 재현·양산 판정용 검증을 마친 도구는 아닙니다.

사용자의 2026-11-17 정정을 반영했습니다. 분포된 포일 탭 뿌리가 두께 중앙의 유한한 집속 구간으로 부드럽게 모입니다. KR20240073603A의 V자 굽힘/블레이드, W2 특수 가이드, W3 복합 용접 실시예는 적용하지 않았습니다.

## 1차 공정 한눈에 보기

기존 로컬 앱을 열면 같은 모델·개정의 **공정 한눈에 보기**가 시작됩니다. 고정 CAD 카드를 선택해 공정 상세로 들어갑니다. **탭 실링 후 → 파우치 CAD 계산 → 양극/음극 탭 실링 확대·치수**에서 실제 제품 중앙 접점과 원호를 측정할 수 있습니다. **요소기술 → 실링바 평면 윤곽**의 L·R은 기본적으로 같은 극의 상하 바를 함께 편집합니다. 기존 P 경로는 **기존 파우치 예제 열기**에서 확인합니다.

[1차 구현·검증](docs/phase1/verification.md)

## R5 정적 리뷰

로컬 CAD 의존성을 준비한 뒤 저장소 루트에서 `npm run build:preview`를 실행합니다. 공개 가상 예제 4개와 전체 공정 20개의 실제 CAD 성공·거부 응답을 기록합니다. 같은 요청의 응답과 원문 바이트를 대조하고 배포 크기를 확인한 뒤 `dist-preview/`를 만듭니다.

`python -m http.server 8080 --directory dist-preview`로 연 후 `http://127.0.0.1:8080/`에 접속하면 CAD 서버 없이 리뷰할 수 있습니다. 정적 호스트에 올릴 때는 폴더의 디렉터리 구조를 그대로 유지합니다. 하위 경로 URL에는 마지막 `/` 또는 `index.html`을 붙입니다. 프리뷰의 공정 전환, 부품·단면·치수 보기와 **기록 형상 비교**는 사전 계산된 결과를 사용합니다. 설계 편집·저장·개정·STEP은 기존 `scripts/start.*`로 실행한 로컬 앱에서 사용합니다.

[프리뷰 계약](docs/spec-integrated.md#r5-읽기-전용-사전-계산-프리뷰) · [재현·검수 결과](docs/validation-preview-r5.md)

## R4 공정·요소기술

오른쪽 **요소기술 → R4 가상 예제 열기**에서 시작합니다. 혼·엔빌 작업면, 가용접 침입 깊이, 극별 레이저 스팟, 직선/원호 실링바 윤곽을 편집하고 **CAD 미리보기 → 취소/적용**으로 확정합니다. R0–R7은 한 장 필름의 열린 두 컵 → 수납/닫힘 → 탭측·가스 외곽·최종 실링 → 절단/폴딩을 구분합니다. 기존 셀에 R4 가상값을 자동 입력하지 않습니다.

[조작·실행·Copilot 가이드](docs/r4/copilot-and-operation.md) · [실제 화면/전후 치수 검증](docs/r4/verification.md) · [사내 명칭/필드 ID 양식](docs/r4/fields-and-company-names.json) · [R4 가상 셀](examples/process-tooling-r4.json) · [입력 양식 1.3 예제](examples/intake/virtual-tooling-1.3.json).

## v1.5 성형 → 수납 → 실링 → 절단 → 폴딩

**기존 파우치 예제 열기**에서 새 모델을 열고 P0–P4를 선택합니다. 기존 S0–S4 및 packaged/finished는 호환 경로로 보존됩니다. 상하 포켓 독립 치수, 조립체 3D 강체 배치, 8개 작업면·공통 실링 영역, 실제 CAD 절단, 긴 변 순차 절곡과 재료에 붙는 주석을 제공합니다.

[명세·가정·미지원](docs/spec-pouch-v1.5.md) · [검증 기록](docs/validation-pouch-v1.5.md) · [출처 적용/제외](docs/evidence-pouch-v1.5.md) · [가상 프로젝트](examples/pouch-process.json) · [입력 예제 1.2](examples/intake/virtual-pouch-1.2.json) · [빈 입력 양식 1.2](examples/intake/template-1.2.json).

공정별 부품을 선택하면 해당 입력만 열립니다. **모델 치수 표시**는 개별 치수의 표시 설정을 유지하면서 화면의 치수선을 일괄 숨깁니다. **내부만 선택**은 외장·제품 실링·공구를 통과하여 내부 조립체를 선택합니다. 사내 용어 연결은 [명칭 가이드](docs/intake/internal-names-guide-v15.md)와 [명칭 매핑표 CSV](docs/intake/name-map-v15.csv)를 사용하세요. [UI 검증 결과](docs/validation-ui-v1.5.md)에 실제 조작 범위와 제한을 기록합니다.

모든 수치는 가상입니다. 실링 영역은 작업면의 공칭 영역이며 압착/융착 품질 예측이 아닙니다. 예제의 리드 통과부 간섭은 숨기지 않고 진단으로 표시합니다. 입력한 치수를 자동 축소하지 않습니다. 현재 분리 두 장·이중 컵·수직 벽 및 평행 긴 변 접힘을 지원하며 다른 조합은 명시적으로 거부합니다.

## v1.4 검사·비교·복원

전체 앱 main `4df91c9` (PR #4)에서 이어서 구현했습니다. 이전 정적 리뷰 사이트와 R5의 기록 형상 비교는 별도 버전입니다.

- S3부터 리드 실런트를 노란 테이프와 별도 관리합니다. 기존 CAD 단면을 재사용하고 양극/음극 입력을 독립으로 유지합니다.
- 검사 데이텀·앵커·공차·조건 변경은 새 개정을 요구하며, 카메라 변경은 검사 개정을 강제하지 않습니다.
- **치수·스펙**에서 현재 공정 기본 측정 세트, 기준 하이라이트, 고정 mm/상대 측정점과 검사 보기 저장·복원을 사용합니다.
- **공정·개정 비교**는 A/B 독립 CAD, 공통 카메라·단면, Δ=B−A와 검사 정의/출처 차이를 제공합니다.
- **모델 / 입력 양식**에서 기존 목록에 보관함 백업을 다시 가져와 중복·충돌을 검토하고 병합할 수 있습니다.

사내 Copilot에는 [작성 지침](docs/intake/internal-copilot-prompt.md)과 [빈 양식 1.2](examples/intake/template-1.2.json)을 전달하세요. [가상 완성 입력](examples/intake/virtual-complete.json), [S0만 입력한 예시](examples/intake/virtual-s0-missing-future.json)를 제공합니다. 미입력 null에 예시 숫자를 섞지 않습니다. 기존 입력 1.0과 프로젝트 JSON은 호환하며, S3 실런트 미입력은 미확정 상태로 명시합니다.

[현재 명세·호환 정책](docs/spec-integrated.md) · [자동 검증 결과](docs/validation-integrated.md) · [실제 UI 검증·수정](docs/validation-ui-v1.4.md) · [진행 기록](docs/plan-integrated.md). 이전 v1.3 기록은 [명세](docs/spec-v1.3.md)와 [검증](docs/validation-v1.3.md)에 보존합니다.

**실행 요건은 기존과 같습니다:** Node.js 22.12+ / Python 3.12 64-bit / CadQuery 2.7 / Chrome 또는 Edge. Docker는 필요 없습니다. 실행 중 CDN/외부 API는 사용하지 않습니다. Python은 CAD 계산 엔진과 로컬 웹 서버를 실행합니다. 이번 변경에서 EXE·설치 프로그램·배포 업데이트는 만들지 않았습니다.

## 기존 전체 프로그램 사용 흐름

1. S0 적층체 → S1 집속 → S2 가용접 → S3 메인 용접 → S4 테이프 → 기존 패키징/완성 상태를 선택합니다.
2. 입력에 포커스하면 해당 부품·시작/끝 기준·치수 가이드가 표시됩니다. 숫자나 +/-를 바꾸면 기본 0.55초 뒤 실제 CAD를 재생성합니다. 자동 갱신을 끄면 수동 적용합니다.
3. 3D 부품을 선택하면 오른쪽 관련 항목이 펼쳐집니다. 등록 모서리/치수선 더블클릭 또는 **선택 치수 편집**으로 직접 편집합니다. Enter 적용, Esc/바깥 클릭 취소입니다.
4. 겹침 같은 계산값은 원인 입력을 선택합니다. **이 입력 → 관리 치수** 또는 선택 기준에서 치수를 만들고, 목표·공차·실측·설명을 기록합니다.
5. 현재 공정 기본 측정 세트 추가와 그룹 토글로 표시량을 조절합니다. JSON은 입력과 기준 ID를 보존합니다. v1.1 파일은 각 극의 뿌리/집속 폭을 직접 선택하여 변환합니다.

**기준 문서:** [v1.2 공정/편집 명세](docs/spec-v1.2.md) · [필드–형상 연결표](docs/field-geometry-map-v1.2.md) · [v1.2 검증](docs/validation-v1.2.md). v1.1 문서는 이전 구현의 기록입니다.

## 실행

필수: Node.js 22.12 이상(화면 빌드), **Python 3.12 64-bit + CadQuery 2.7**(형상 엔진), Chrome/Edge. Node.js만으로는 CAD 형상을 생성하지 않습니다.

Windows PowerShell, 프로젝트 폴더에서:

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

브라우저에서 **http://127.0.0.1:8765** 를 엽니다. HTML 더블클릭 방식은 지원하지 않습니다. PowerShell 실행이 조직 정책으로 제한되면 스크립트를 관리자 승인 없이 우회하지 말고 아래 명령을 개별 실행할 수 있습니다.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r cad/requirements.lock.txt
npm ci
npm run build
.\.venv\Scripts\python.exe cad/server.py
```

Linux:

```sh
sh scripts/setup.sh
sh scripts/start.sh
```

이미 Python/CadQuery가 설치된 개발 환경:

```sh
npm ci
# 터미널 1
python cad/server.py
# 터미널 2
npm run dev
```

개발 화면은 http://127.0.0.1:5174 입니다. 빌드 후에는 `node serve.mjs`로도 로컬 Python 서버를 시작할 수 있습니다. `POUCH_PYTHON`으로 Python 실행 파일을 지정할 수 있습니다.

## 사용 순서

1. 공정 상태 선택 → 부품 선택 → 오른쪽 설계 치수 변경. 자동 모드는 잠시 멈추면 적용되며, 수동 모드는 **치수 적용 · CAD 재생성**을 누릅니다.
2. 잘못된 입력은 원인과 미적용 상태를 표시하고 마지막 정상 형상을 유지합니다. 입력 되돌리기로 복구합니다.
3. **양극 집속부 집중**은 테이프를 숨기고 실런트를 유지하여 집속 경로를 측면에서 보여줍니다. 정면/측면/끝면 버튼, XYZ 단면 위치를 함께 사용합니다.
4. 치수·스펙 탭에서 기준점/모서리 중점/면 중심/반경을 선택합니다. 모델 마커 스냅 또는 기준 목록을 사용할 수 있습니다. 자유 표면점은 **리드 및 적층체의 상·하면 평탄부**에서 지원합니다. 이름과 고정 mm 또는 상대 위치 규칙을 저장합니다.
5. 직선 거리와 검사 좌표계 X/Y/Z 투영, 같은 부품의 대응 면 법선 두께, R을 구분합니다. 치수선 위치·방향을 바꿀 수 있습니다.
6. 치수 카드를 열어 목표값, ± 공차 크기, 설명, 실측값을 기록합니다. 실측값은 형상을 바꾸지 않습니다.
7. 개별/그룹/전체 치수 표시 및 검색을 사용합니다. 데이터는 20,000개까지, 화면 치수선은 한 번에 최대 200개, 목록은 50개씩 표시합니다. 10,000개 JSON 왕복을 검증했으며 대량 동시 렌더링 성능 보장은 아닙니다.
8. **JSON 저장**에 형상 변수·참조·주석·스펙·카메라·단면·표시 상태가 포함됩니다. **STEP 내보내기**는 mm CAD 솔리드이며 JSON을 함께 보관해야 합니다.

## 구현과 제한

- 7개 공정 상태와 양극/음극 독립 탭 경로, 리드, 다수 접합 영역/테이프, 리드 필름.
- 중심 집속 경로, 유한 겹침 구간, 실제 겹침과 접합 관리 영역 구분.
- 탭 상면 및 모서리를 따라가는 유한 두께 테이프. 전체 뒷면 경로는 확정하지 않음.
- 내외면을 갖는 CAD 포켓. 상/하 깊이, 바닥 R, 상단 R, XY 코너 R, 필름 두께 분리.
- 성형–실링 간격, 실링 관리 폭, 절단 여유, 패키징의 추가 외장 여유, 완성 상태의 예시 접힘.
- 회전/확대/이동, 선택/숨김, 외장 투명, 내부 선택 모드, 단면·데이텀.
- semantic reference 기반 치수와 평면 자유점, 끊어진 참조 오류, JSON 저장/복원, 설계 undo/redo.
- WebGL 미지원 환경에서는 같은 CAD 메시를 CPU z-buffer로 표시합니다. 투명 합성은 미리보기 근사입니다.

**미지원/미검증:** 실제 개별 포일 변형·용접 강도/비드/용입·테이프 자유 곡면 경로·파우치 성형 변형률/국부 두께·실링 압축 및 리드 통과부 국부 성형·고객 STEP의 UI 가져오기/직접 편집·STEP PMI·2D 도면 자동 생성·사내 Windows/iPad 실기 검증. 완성 셀 접힘은 릴리프가 있는 예시 단면이고 사진의 주름이나 실제 접힘 순서를 재현한 것이 아닙니다. 상세 제한은 [현재 구현 명세](docs/spec-v1.2.md)와 [기존 CAD 명세](docs/spec-v1.1.md)에 있습니다.

## 검증

```sh
npm test
python -m unittest discover -s tests -p '*geometry*.py' -v
npm run build
python scripts/render_proofs.py
python scripts/check_process_step.py
# CAD 서버 실행 후
python scripts/check_api.py
node scripts/check_intake_api.mjs
node scripts/check_integrated_api.mjs
```

[검증 기록과 이미지](docs/validation-v1.2.md) · [출처별 적용/제외](docs/evidence-decisions.md) · [오프라인 인계](docs/offline-handoff.md) · [Copilot 작업 지침](.github/copilot-instructions.md)

기존 v0.4와 v1.1은 Git 이력에 보존했습니다. v0.4 JSON은 기준 정의가 달라 자동 변환하지 않습니다. 사용자 원본 사진/특허 패키지는 공개 저장소와 v1.2 소스 ZIP에 재배포하지 않습니다. 기존 개인 검토 자료를 별도로 보관하세요.
