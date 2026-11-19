# 부품·요소기술 v2 검토 보고서

## 남은 사항

- **04 부분 반영:** 기존 입력 키/스키마를 유지하며 내재 치수와 조립 배치의 화면 소유권을 분리했다. 전체를 새 로컬 datum/placement 스키마로 이주하지 않았다. R4 비영 수납 배치는 기존 무시 동작을 명시 거부로 바꿨다. 자유 수납은 컵/탭실링 결합 계약 확정 후 후속 구현한다.
- **05·09 사용자 확인:** 혼·엔빌 바디, 실제 치끝 평탄폭, 실링바 몸통 두께/단면 R 자료 없음. 접촉부 실제 치형과 정의된 홈 단면까지 모델링했다. 실제 바디를 입력받기 전 제품 압착 결과로 사용하면 안 된다.
- **07 사용자 확인:** 실런트 길이 기준은 기존 집속 start를 유지하고 리드 시작 대비 차이로 표시한다. 사내 관리 기준을 리드 끝/중심으로 바꿀지는 미확정이다.
- **11 미검증 환경:** 실제 Windows 사내 PC 및 실제 iPad Safari는 이 Linux 검증 환경에서 시험하지 않았다. Chromium의 iPad 가로/터치와 좁은 화면으로 구분해 검증한다.
- **06 후속 제외 범위:** 새 레이저 배열 편집·전용 3D는 이번 지시대로 추가하지 않았다. 현재 모델의 스팟 기록과 설정은 보존한다.

## 조작과 구현 상태

