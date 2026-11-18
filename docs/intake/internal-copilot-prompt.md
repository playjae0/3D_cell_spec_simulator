# 사내 Copilot 입력 작성 지침 · intake 1.2

첨부 사내 도면/스펙 문서와 이 저장소의 `examples/intake/template-1.2.json`, `src/intake/dictionary.json`, `src/intake/schema.json`, `docs/intake/required-fields-1.2.json`을 읽고 `pouch-cell-intake/1.2` JSON을 작성한다. 이 작업은 문서에서 값을 추출하는 작업이다. CAD 코드나 외부 API 호출을 작성할 필요는 없다.

- 모델 ID/이름/개정/기준 개정을 입력한다. 신규 모델은 baseRevision=null. existing model의 새 개정은 기존 revision을 baseRevision으로 둔다.
- 사용자 확인 구조: 낱장 적층, 양끝 탭/리드, 두께 방향의 중심 집속, 양·음극 독립. 사진의 화면 좌우를 극성으로 변환하지 않는다. V자/블레이드, W2 가이드, W3 복합 용접을 추정하지 않는다.
- 문서에 없는 값은 value=null, status=missing, reviewStatus=pending으로 남긴다. 0은 측정·설계값으로 명시된 경우에만 쓴다. 예시 파일 숫자로 빈칸을 채우지 않는다.
- 각 실제 값은 sources의 sourceId와 페이지/뷰/치수번호/표 행을 sourceRefs.locator에 기록한다. 원문은 originalText, 원 숫자·단위는 originalValue/originalUnit에 보존한다. confidence를 승인 근거로 쓰지 않는다. Copilot은 reviewStatus=reviewed로 자체 승인하지 않는다.
- 기본 mm/deg. 길이는 um, µm, μm도 받으며 검토표에서 mm로 정규화된다. 예: value=350, unit=µm → CAD 0.35 mm. 단위 변환을 이미 계산한 경우 status=derived, unit=mm, originalValue=350, originalUnit=µm, conversion={op:unit_scale,inputParameterIds:[],expression:"350 µm × 0.001"}로 기록한다.
- 허용 계산은 unit_scale, sum, difference뿐이다. sum/difference의 inputParameterIds는 같은 단위의 사전 ID를 참조한다. difference는 입력 두 개의 순서대로 뺀다. expression은 설명 문자열이며 실행하지 않는다. 플랫폼이 허용 연산으로 재계산해 불일치를 차단한다.
- rootLength는 X 투영 돌출이고 포일 전개 길이가 아니다. gatheredLength는 집속 완료 단면→끝 X 길이이며 adapter가 axialShortening=rootLength−gatherDistance−gatheredLength를 계산한다. 리드 length는 겹침을 포함한 전체 길이이고 돌출 길이와 다르다. 의미가 불분명하면 대입하지 말고 unmappedRequirements에 원문을 보존한다.
- componentInstances의 polarity/kind/instanceId로 부품을 구분한다. enabled/included=false는 존재가 absent로 확인된 경우만. unknown은 미확정이다. 부재도 문서 근거를 기록한다. 여러 용접/테이프는 새 instanceId로 복제하고 parameterId 안의 같은 ID를 바꾼다. 양극과 음극을 자동 복제하지 않는다.
- 표면 테이프 path=top이면 width/offsetY를 입력한다. top_edges이면 host 폭과 모서리 경로로 형상을 계산하므로 width/offsetY는 비활성이고 edgeDrop이 필요하다. 비활성 숫자를 다른 의미로 바꾸지 않는다.
- 리드 실런트(leadFilm)는 노란 테이프와 별도다. 신규 S3부터 실런트 존재/부재를 확인한다. 존재하면 양극/음극 각각의 값을 입력한다. 구버전 1.0의 S3 미입력 호환 경고를 새 양식의 입력 면제로 사용하지 않는다.
- 측정 조건은 inspectionItems의 conditions에, 설명은 note에 기록한다. 카메라/검사 보기와 검사 정의를 구분한다.
- 검사 항목은 inspectionItems에 목표·공차·설명을 기록하고, 샘플 실측을 설계값에 섞지 않는다. signed_coordinate는 지정 검사 데이텀 원점→A의 부호 좌표, signed_offset은 A→B의 부호 차이다. axis와 datumId를 기록한다. 기존 x/y/z는 절댓값 거리다.
- 모르거나 구현되지 않은 featureId는 null로 두고 미연결 상태로 검토하게 한다. 임의 면 번호를 만들지 않는다. 주름/미지원 작업면·접힘은 unmappedRequirements에 남긴다.
- 출처끼리 충돌하면 status=conflict, value=null로 하고 conflicts에 원문 근거를 모두 기록한다. 크기가 맞지 않는 값을 자동 보정하지 않는다.

