# 필드 → 형상/측정 연결표 v1.2

`src/data/bindings.js`에서 생성. 아래 양극 경로와 같은 이름의 음극 경로는 별도 데이터이며 자동 복제하지 않는다. S0부터 정의된 입력을 뒤 상태에서 편집하면 앞 단계 입력을 편집하는 것이고, S1 이후 전용 입력은 S0를 변경하지 않는다.

|입력 경로|이름|정의 단계|부품|측정 기준|고정 기준/방향|영향|
|---|---|---|---|---|---|---|
|`stack.length`|조립체 길이 X|S0 이후|`stack`|`stack.length.minus` → `stack.length.plus` / x|C / X=0 중심, 리드·탭 제외|연결된 포일·리드·영역·테이프·수납 검증|
|`stack.width`|조립체 폭 Y|S0 이후|`stack`|`stack.width.minus` → `stack.width.plus` / y|B / Y=0 중심|연결된 포일·리드·영역·테이프·수납 검증|
|`stack.thickness`|조립체 두께 Z|S0 이후|`stack`|`stack.thickness.minus` → `stack.thickness.plus` / thickness|A / Z=0 중심|연결된 포일·리드·영역·테이프·수납 검증|
|`stack.cornerR`|평면 코너 R|S0 이후|`stack`|`stack.cornerR` → `원호 R` / radius|조립체 XY 외곽|연결된 포일·리드·영역·테이프·수납 검증|
|`positive.tab.foilWidth`|포일 폭 · 뿌리부터 일정|S0 이후|`positive.tab`|`positive.tab.rootWidthMinus` → `positive.tab.rootWidthPlus` / y|S0 입력 · 뿌리와 집속 구간의 Y 폭이 동일|후속 집속·리드·용접·테이프|
|`positive.tab.rootLength`|집속 전 돌출 길이|S0 이후|`positive.tab`|`positive.tab.root` → `positive.tab.stockEnd` / x|S0 조립체 끝 고정 → 바깥 방향. 후속 집속 길이에 전달|후속 집속·리드·용접·테이프|
|`positive.tab.rootSpread`|뿌리 두께 분포|S0 이후|`positive.tab`|`positive.tab.rootBottom` → `positive.tab.rootTop` / z|포일 분포 포락 높이 · 개별 박 두께 아님|후속 집속·리드·용접·테이프|
|`positive.tab.rootY`|뿌리 Y 중심|S0 이후|`positive.tab`|`positive.tab.rootYBase` → `positive.tab.root` / y|B 기준|후속 집속·리드·용접·테이프|
|`positive.tab.rootZ`|뿌리 Z 중심|S0 이후|`positive.tab`|`positive.tab.rootZBase` → `positive.tab.root` / z|A 기준|후속 집속·리드·용접·테이프|
|`positive.tab.gatherDistance`|뿌리→집속 거리|S1 이후|`positive.tab`|`positive.tab.root` → `positive.tab.gather` / x|조립체 끝단에서 바깥 X 방향|후속 집속·리드·용접·테이프|
|`positive.tab.gatherY`|집속 Y 중심|S1 이후|`positive.tab`|`positive.tab.gatherYBase` → `positive.tab.gather` / y|B 기준 · 반대 극과 독립|후속 집속·리드·용접·테이프|
|`positive.tab.gatherZ`|집속 Z 오프셋|S1 이후|`positive.tab`|`positive.tab.gatherZBase` → `positive.tab.gather` / z|A 기준 · 기본 0 = 조립체 중앙|후속 집속·리드·용접·테이프|
|`positive.tab.thickness`|집속 후 두께|S1 이후|`positive.tab`|`positive.tab.bottom` → `positive.tab.top` / thickness|유한 포락 두께 Z|후속 집속·리드·용접·테이프|
|`positive.tab.gatheredLength`|집속 후 길이|S1 이후|`positive.tab`|`positive.tab.gather` → `positive.tab.tipCenter` / x|집속점 고정. 입력 시 투영 수축을 계산하며 S0 돌출은 유지|후속 집속·리드·용접·테이프|
|`positive.tab.edgeR`|집속 단면 모서리 R|S1 이후|`positive.tab`|`positive.tab.edgeR` → `원호 R` / radius|YZ 단면 · 테이프 감쌈 접촉면|후속 집속·리드·용접·테이프|
|`positive.prewelds.0.enabled`|가용접 영역 사용|S2 이후|`positive.preweld.pre-1`|부품/경로 가이드 · 직접 관리 치수 연결 없음|실제 용접 흔적을 확정하지 않는 관리 영역|해당 관리 영역·연결 주석|
|`positive.prewelds.0.start`|가용접 시작 위치|S2 이후|`positive.preweld.pre-1`|`positive.tab.gather` → `positive.preweld.pre-1.start` / x|집속점 기준 바깥 X|해당 관리 영역·연결 주석|
|`positive.prewelds.0.length`|가용접 영역 길이|S2 이후|`positive.preweld.pre-1`|`positive.preweld.pre-1.start` → `positive.preweld.pre-1.end` / x|집속 포일 내부|해당 관리 영역·연결 주석|
|`positive.prewelds.0.width`|가용접 영역 폭|S2 이후|`positive.preweld.pre-1`|`positive.preweld.pre-1.widthMinus` → `positive.preweld.pre-1.widthPlus` / y|Y 방향|해당 관리 영역·연결 주석|
|`positive.prewelds.0.offsetY`|가용접 Y 위치|S2 이후|`positive.preweld.pre-1`|`positive.preweld.pre-1.yBase` → `positive.preweld.pre-1.face` / y|집속 Y 대비|해당 관리 영역·연결 주석|
|`positive.prewelds.0.process`|용접 공법 기록|S2 이후|`positive.preweld.pre-1`|부품/경로 가이드 · 직접 관리 치수 연결 없음|형상 변경 없음 · 스펙 메타데이터|해당 관리 영역·연결 주석|
|`positive.preweldLead.included`|S2 리드 포함|S2 전용|`positive.lead`|부품/경로 가이드 · 직접 관리 치수 연결 없음|데모 가정 · 메인 용접 단계 리드와 별도 배치 입력|해당 단계 리드·겹침·용접|
|`positive.preweldLead.start`|리드 시작 거리|S2 전용|`positive.lead`|`positive.tab.gather` → `positive.lead.start` / x|집속점 기준 바깥 X|해당 단계 리드·겹침·용접|
|`positive.preweldLead.length`|리드 전체 길이|S2 전용|`positive.lead`|`positive.lead.start` → `positive.lead.end` / x|겹침 포함 · 돌출 길이는 계산|해당 단계 리드·겹침·용접|
|`positive.preweldLead.width`|리드 폭|S2 전용|`positive.lead`|`positive.lead.widthMinus` → `positive.lead.widthPlus` / y|Y 방향|해당 단계 리드·겹침·용접|
|`positive.preweldLead.thickness`|리드 두께|S2 전용|`positive.lead`|`positive.lead.bottom` → `positive.lead.top` / thickness|Z 방향|해당 단계 리드·겹침·용접|
|`positive.preweldLead.offsetY`|집속 중심 대비 Y|S2 전용|`positive.lead`|`positive.lead.yBase` → `positive.lead.center` / y|리드 중심 = 집속 Y + 오프셋|해당 단계 리드·겹침·용접|
|`positive.preweldLead.contactSide`|탭과 접촉하는 위치|S2 전용|`positive.lead`|부품/경로 가이드 · 직접 관리 치수 연결 없음|미확정 관계 · 변경 가능한 예시. 리드 Z는 접촉면에서 계산|해당 단계 리드·겹침·용접|
|`positive.lead.start`|리드 시작 거리|S3 이후|`positive.lead`|`positive.tab.gather` → `positive.lead.start` / x|집속점 기준 바깥 X|해당 단계 리드·겹침·용접|
|`positive.lead.length`|리드 전체 길이|S3 이후|`positive.lead`|`positive.lead.start` → `positive.lead.end` / x|겹침 포함 · 돌출 길이는 계산|해당 단계 리드·겹침·용접|
|`positive.lead.width`|리드 폭|S3 이후|`positive.lead`|`positive.lead.widthMinus` → `positive.lead.widthPlus` / y|Y 방향|해당 단계 리드·겹침·용접|
|`positive.lead.thickness`|리드 두께|S3 이후|`positive.lead`|`positive.lead.bottom` → `positive.lead.top` / thickness|Z 방향|해당 단계 리드·겹침·용접|
|`positive.lead.offsetY`|집속 중심 대비 Y|S3 이후|`positive.lead`|`positive.lead.yBase` → `positive.lead.center` / y|리드 중심 = 집속 Y + 오프셋|해당 단계 리드·겹침·용접|
|`positive.lead.contactSide`|탭과 접촉하는 위치|S3 이후|`positive.lead`|부품/경로 가이드 · 직접 관리 치수 연결 없음|미확정 관계 · 변경 가능한 예시. 리드 Z는 접촉면에서 계산|해당 단계 리드·겹침·용접|
|`positive.joints.0.enabled`|접합 영역 사용|S3 이후|`positive.joint.main`|부품/경로 가이드 · 직접 관리 치수 연결 없음|실제 용접 흔적을 확정하지 않는 관리 영역|해당 관리 영역·연결 주석|
|`positive.joints.0.start`|접합 시작 위치|S3 이후|`positive.joint.main`|`positive.tab.gather` → `positive.joint.main.start` / x|집속점 기준 바깥 X|해당 관리 영역·연결 주석|
|`positive.joints.0.length`|접합 영역 길이|S3 이후|`positive.joint.main`|`positive.joint.main.start` → `positive.joint.main.end` / x|실제 겹침 영역 내부|해당 관리 영역·연결 주석|
|`positive.joints.0.width`|접합 영역 폭|S3 이후|`positive.joint.main`|`positive.joint.main.widthMinus` → `positive.joint.main.widthPlus` / y|Y 방향|해당 관리 영역·연결 주석|
|`positive.joints.0.offsetY`|접합 Y 위치|S3 이후|`positive.joint.main`|`positive.joint.main.yBase` → `positive.joint.main.face` / y|집속 Y 대비|해당 관리 영역·연결 주석|
|`positive.joints.0.process`|용접 공법 기록|S3 이후|`positive.joint.main`|부품/경로 가이드 · 직접 관리 치수 연결 없음|형상 변경 없음 · 스펙 메타데이터|해당 관리 영역·연결 주석|
|`positive.tapes.0.enabled`|테이프 사용|S4 이후|`positive.tape.yellow`|부품/경로 가이드 · 직접 관리 치수 연결 없음|사진에서 확인한 노란 테이프|해당 테이프/필름·연결 주석|
|`positive.tapes.0.face`|테이프 부착면|S4 이후|`positive.tape.yellow`|부품/경로 가이드 · 직접 관리 치수 연결 없음|카메라 기준 아님 · 탭 로컬 상/하면. 리드 접촉면과 충돌하면 거부|해당 테이프/필름·연결 주석|
|`positive.tapes.0.path`|부착 경로|S4 이후|`positive.tape.yellow`|부품/경로 가이드 · 직접 관리 치수 연결 없음|뒷면 전체 감쌈은 미확정 · 자동 복제 없음|해당 테이프/필름·연결 주석|
|`positive.tapes.0.start`|부착 시작 위치|S4 이후|`positive.tape.yellow`|`positive.tab.gather` → `positive.tape.yellow.start` / x|집속점 기준 바깥 X|해당 테이프/필름·연결 주석|
|`positive.tapes.0.length`|테이프 X 길이|S4 이후|`positive.tape.yellow`|`positive.tape.yellow.start` → `positive.tape.yellow.end` / x|집속 상면 범위 내|해당 테이프/필름·연결 주석|
|`positive.tapes.0.width`|상면 피복 폭|S4 이후|`positive.tape.yellow`|`positive.tape.yellow.widthMinus` → `positive.tape.yellow.widthPlus` / y|Y 방향 · 모서리 경로에서는 호스트 폭으로 계산|해당 테이프/필름·연결 주석|
|`positive.tapes.0.offsetY`|상면 Y 위치|S4 이후|`positive.tape.yellow`|`positive.tape.yellow.yBase` → `positive.tape.yellow.face` / y|집속 중심 대비 · 모서리 경로에서는 0|해당 테이프/필름·연결 주석|
|`positive.tapes.0.thickness`|테이프 두께|S4 이후|`positive.tape.yellow`|`positive.tape.yellow.innerFace` → `positive.tape.yellow.outerFace` / thickness|부착면 법선 방향|해당 테이프/필름·연결 주석|
|`positive.tapes.0.edgeDrop`|모서리 아래 부착 길이|S4 이후|`positive.tape.yellow`|부품/경로 가이드 · 직접 관리 치수 연결 없음|모서리 경로 전용 · R 이후 측면 구간|해당 테이프/필름·연결 주석|
|`positive.leadFilm.enabled`|리드 필름 사용|S4 이후|`positive.leadFilm`|부품/경로 가이드 · 직접 관리 치수 연결 없음|사진으로 세부 단면 미확정 · 가정|해당 테이프/필름·연결 주석|
|`positive.leadFilm.start`|필름 시작 위치|S4 이후|`positive.leadFilm`|`positive.tab.gather` → `positive.leadFilm.start` / x|집속점 기준 바깥 X|해당 테이프/필름·연결 주석|
|`positive.leadFilm.length`|필름 X 길이|S4 이후|`positive.leadFilm`|`positive.leadFilm.start` → `positive.leadFilm.end` / x|노출 리드 부착 범위|해당 테이프/필름·연결 주석|
|`positive.leadFilm.overhang`|양쪽 Y 피복 여유|S4 이후|`positive.leadFilm`|`positive.leadFilm.leadSide` → `positive.leadFilm.outerSide` / y|리드 폭 대비|해당 테이프/필름·연결 주석|
|`positive.leadFilm.thickness`|필름 공칭 두께|S4 이후|`positive.leadFilm`|`positive.leadFilm.innerFace` → `positive.leadFilm.outerFace` / thickness|리드 외면 법선 방향|해당 테이프/필름·연결 주석|
|`pouch.openingLength`|성형 개구 길이 X|S5 이후|`pouch.upper.pocket`|`pouch.forming.x.minus` → `pouch.forming.x.plus` / x|성형 경계 기준 · 조립체와 별도|파우치·실링·외곽·접힘|
|`pouch.openingWidth`|성형 개구 폭 Y|S5 이후|`pouch.upper.pocket`|`pouch.forming.y.minus` → `pouch.forming.y.plus` / y|성형 경계 기준|파우치·실링·외곽·접힘|
|`pouch.planR`|평면 코너 R|S5 이후|`pouch.upper.pocket`|`pouch.upper.planR` → `원호 R` / radius|성형 개구의 XY 곡선|파우치·실링·외곽·접힘|
|`pouch.filmThickness`|외장 필름 두께|S5 이후|`pouch.upper.pocket`|`pouch.upper.innerFloor` → `pouch.upper.outerFloor` / thickness|내면의 법선 오프셋 · 균일 공칭값|파우치·실링·외곽·접힘|
|`pouch.upperDepth`|상부 성형 깊이|S5 이후|`pouch.upper.pocket`|`datum.origin` → `pouch.upper.depth` / z|A에서 내면 평탄부까지 +Z|파우치·실링·외곽·접힘|
|`pouch.upperFloorR`|상부 바닥 연결 R|S5 이후|`pouch.upper.pocket`|`pouch.upper.floorR` → `원호 R` / radius|내면 바닥–측벽|파우치·실링·외곽·접힘|
|`pouch.upperRimR`|상부 상단 연결 R|S5 이후|`pouch.upper.pocket`|`pouch.upper.rimR` → `원호 R` / radius|내면 측벽–외곽 평면|파우치·실링·외곽·접힘|
|`pouch.lowerDepth`|하부 성형 깊이|S5 이후|`pouch.lower.pocket`|`datum.origin` → `pouch.lower.depth` / z|A에서 내면 평탄부까지 −Z|파우치·실링·외곽·접힘|
|`pouch.lowerFloorR`|하부 바닥 연결 R|S5 이후|`pouch.lower.pocket`|`pouch.lower.floorR` → `원호 R` / radius|내면 바닥–측벽|파우치·실링·외곽·접힘|
|`pouch.lowerRimR`|하부 상단 연결 R|S5 이후|`pouch.lower.pocket`|`pouch.lower.rimR` → `원호 R` / radius|내면 측벽–외곽 평면|파우치·실링·외곽·접힘|
|`pouch.sealGap`|성형–실링 간격|S5 이후|`pouch.upper.seal`|`pouch.forming.y.plus` → `pouch.sealInner.y.plus` / y|성형 끝→실링 시작|파우치·실링·외곽·접힘|
|`pouch.sealWidth`|실링 관리 폭|S5 이후|`pouch.upper.seal`|`pouch.sealInner.y.plus` → `pouch.sealOuter.y.plus` / y|실링 시작→실링 끝 · 압축 단면 미지원|파우치·실링·외곽·접힘|
|`pouch.trimMargin`|실링 밖 외곽 여유|S5 이후|`pouch.upper.margin`|`pouch.sealOuter.y.plus` → `pouch.trim.y.plus` / y|실링 끝→절단 끝 · 접기 전 재료 길이|파우치·실링·외곽·접힘|
|`pouch.foldAngle`|긴 변 접힘 각도 °|S6 이후|`pouch.upper.margin`|부품/경로 가이드 · 직접 관리 치수 연결 없음|완성 상태에만 적용 · 양끝 릴리프 있는 예시|파우치·실링·외곽·접힘|
|`pouch.foldR`|긴 변 접힘 내측 R|S6 이후|`pouch.upper.margin`|부품/경로 가이드 · 직접 관리 치수 연결 없음|완성 상태 · 외곽 여유를 호 길이로 소비|파우치·실링·외곽·접힘|
|`pouch.packagingExtraYMinus`|패키징 −Y 추가 외장 여유|S5 이후|`pouch.upper.pocket`|부품/경로 가이드 · 직접 관리 치수 연결 없음|패키징 상태만 · 용도 미확정 · 완성 시 제거 가정|파우치·실링·외곽·접힘|
|`pouch.packagingExtraYPlus`|패키징 +Y 추가 외장 여유|S5 이후|`pouch.upper.pocket`|부품/경로 가이드 · 직접 관리 치수 연결 없음|패키징 상태만 · 실제 용도는 사내 확인|파우치·실링·외곽·접힘|

`tab.gatheredLength`는 UI 경로이며 JSON 필드가 아니다. rootLength − gatherDistance − axialShortening을 읽고, 입력 시 axialShortening만 바꾼다. S2 preweldLead가 미포함이면 배치 입력은 비활성이다. 테이프 top_edges의 폭/Y 위치는 호스트에서 계산하므로 별도 입력을 비활성화한다.