| 번호 | 구현 | 로컬 CAD | 읽기 전용 프리뷰 | 근거 |
|---|---|---|---|---|
| 01 | 현재 설계의 실제 CAD 단품 카드, 양·음 독립; 혼/엔빌 별도 카드, 실링 평면·단면 치수, 데이터 없음 이유 | 카드→동일 단품 | 동일 공개 설계 기록만 조회 | workbench.populateComponentCards; evidence/*-cards.png |
| 02 | 왼쪽 사양, 오른쪽 큰 단품 3D, 아래 작은 완성 셀; 접촉면 사시도·정면·측면·맞춤 | 3D 회전/시점 | 동일 메시 시점 | evidence/*horn*.png, *narrow.png |
| 03 | 단품 내재 입력과 제품 조립 배치 분리; 기존 값 보존 | 제품 설계의 배치 입력 | 모두 잠금 | components/contract, bindings, component.test |
| 04 | 전체 계보 조사와 기존 좌표 유지; 공구 치끝 기준 추가; R4 미지원 수납 명시 거부 | CAD 데이텀/기존 강체 변환 시험 | 기록 좌표 보존 | DATUM_MAP.md; component_geometry + pouch_geometry |
| 05 | OCC 사각뿔/리지 요철, 고정 격자·완전한 경계치만 유지; 접촉부 한정 | U 피치/높이·타극 독립 | 실제 CAD 치형 원문 기록 | cad/tool_teeth.py; evidence/*results.json |
| 06 | 원래 레이저 스팟과 입력 보존; 초음파 선택 극은 기록 없음 표시 | 기존 레이저 CAD 회귀 | 해당 모델의 기록만 | tooling_geometry.test_laser* |
| 07 | 리드·실런트 한 카드; 개별 ID 유지; 리드 폭 연동·상대 시작 보존·동시 이동 | 폭/이동/JSON 왕복 | 결합 단품 읽기 | component.test, component_geometry; *lead-move.json |
| 08 | 열린 두 컵/브리지/가스 여유, 테이프 실제 표면 메시 | 기존 형상 생성 재사용 | 동일 공정에서 필터한 부분만 표시 | tooling_geometry, 카드 캡처 |
| 09 | 주 화면에 실링 계획 + 중앙/좌우/홈의 CAD 단면; 정의된 홈 입력 | 3/5 mm 폭, 홈 깊이 변동 | 기록된 교차 좌표 | component_geometry; *seal-section.png |
| 10 | 단품 입장시 완성 셀 기본, 부품/접합 적용 부위 강조; 하단 공정 토글 독립 | 원 제품 stage 유지 | 동일 기록 토글 | check_component_browser; *application.png |
| 11 | 기존 라이브/정적 분리; 같은 기록/해시/캐시 경로 재사용 | 미리보기/적용/취소/저장/재열기 | 입력·JSON·STEP 잠금 | scripts/build-preview.mjs, 테스트 결과 아래 |
| 12 | 3D 치수/등록 모서리 더블클릭, 후보 목록, 터치 선택 후 편집; 안정적 극/공정/공구 필드 | 혼 피치와 엔빌 치높이 직접 수정, 음수 거부/취소 | 같은 치수 선택, 편집 잠금 | evidence/*results.json, check_component_browser |

## 검증 기록

구현 소스 커밋: `db1411c0a24366cb75007ab65c1c2fb6d8c0e287` (원격 `feat/cell-process-overview`에 푸시 완료). 보고서/검증 스크립트의 보완은 후속 문서 커밋이며 앱 소스는 동일하다. `evidence/`의 화면은 각 파일명에 live/preview/touch 구분을 갖는다. 캡처의 예시값은 실물 치수가 아니다.


### 실제 3D 편집 전후 (양극 S3, mm)

| 조작 | 전 → 후 | 고정 결합면·원점 (셀 좌표) | 실제 변경 | 독립성 |
|---|---|---|---|---|
| 혼 U 피치 직접 편집 | 0.8 → 1.0 | `positive.tab.top`, (−136, −1, 0.300) | 실제 치 중심 간격 0.8 → 1.0, 완전한 치 115 → 69개 | 엔빌·반대 극의 부품 JSON 동일 |
| 혼 치높이 직접 편집 | 0.2 → 0.4 | 치끝 Z=0.300 | 치근 Z=0.500 → 0.700, 측면 요철 높이 변경 | 적용 전 미리보기 후 취소 |
| 엔빌 치높이 직접 편집 | 0.15 → 0.30 | `positive.lead.bottom`, (−136, −1, −0.650) | 치근 Z=−0.800 → −0.950, 69개 배열 유지 | 혼 부품 JSON 동일 |
| 리드 폭 / 결합 단품 이동 | 폭 36 → 37; start 2 → 2.2 | 실런트의 리드 대비 시작 18 유지 | 실런트 폭 40 → 41; film.start 20 → 20.2 | 반대 극 유지, 저장/재열기 확인 |
| 실링 단면 | 중앙 폭 3 / 좌우 바깥 폭 5 | 선택 U=0 / −43.5 / 74.5 | CAD 선 교차로 계산; 홈 깊이 0.35 시험 시 중앙 단면만 이동 | 제품 압착/바디 형상 생성 없음 |

3D 편집은 화면 치수선의 실제 더블클릭, 터치 선택 후 편집 버튼으로 수행했다. 음수 치높이는 CAD의 양수 조건 오류로 거부했고 취소 후 마지막 확정값으로 복원했다. 엔빌 0.3 적용 후 JSON 저장/재열기에서도 유지했다. 근거: `live-results.json`, `live-touch-results.json`, `live-saved-project.json`, `live-lead-move.json`.

### 실행 결과

- `npm test`: 82/82 통과.
- `python -m unittest discover -s tests -p '*geometry*.py' -v`: 59/59 통과. 기존 회귀 52 + 신규 7. 최종 결합면 ID까지 보강한 신규 7개 재실행도 통과.
- `npm run build`: 성공. 기존 빌드 경로/dist 유지. 큰 JS 번들에 대한 Vite 권고 경고는 남는다.
- `check_component_browser.py`: 실시간 실제 CAD, 3D 편집·취소·부적합값·적용·저장·재열기·리드 결합 이동·제품 공정도 복귀 통과, pageerror 0.
- `check_component_touch.py`: 1194×834 터치의 혼 피치/엔빌 높이 편집과 취소, 600×900 폭 넘침 없음, pageerror 0.
- `npm run build:preview`: 별도 깨끗한 checkout에서 위 소스 커밋으로 실행. 실제 CadQuery 2.7 응답의 80조합(성공 53/거부 27) 원문 무손실 왕복 및 라이브 재요청 대조 통과, 생성 서버 종료.
- `check_component_preview.py`: CAD 서버와 연결되지 않은 정적 폴더를 **하위 경로** `/review/r5/`에서 제공. 공개 4모델의 UI 노출 43개 공정과 부품 ID를 기록과 대조, 단품/완성 셀/적용 공정·치수 선택·편집/저장/STEP 잠금·터치/좁은 폭 통과. POST 0, pageerror 0. 행렬 페이지 콘솔 오류는 최초 `/api/health` 404 한 건만 허용했다.
- 동일 값의 미기록 개정과 변경 설계는 기존 lookup/comparison 검사에서 거부됨. 회전·단면·가시성만 바뀐 경우 같은 기록 조회.

### 기록 크기와 배포

| 공개 설계 | 서버 원문 bytes | 무손실 사전 파일 bytes | 사전 gzip bytes | 성공/거부 |
|---|---:|---:|---:|---:|
| demo | 2,005,279 | 1,072,572 | 167,571 | 7 / 13 |
| pouch-process | 5,313,988 | 2,456,745 | 354,285 | 12 / 8 |
| process-tooling-r4 | 10,572,860 | 5,587,358 | 715,249 | 17 / 3 |
| pouch-phase1 | 10,202,233 | 5,210,882 | 712,506 | 17 / 3 |

최종 배포물 13파일, 합계 **15,396,040 bytes**, 최대 **5,587,358 bytes**. 파일 16,000,000 / 합계 256,000,000 / 511개 한도 모두 통과. ZIP **2,284,810 bytes**. 치형은 동일 부품 JSON 사전 경로에서 중복 제거하며 단품별 전체 셀을 별도 저장하지 않는다.

- Artifact: https://pouch-cell-phase1.goodlycurio3.chatgpt.site
- Sites 저장 버전 3, 배포 성공 `appgdep_6afe96ed9bd481918157a3ea79f8ad79`.
- Sites 정적 소스 커밋 `1050d525917299b782eefcf800fa5b3584d5f13a`; 내장 CAD/앱 소스 커밋은 `db1411c`.
- 배포 ZIP: `/workspace/deliverables/Cell_Component_v2_db1411c.zip`.

### 화면 근거

[단품 전체보기](evidence/live-cards.png) · [혼 전](evidence/live-horn-before.png) · [혼 피치 변경](evidence/live-horn-pitch-after.png) · [혼 높이/사시](evidence/live-horn-height-iso.png) · [혼 높이/측면](evidence/live-horn-height-side.png) · [엔빌 높이 전](evidence/live-anvil-height-before.png) · [엔빌 높이 후](evidence/live-anvil-height-after.png) · [적용 공정과 셀](evidence/live-application.png) · [실링 단면](evidence/live-seal-section.png) · [정적 프리뷰](evidence/preview-touch-cards.png).

### 배포 사이트 직접 검증 및 인계

공유 Chrome에서 실제 URL `https://pouch-cell-phase1.goodlycurio3.chatgpt.site/`를 열어 다음을 직접 확인했다.

1. 첫 화면 **부품·요소기술 전체보기**, 동일 모델 `virtual-pouch-phase1 / phase1-1`, `db1411c` 사전 계산 프리뷰 상태와 실제 CAD 카드.
2. 양극 메인 용접 혼: U 피치 0.8 mm, 치끝 0 / 치근 +0.2 mm, 115개 치형 및 완성 셀 적용 부위 표시. 입력·미리보기·저장·STEP 잠금.
3. 엔빌 선택 및 측면/치높이 선택: 치높이 0.15 mm, 치끝 0 / 치근 −0.15 mm, 69개 치형. 프리뷰에서는 선택만 가능하며 편집은 잠김.
4. **제품 공정도 전체보기 → S2 가용접 상세 → 실링바 단품 → 제품 공정도 전체보기 복귀**. 모델·개정 유지, 실링 중앙 폭 3 / 바깥 폭 5 mm 확인.
5. **부품·요소기술 전체보기**로 돌아와 결과 탭을 열어둠.

`deployed-*.jpg`는 실제 배포 사이트 캡처, `preview-*`는 동일 ZIP의 로컬 정적 호스트 캡처, `live-*`는 로컬 CAD 편집 캡처다. 배포 브라우저에서 조회한 최근 오류 로그는 브라우저 확장 프로그램 metadata 전송 오류이며 앱 오류로 합산하지 않았다. 이 직접 점검은 전수 콘솔 검사 대신 탐색·형상·잠금 확인이다. 43공정 전수 검증과 앱 pageerror 0은 앞의 로컬 정적 시험 결과다.

초기 셸 측 Playwright 시도는 인증서 오류, 시스템 HTTP 시도는 403으로 실패했다(`evidence/deployed-attempt.txt`). 이후 공유 Chrome의 정상 경로로 성공했으며 인증서 경고 우회나 보안 설정 변경은 하지 않았다.

[배포 전체보기](evidence/deployed-overview.jpg) · [배포 혼](evidence/deployed-horn.jpg) · [배포 엔빌](evidence/deployed-anvil.jpg) · [배포 S2](evidence/deployed-s2.jpg) · [배포 실링바](evidence/deployed-seal.jpg) · [제품 공정도 복귀](evidence/deployed-product-return.jpg).