사용자는 앱에서 생성 공정의 필수 입력, 원문·정규화 값·출처를 검토한다. 필수값의 pending은 CAD 생성 전에 사용자 검토가 필요하다. 생성된 형상과 검사 기준의 실물 적합성은 사내에서 확인한다.


## 파우치 공정 추가 (1.2)

`src/data/pouch-fields.js`, `docs/spec-pouch-v1.5.md`와 `docs/intake/required-fields-1.2.json`을 함께 읽는다. 실행 가능한 사전은 기존 dictionary.json에 pouch-fields.js를 합친다. 빈 양식의 value=null을 유지하고 `virtual-pouch-1.2.json`은 구조 예시로만 본다.

- requestedStages의 pouch_formed는 조립체 없이 성형 외장을 생성한다. loaded에서 S4와 합류하고 sealed/trimmed/folded를 거친다. 기존 packaged/finished ID를 새 상세 형상으로 재해석하지 않는다.
- pouchProcess.type/construction/sidewall은 명시적인 모델 선택이다. 현재 double_cup / separate_sheets / vertical만 지원한다. 다른 제품은 unmappedRequirements에 남기고 기본값으로 강제하지 않는다.
- 상하 sheets의 개구·깊이·바닥 R·림 R·평면 R·필름 두께를 각각 추출한다. 내면 기준이다. 바닥 길이/경사는 독립 입력이 아니므로 도면과 의미가 다르면 충돌로 남긴다.
- blank/cut는 재료 원점 기준 부호 있는 절대 좌표, keep-side는 사각 경계 내부다. 절단 잔여 폭과 실링 작업 폭을 같은 값으로 쓰지 않는다.
- toolFaces의 upper/lower × xMinus/xPlus/yMinus/yPlus는 별도 입력이다. X 변 U=Y, Y 변 U=X, V=바깥 방향. +X/−X를 양극/음극으로 고정하지 말고 실제 end 배정을 확인한다. relief는 명시적으로 존재할 때만 활성화한다. 제품 절단/감육 홈과 혼동하지 않는다.
- seamGap은 공칭 조립 간격이다. 압착 후 실링 두께로 바꾸지 않는다. 리드·실런트·파우치의 실제 미확인 단면은 미확정 설명으로 남긴다.
- assemblyPose는 X→Y→Z 회전 후 이동이다. 기존 부품 고유 치수를 배치 오프셋에 맞추어 바꾸지 않는다.
- folds의 안정 ID와 order를 분리한다. line은 전개 재료의 접선 시작 위치, innerR는 전체 공칭 재료 포락 내측 반경, neutralFraction은 기준층 가정이다. angle은 도 단위이며 실제 스프링백 예측값이 아니다. 현재 평행 긴 변 안쪽→바깥쪽 순서만 지원한다.
- 계산값(processMetrics)의 간극·체적·공통 면적·잔여 폭·최종 외곽을 생성 입력으로 덮어쓰지 않는다. 접힌 두 점의 직선 거리와 재료 전개 길이를 구분한다. 실제 측정값은 개정에 귀속된 검사 항목으로 기록한다.
## 사내 명칭 연결

[명칭 가이드](internal-names-guide-v15.md)와 [명칭 매핑표](name-map-v15.csv)를 함께 사용한다. 단순 이름 일치로 값을 대응시키지 말고 공정·극·부품 ID·기준·방향·단위를 확인한다. 배열 순번 대신 instanceId를 사용하고, 내부 ID나 저장 경로는 표시 명칭 변경으로 바꾸지 않는다. 미확정 항목은 보류하고 근거 문서 위치와 기준 차이를 기록한다.
