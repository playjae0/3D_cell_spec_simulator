# 사내 명칭과 관리값을 연결하는 절차
대상은 PR #8 eaab126, v1.5 입력 계약 1.2 및 동봉 UI 변경이다.

1. 현재 공정에서 3D 부품이나 왼쪽 부품명을 선택한다. 오른쪽에서 치수에 포커스하면 가이드에 부품 ID, 항목 경로, 고정 기준과 변경 방향이 나온다. 같은 이름이라도 극, 공정, 시작 기준, 방향, 단위까지 맞춰 본다.
2. 함께 제공한 name-map-v15.csv에서 항목 경로(parameterId)를 찾는다. 파일은 src/intake/contract.js의 dictionaryFor와 양식 1.2의 기본 인스턴스 기준이다. 사내명과 근거 문서 위치를 기입한다. 배열의 화면 순번 대신 instanceId를 사용한다. 실제 모델에 여러 테이프가 있으면 각각의 instanceId에 매핑한다.
3. 위치 검증 예시: S4 → 양극 노란 테이프 → 부착 시작 위치. 부품은 positive.tape.yellow, 값은 positive.tapes.yellow.start, 기준은 집속점에서 바깥 X 방향이다. 양극 포일 뿌리의 B 기준 Y 위치는 positive.tab.rootY이다. 사내 문서가 테이프 중심을 규정하면 시작점 값으로 곧바로 복사하지 말고 기준 차이를 표시한다.
4. 이름만 바꿀 때는 표시 문자열을 수정한다. 단일 필드 공통 이름은 src/data/fields.js, 파우치 입력 명칭·단위·기준은 src/data/pouch-fields.js, 파우치 CAD 부품 표시는 cad/pouch_process.py, 계산/입력 안내는 src/data/bindings.js, 부품·형상 기준의 3D 이름은 cad/model.py 및 cad/process.py, 편집 그룹 이름은 src/main.js, 공정 표시명은 src/data/stages.json과 index.html에서 확인한다. 기존 필드의 label/basis는 src/intake/dictionary.json, 상세 파우치 필드는 src/data/pouch-fields.js에서 대조한다. 양극/음극 또는 특정 모델 전용 명칭이면 공통 사전을 일괄 치환하지 말고 해당 범위에서만 표시한다. 내부 ID, 저장 경로, 단위, 방향은 이름 변경으로 수정하지 않는다.
5. 관리값을 넣을 때는 examples/intake/template-1.2.json과 docs/intake/internal-copilot-prompt.md를 사용한다. 모델/개정, 부품 존재, 고유 instanceId, parameters의 값·단위·출처를 채운다. 미확정은 양식의 미입력 상태로 유지한다. 계산 치수는 입력 양식에 새 독립값으로 만들지 않는다. 양식/예시 재생성은 node scripts/generate-intake.mjs로 수행한다.
6. 가상 모델로 업로드→검토표→CAD 미리보기에서 해당 공정·극·부품을 확인한다. 해당 값 한 개만 변경해 기준점과 예상 표면이 맞게 움직이는지 확인하고 이전 개정도 다시 연다.

## 사내 Copilot에 전달할 문장
첨부한 사내 문서와 명칭 매핑표, 레포 현재 버전의 입력 사전 및 입력 양식을 읽어라. 각 관리 항목의 공정, 극, 부품 ID, 기준면/방향/단위와 문서의 위치를 대조하고 일치한 항목만 확정하라. 결과로 사내명·안정 ID·근거 문서 위치·판정이 있는 표와 업로드 가능한 모델 JSON을 작성하라. 이름 변경이 요청되면 이 표를 기준으로 해당 표시 위치를 수정하고 변경 파일을 제시하라. 이름만 유사하거나 기준점이 다른 항목은 보류하고 차이를 적어라. 새 실링 경계·절단선 등 기존 사전에 없는 항목은 신규 형상/측정 후보로 따로 적어라.

P2 양극단에서 상부 시트의 작업면 폭은 toolFaces 아래 해당 half/edge의 width를 선택한다. tool.*는 공구 작업면, seal.*는 제품 공칭 실링 영역이다. 상하 공통 영역과 상대 간극은 계산 결과로 판독한다. P0는 조립체가 없고 P1부터 합류한다. 기존 packaged/finished 모델과 상세 파우치 모델은 입력 경로가 다르므로 실제 공정 ID도 함께 기록한다.

## UI 반영 후 경로

공정별 편집 그룹과 부품 선택 연결은 `src/data/editor-targets.js`에서 관리한다. 오른쪽 입력 가이드의 항목 경로는 CSV와 동일한 안정 ID이며, 테이프 배열의 화면 순번을 포함하지 않는다. `seal.common.*` 같은 계산 대상은 별도 독립 입력이 없다고 표시한다. 실제 사내 명칭·근거는 CSV의 빈 열에 작성한다. 동봉된 값은 사내 확정값이 아니다.
