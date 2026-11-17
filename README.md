# Pouch Cell · 치수 & 스펙 스튜디오 v1.1

낱장 적층형·양끝 리드 파우치 셀의 CAD 기반 치수 관리 시제품입니다. 모든 기본 치수는 **가상 예시**입니다. 사내 제품 재현·양산 판정용 검증을 마친 도구는 아닙니다.

사용자의 2026-11-17 정정을 반영했습니다. 분포된 포일 탭 뿌리가 두께 중앙의 유한한 집속 구간으로 부드럽게 모입니다. KR20240073603A의 V자 굽힘/블레이드, W2 특수 가이드, W3 복합 용접 실시예는 적용하지 않았습니다.

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

1. 공정 상태 선택 → 부품 선택 → 오른쪽 설계 치수 변경 → **치수 적용 · CAD 재생성**.
2. 잘못된 입력은 원인과 미적용 상태를 표시하고 마지막 정상 형상을 유지합니다. 입력 되돌리기로 복구합니다.
3. **양극 집속부 집중**은 테이프·필름을 숨기고 집속 경로를 측면에서 보여줍니다. 정면/측면/끝면 버튼, XYZ 단면 위치를 함께 사용합니다.
4. 치수·스펙 탭에서 기준점/모서리 중점/면 중심/반경을 선택합니다. 모델 마커 스냅 또는 기준 목록을 사용할 수 있습니다. 자유 표면점은 **리드 및 적층체의 상·하면 평탄부**에서 지원합니다. 이름과 정규화 면 위치를 저장합니다.
5. 직선 거리와 검사 좌표계 X/Y/Z 투영, 같은 부품의 Z 대응 면 두께, R을 구분합니다. 치수선 위치·방향을 바꿀 수 있습니다.
6. 치수 카드를 열어 목표값, ± 공차 크기, 설명, 실측값을 기록합니다. 실측값은 형상을 바꾸지 않습니다.
7. 개별/그룹/전체 치수 표시 및 검색을 사용합니다. 데이터는 20,000개까지, 화면 치수선은 한 번에 최대 200개, 목록은 50개씩 표시합니다. 10,000개 JSON 왕복을 검증했으며 대량 동시 렌더링 성능 보장은 아닙니다.
8. **JSON 저장**에 형상 변수·참조·주석·스펙·카메라·단면·표시 상태가 포함됩니다. **STEP 내보내기**는 mm CAD 솔리드이며 JSON을 함께 보관해야 합니다.

## 구현과 제한

- 양극/음극 독립 탭 경로, 리드, 다수 접합 영역/테이프, 리드 필름.
- 중심 집속 경로, 유한 겹침 구간, 실제 겹침과 접합 관리 영역 구분.
- 탭 상면 및 모서리를 따라가는 유한 두께 테이프. 전체 뒷면 경로는 확정하지 않음.
- 내외면을 갖는 CAD 포켓. 상/하 깊이, 바닥 R, 상단 R, XY 코너 R, 필름 두께 분리.
- 성형–실링 간격, 실링 관리 폭, 절단 여유, 패키징의 추가 외장 여유, 완성 상태의 예시 접힘.
- 회전/확대/이동, 선택/숨김, 외장 투명, 내부 선택 모드, 단면·데이텀.
- semantic reference 기반 치수와 평면 자유점, 끊어진 참조 오류, JSON 저장/복원, 설계 undo/redo.
- WebGL 미지원 환경에서는 같은 CAD 메시를 CPU z-buffer로 표시합니다. 투명 합성은 미리보기 근사입니다.

**미지원/미검증:** 실제 개별 포일 변형·용접 강도/비드/용입·테이프 자유 곡면 경로·파우치 성형 변형률/국부 두께·실링 압축 및 리드 통과부 국부 성형·고객 STEP의 UI 가져오기/직접 편집·STEP PMI·2D 도면 자동 생성·사내 Windows/iPad 실기 검증. 완성 셀 접힘은 릴리프가 있는 예시 단면이고 사진의 주름이나 실제 접힘 순서를 재현한 것이 아닙니다. 모든 상세 제한은 [구현 명세](docs/spec-v1.1.md)에 있습니다.

## 검증

```sh
npm test
python -m unittest discover -s tests -p '*geometry.py' -v
npm run build
python scripts/render_proofs.py
```

[검증 기록과 이미지](docs/validation.md) · [출처별 적용/제외](docs/evidence-decisions.md) · [오프라인 인계](docs/offline-handoff.md) · [Copilot 작업 지침](.github/copilot-instructions.md)

기존 v0.4는 별도 작업 디렉터리와 Git 이력에 보존했습니다. v0.4 JSON은 기준 정의가 달라 자동 변환하지 않습니다. 사용자 원본 사진/특허 패키지는 공개 저장소에 재배포하지 않으며, 사내 인계 ZIP의 `private-reference`에 별도 보관합니다.
