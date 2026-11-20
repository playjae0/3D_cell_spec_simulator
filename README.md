# Pouch Cell · 치수 & 스펙 스튜디오 v1.5

낱장 적층형·양끝 리드 파우치 셀의 CAD 기반 치수 관리 시제품입니다. 모든 기본 치수는 **가상 예시**입니다. 사내 제품 재현·양산 판정용 검증을 마친 도구는 아닙니다.

사용자의 2026-11-17 정정을 반영했습니다. 분포된 포일 탭 뿌리가 두께 중앙의 유한한 집속 구간으로 부드럽게 모입니다. KR20240073603A의 V자 굽힘/블레이드, W2 특수 가이드, W3 복합 용접 실시예는 적용하지 않았습니다.

## Windows 사내 시험판

Linux 한 대에서 여러 사용자가 브라우저로 접속하려면 [사내 서버 설치·실행 안내](docs/linux-server.md)를 사용합니다. 고정 서버 주소와 허용 URL을 명시하며, 각 사용자의 모델 저장은 현재 브라우저/셀 JSON 단위입니다.

Python·Node를 설치할 수 없는 Windows x64 사용자는 같은 커밋의 `CellStudio-win-x64-<commit>.zip`과 `CellStudio-IntakeKit-<commit>.zip`을 사용합니다. 실행 ZIP 전체를 풀고 `CellStudio.exe`를 열면 기본 브라우저와 실제 로컬 CAD 엔진이 시작됩니다. 인터넷/CDN/공용 CAD 서버가 필요하지 않습니다. 셀 파일은 프로그램 폴더 밖에 저장합니다.

Windows ZIP은 Actions의 **Core and intake regression → Run workflow**에서 원하는 버전을 수동으로 만듭니다. 일반 커밋에는 Windows 패키지를 만들지 않습니다. [빌드·검증 구분과 재현 명령](docs/windows/build-and-test.md) · [현업 사용 안내](docs/windows/user-guide.txt). 새 입력키트 1.4에는 최신 공구 치수의 출처와 검토 CSV를 포함하며 구버전 입력은 계속 읽습니다.

## 제품 공정도와 단품 설계

첫 화면은 대표 셀의 **제품 공정도 → 전체보기**다. 고정 CAD 카드 13개 중 **가용접 S2**를 선택하고 왼쪽의 **실링바 단품**을 누른다. **부품·요소기술** 탭 왼쪽에는 같은 모델의 공구 도면, 오른쪽에는 S2 제품과 적용 상태가 표시된다. 상단 **제품 공정도**를 다시 누르면 S2로 복귀한다. **전체보기**에서 모든 공정 카드를 다시 볼 수 있다.

**모델 선택**에서 대표 셀, 기본 가상 예제, 기존 파우치(P 공정), R4 요소기술 예제의 대표 이미지와 용도를 확인한다. **부품·요소기술 → 전체보기**에서 포일 탭, 리드, 실런트, 테이프, 파우치와 공구를 연다. 제품 상세의 치수 참조 버튼은 해당 단품의 원래 입력으로 연결된다. 왼쪽 부품 트리의 화살표는 펼침, 이름은 선택, 눈은 표시 상태를 제어한다.

[인터랙티브 프리뷰](https://pouch-cell-phase1.goodlycurio3.chatgpt.site) · [12개 항목 검수 보고서](docs/ui-review/02_REPORT.md) · [기존 1차 CAD 검증](docs/phase1/verification.md)

## R5 정적 리뷰

로컬 CAD 의존성을 준비한 뒤 저장소 루트에서 `npm run build:preview`를 실행합니다. 공개 가상 예제 4개와 전체 공정 20개의 실제 CAD 성공·거부 응답을 기록합니다. 같은 요청의 응답과 원문 바이트를 대조하고 배포 크기를 확인한 뒤 `dist-preview/`를 만듭니다.

`python -m http.server 8080 --directory dist-preview`로 연 후 `http://127.0.0.1:8080/`에 접속하면 CAD 서버 없이 리뷰할 수 있습니다. 정적 호스트에 올릴 때는 폴더의 디렉터리 구조를 그대로 유지합니다. 하위 경로 URL에는 마지막 `/` 또는 `index.html`을 붙입니다. 프리뷰의 공정 전환, 부품·단면·치수 보기와 **기록 형상 비교**는 사전 계산된 결과를 사용합니다. 설계 편집·저장·개정·STEP은 기존 `scripts/start.*`로 실행한 로컬 앱에서 사용합니다.

[프리뷰 계약](docs/spec-integrated.md#r5-읽기-전용-사전-계산-프리뷰) · [재현·검수 결과](docs/validation-preview-r5.md)

## R4 공정·요소기술

상단 **모델 선택 → 요소기술 R4 → 부품·요소기술**에서 시작합니다. 혼·엔빌 작업면, 가용접 침입 깊이, 극별 레이저 스팟, 직선/원호 실링바 윤곽을 편집하고 **CAD 미리보기 → 취소/적용**으로 확정합니다. R0–R7은 한 장 필름의 열린 두 컵 → 수납/닫힘 → 탭측·가스 외곽·최종 실링 → 절단/폴딩을 구분합니다. 기존 셀에 R4 가상값을 자동 입력하지 않습니다.

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

### 부품·요소기술 설계 검토 v2

첫 화면은 **부품·요소기술 전체보기**다. 양극/음극의 가용접·메인 혼/엔빌 카드를 고르면 왼쪽 내재 사양, 오른쪽 단품 3D, 아래 같은 모델·개정의 완성 셀이 열린다. `U 피치` 또는 `치높이` 치수선을 더블클릭하거나, 터치로 치수를 선택한 뒤 `선택 치수 편집`을 누른다. 로컬 CAD에서 미리보기 → 적용/취소하며, 정적 프리뷰는 기록 선택만 가능하다. 제품 배치는 **제품 공정도 → 상세보기 → 설계 치수 → 공구 조립 배치**에서 편집한다. 리드와 실런트는 한 단품이며 내부 상대 시작은 기존 집속 기준 값을 변환해 표시한다.

```sh
npm test
python -m unittest discover -s tests -p '*geometry*.py'
npm run build
# scripts/start.sh 또는 Windows scripts/start.ps1로 기존 로컬 CAD 앱 실행
python scripts/check_component_browser.py --url http://127.0.0.1:8765
npm run build:preview
# dist-preview/를 정적 호스트에 그대로 업로드 (CAD 서버 없음)
```

실행 의존성은 기존 Node.js 22.12+ / Python 3.12 / CadQuery 2.7 환경을 재사용한다. 런타임 CDN이나 외부 API는 필요 없다. Playwright와 Chromium은 개발 검증에만 사용한다. Docker나 실행파일은 필요 없다.

혼·엔빌은 치끝이 기존 공칭 접촉면을 유지하고 치근이 제품 반대쪽으로 이동하는 **접촉부 요철**이다. 바디 치수와 제품 압흔을 추정하지 않는다. R4 한 장 필름의 비영 조립체 수납 배치는 지원하지 않으므로 명시 거부한다. 구 P1–P4 강체 수납 배치는 유지한다. 실링 단면은 기록된 공칭 작업면/홈이며 제품 압착 결과가 아니다. 상세한 범위와 후공정 연결은 [데이텀 대응표](docs/component-v2/DATUM_MAP.md), 검증 상태는 [12항목 보고서](docs/component-v2/REPORT.md)를 참조한다.

### 포일 세 상태·공구 블록·단면

부품·요소기술 전체보기에서 포일 탭은 **집속 전 / 가용접 후 / 커팅 후**로 나뉜다. 혼·엔빌 상세의 **지지 블록 깊이**, 파우치의 **성형 깊이/바닥 R/림 R/평면 R**를 해당 부품 화면에서 선택하고 편집한다. **중심 단면** 버튼과 방향/위치 입력으로 단면을 확인한다. 정적 Artifact는 읽기 전용이며 로컬 CAD 앱에서만 값을 적용할 수 있다. 상세 조작·데이텀·한계는 [후속 보고서](docs/component-v3/REPORT.md)를 참조한다.
