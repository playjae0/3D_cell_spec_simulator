# 부품·공정 데이텀 연결 검토

기준: `dc6ef1e` → 이번 변경. 단위 mm, 각도 deg. 모델 외형을 경계상자 중심에 재조립하는 코드는 추가하지 않았다. `Viewer.fit`과 썸네일의 경계상자는 카메라 프레이밍에만 사용한다. 모델 좌표와 메시에는 적용하지 않는다.

## 조사 대상과 판정

공개 모델 4종: `demo`, `pouch-process`, `process-tooling-r4`, `pouch-phase1`. 공정 계약 20개: S0 stacked, S1 gathered, S2 preweld, S3 welded, S4 assembly, 구 S5 packaged/S6 finished, P0 pouch_formed/P1 loaded/P2 sealed/P3 trimmed/P4 folded, R0 film_formed/R1 assembly_loaded_open/R2 package_closed/R3 tab_sealed/R4 gas_sealed/R5 final_sealed/R6 package_trimmed/R7 package_folded. R4 모델의 주 제품 공정도는 S0–S4+R0–R7 13개다. 호환 단계는 삭제하지 않는다.

부품 목록: stack; 각 극의 tab, preweldLead/lead, prewelds[], joints[], tapes[], leadFilm; 상하 pouch pocket/flange/bridge 및 구 terrace/seal/margin; seal 위치별 제품 관리 영역; 초음파 2극×2공정×2공구; 극별 laser.spots[]; 실링 4위치×상하 공구. 신규 `tool.*.teeth`는 원래 공칭 접촉 영역과 별도 ID이다.

**판정 구분:** 실행 = CAD 회귀/이번 UI·API 시험 근거, 코드 = 계약 경로를 읽고 추적했지만 모든 조합의 변경 시험은 하지 않음, 미확정 = 사내 실물 기준 필요. 시험 증거는 `evidence/`, 기존 회귀는 `tests/*geometry*.py`에 있다.

| 모델·공정·극 | 부품·치수 | 원래 입력 경로 | 부모 기준 → 자식 결합 기준 | 면·점·축·방향·단위 | 변환 | 변경 시 고정 / 이동 | 연결 측정 개소 | 코드·시험 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 전체 / 모든 단계 / 공통 | 적층체 L/W/T | `stack.length,width,thickness,cornerR` | 셀 C/B/A → 중심 | C:X=0,B:Y=0,A:Z=0; mm | 중심 유지, ±L/2 등 | 원점 고정 / 끝면·뿌리·후속 조립 이동 | `stack.length/width/thickness.plus/minus` | model.build, test_geometry | 실행 |
| 전체 S0 / 양·음 | 탭 원재료 | `side.tab.foilWidth,rootLength,rootSpread,rootY,rootZ` | 적층 끝면 → 탭 뿌리 | 극 `end`가 ±X 바깥 방향; Y/Z 공통 | `place`: −극 X 반사, Y/Z 보존 | 끝면 고정 / 원재료 끝·포락 단면 | tab.root,stockEnd,rootWidthMinus/Plus | process.resolve_pole, model.build_raw_pole, process_geometry | 실행 |
| 전체 S1 이후 / 양·음 | 집속 경로·길이 | `tab.gatherDistance,gatherY,gatherZ,axialShortening` | 탭 뿌리 → 집속 단면 | X 길이/ Y,Z 중심; mm | smoothstep 보간 포락; 길이=rootLength−distance−shortening | 뿌리 고정 / 집속·겹침·리드·테이프·실런트 | tab.gather,tipCenter,top,bottom,edgeR | model.build_pole, process_geometry | 실행; 물리 변형 미예측 |
| R4 S2 이후 / 양·음 | 집속 잔류 두께 | `processTooling.poles.side.gathering.topDatumZ,bottomZ,depth` | 고정 상·하면 → 침입 후 상면 | top=topDatumZ−depth; 하단 고정 | resolved가 tab.thickness,gatherZ 계산 | root/bottom 고정 / top·리드·공구 접촉면·테이프·실런트 후공정까지 이동 | r4.side.residual; toolingResults.poles | process_tooling.resolved/welding, tooling_geometry | 기존 실행; 새 슬로프 연동 추가 안 함 |
| 전체 S2 / 양·음 | 가용접 리드 옵션 | `preweldLead.*` | 집속 단면 → 별도 임시 리드 | tab.gather + start; 위/아래 접촉 | resolve_pole에서 S2 한정 대체 | 메인 lead 입력 유지 / S2 임시 리드만 | lead.start/end,overlap* | process.resolve_pole; process_geometry | 실행; 단품 기본은 메인 리드 |
| 전체 S3 이후 / 양·음 | 리드 결합 | `lead.start,offsetY,contactSide,length,width,thickness` | 집속 시작·상/하면 → 리드 시작/접촉면 | X=e(L/2+g+start),Y=gatherY+offsetY; Z=접촉면±t/2 | X 반사만; 접촉면에서 두께 생성 | 시작/접촉면 고정 / 길이 끝·폭 외곽·반대 두께면 이동 | lead.start/end,widthMinus/Plus,top/bottom,overlap* | model.build_pole; component_geometry | 실행; 위/아래 실물 관계 미확정 |
| 전체 S3 이후 / 양·음 | 실런트 결합 단품 | `leadFilm.start,length,overhang,thickness,enabled` | 기존 집속 기준 start → 리드 시작 대비 차이 계산 | 상대 시작=`film.start−lead.start`; 폭=lead.width+2overhang | 기존 절대 키 유지; lead.start UI 변경 시 두 start에 같은 Δ | 상대 위치 고정 / 리드·실런트 같이 이동 | leadFilm.start/end,widthMinus/Plus,inner/outerFace | bindings.writeField; model.build_pole; component.test + component_geometry | 수정·실행; 사내 길이 기준 확인 |
| 구 schema/입력 미정 S3 | 실런트 부재/미확정 | `leadFilm.enabled` false/null | 출처의 존재 상태 | null을 0 또는 absent로 변환하지 않음 | S3 미확정 생성 제외, S4 이후 거부 | 원본 값 고정 | unavailable reasonCode | process.resolve_pole; integrated_geometry | 실행 |
| 전체 S2 이후 / 양·음 | 가/메인 용접 관리영역 | `prewelds[],joints[].start,offsetY,length,width` | 집속 평탄면 / 실제 탭–리드 교집합 → 영역 | X=집속점+start; Y=gatherY+offsetY; Z=접촉면 | 극 X 반사; 표현용 상면 오프셋은 별도 displayShape | 접촉면 고정 / 영역 외곽 이동; 벗어나면 거부 | joint/preweld.ID.start/end/width*/face | model.build_pole; process_geometry | 실행; 용입·비드 아님 |
| 전체 S4 이후 / 양·음 | 테이프 | `tapes[].host,path,face,start,offsetY,length,width,edgeDrop,thickness` | tab.top/bottom 및 edgeR → 부착 내면 | top/top_edges, 반대면은 gatherZ 기준 반사 | 모서리 R과 탭 표면을 따라 extrude | 부착면 고정 / 테이프 외면·끝·모서리 경로 | tape.ID.innerFace/outerFace/start/end | model.tape_shape/build_pole, test_geometry | 실행; 숨은 전체 감쌈 미확정 |
| R4 S2/S3 / 양·음 × 혼·엔빌 | 공칭 공구 장착 | `tools.stage.kind.x,y,rotation` | 집속 진입점/중심 → 공구 작업면 중심 | U=외향 X, V=Y; 회전 deg | 도구 Rz→x/y→집속→극 X 반사 | 작업면 장착 고정 / 내재 크기만 변경 | contact.kind.center; nominal plans | process_tooling.welding; tooling_geometry | 실행; 제품 설계에서만 배치 편집 |
| R4 S2/S3 / 양·음 × 혼·엔빌 | 치형·피치·높이 | `tools.stage.kind.pitchU,pitchV,direction,height,tooth,length,width,knurl*` | 기존 공칭 접촉면 → **치끝 면** | local Z=0 치끝; 혼 치근 +h, 엔빌 −h | 중심 정수 격자, full-pitch 치근, 전체 치만 유지; 세계 변환은 위와 동일 | tip plane/원점 고정 / pitch=치 위치·수, height=치근 | `.teeth.pitchU/V,height,length,width.a/b` | tool_teeth.generate; component_geometry; check_component_browser | 신규 실행; 바디 미정, 단품만 실제 요철 |
| R4 S3 이후 / 양·음 | 레이저 기존 스팟 | `laser.x,y,rotation,pitchX,pitchY,rows,columns,spots[].dx/dy` | 탭–리드 교집합 → 배열 중심 | 배열 중심 row/column, U/V+회전; 실제 접촉면 Z | 동일 극 place; displayShape는 표면 투영만 | 배열 기준 고정 / 각 원 위치 | laser.ID.center/diameter | process_tooling.welding; tooling_geometry.test_laser* | 기존 실행; 새 배열 UI 후속 |
| 구 S5/S6 / 상·하 | 파우치 외장 | `pouch.opening*,upper/lowerDepth,*FloorR,*RimR,planR` | 셀 A → 각 시트 림 | Z=0 내면; ±depth, film 법선 | 하부 XY 반사 | 림 고정 / 바닥·필름 외면 | pouch.upper/lower.innerFloor/outerFloor/depth/*R | model.build, proof_geometry/test_geometry | 실행; 리드 국부 성형 미지원 |
| 구 S5/S6 / 둘레 | 실링·외곽·접힘 | `pouch.sealGap,sealWidth,trimMargin,foldR,foldAngle` | 개구 끝 → 실링 시작/끝 → 외곽 | 간격·폭·재료 여유 각각 mm | 긴변 공칭 호길이 소비 | 개구/실링 고정 / trim 말단 접힘 | pouch.forming/sealInner/sealOuter/trim | model.folded_margin, test_geometry | 실행; 이중시트/한장 모델과 별도 |
| P0–P4 / 상·하 | 독립 시트 | `pouchProcess.sheets.*`,seamGap | 파우치 원점 → 시트 림 | ±seamGap/2, depth/R/film 별도 | local sheet→상하 반사·평행이동 | 림 고정 / 포켓·외장 끝 | 시트 opening/depth/floorR/rimR | pouch_process.build_process; pouch_geometry | 실행 |
| P1–P4 / 조립체 전체 | 수납 강체 배치 | `pouchProcess.assemblyPose.x,y,z,rx,ry,rz` | 파우치 원점 → 조립체 A/B/C | X→Y→Z 회전 후 이동 | transform_model: shapes/features/normals/patches/paths 동시 | 부품 내재 치수 고정 / 조립체 전체 이동 | assembly.origin, 리드·실런트 간극 | pouch_process.transform_model; test_rigid_3d_transform* | 실행 |
| R0–R7 / 시트·컵 | 열린 두 컵/브리지 | `packaging.cups.*,bridgeInnerR`, `sheets.*` | 브리지 접변 → 컵 림 | 하부 rim Z=−R; 열린 상부도 −R; 닫힌 상부 +R | upper 열린 Y=edge−π(R+t/2)−blank.yPlus; 닫힘 Rx180 | 브리지 결합변 고정 / 컵 깊이·R/간격 | r4.half.depth, pocket.*R/opening, bridge.center | process_tooling.packaging; tooling_geometry | 실행; 컵 위치는 필름 내재 치수 |
| R1–R7 / 수납 | R4에 남은 구 assemblyPose | `pouchProcess.assemblyPose.*` | 셀 A/B/C → R4 고정 수납 | 기본 all 0 | **이전: 무시; 현재: 비영값 명시 거부** | 원본 저장값 보존 / 미적용 형상 유지 | stack/탭/리드/테이프/실런트→실링 겹침 | validate_config; test_r4_nonzero_legacy_placement* | 불일치 대응; 자유 수납 배치 후속 |
| R3–R7 / 탭측·양음·상하 | 접선 실링면 | `sealBars.side_half.tabProfile.centerLength,transitionR,...` | 리드 중심 → U 내부 윤곽; V 외측선 | 중앙 L 수평, 전이 접선 R, 중앙/바깥 폭 구분 | seal_transform: 리드Y+offsetY 중심, V=bar.v, X=end*V | 외측선·폭 고정 / 접점·전이 이동 | tabDimensions.center/radius, profileWidths | tab_seal.tab_face/report_profile; phase1_geometry | 실행; 절단/폴딩 후 잔존 실링 추적 |
| R3–R7 / 레거시 바·가스·최종 | 꼭짓점 실링면 | `sealBars.*.vertices,rotation,u,v,extra,relief` | 공구 UV → 제품 작업면 | 직선/원호 처짐, 국부 홈 | outline→pose→상하 교집합∩남은 필름 | 원래 키·위치 보존 / 해당 바·겹침 영역 | productArea,sections.width,sealantOverlap | process_tooling.packaging, tooling_geometry | 실행; 구 형식 별도 유지 |
| R3 이후 / 모든 바 | 단면 | `sealBars.*.relief.enabled,u,length,depth` | 공칭 작업면 Z=0 → 홈 바닥 | 선택 U에서 +V 절단; normal 양수=제품 반대 | OCC 영역 선 교차 구간 + 해당 홈 깊이 | 선택 절단 위치/공칭면 고정 / 홈 단면 | crossSections central/outside/relief | process_tooling.packaging; component_geometry | 신규 실행; 바디 높이·단면 R 없음 |
| R6–R7 / 필름·실링 | 절단/폴딩 | `sheets.half.cut.x*`, `packaging.cutY,foldLineY,foldR,foldAngle` | 시트 림→재료 절단선→폴딩 접선 | keep-side 재료, neutralFraction=.5 계약 | fold_shape + mapped_point; 실링도 같은 재료 맵 | 컵·고정 재료구간 유지 / 남는 플랜지·실링 이동 | retainedBounds,remainingFlange,foldTip | pouch_material, process_tooling.packaging; phase1_geometry | 실행 |
| 전체 / 검사·저장 | 사용자 주석·스펙 | datumSet,inspectionDatums,measurements,anchors | 의미 feature ID → 검사 데이텀 | 기준점/법선/반경, mm; 설계와 분리 | datumPoint/worldVector; JSON reconcile/parse | 치수값 변경시 동일 ID; 없는 참조는 unavailable | 모든 선택 기준/스펙 | annotations/measure, bindings, project; JS/CAD 회귀 | 실행; 스캔하지 않은 사내 파일은 미검증 |

## 불일치와 후공정 대응

1. **리드 start와 실런트 start의 별도 소유:** 기존 start는 모두 집속 기준. 바깥에서 가져올 때 차이를 계산하고 원래 좌표를 유지한다. 제품 설계 `writeField(lead.start)`만 두 값을 같은 Δ로 옮긴다. 리드 폭은 본래 실런트 폭의 원인이므로 유지했다. 영향은 리드 겹침 → 접합 유효성 검사 → 실런트 위치 → R3 실링 중첩 길이 → R6/R7 잔존 실링이다. 지나친 이동은 용접 겹침 검사가 거부한다. 입력 양식에서 기존 절대 start를 직접 바꾸는 것은 여전히 개별 원본 값 편집이다.
2. **R4에서 구 assemblyPose가 조용히 무시됨:** 수납 위치를 지원한 것처럼 보이는 것이 위험하므로 비영 배치를 명시 거부한다. 실제 이동 구현에는 컵 간섭·브리지·탭측 실링 위치의 결합 기준을 함께 확정해야 한다. 부품을 단독으로 움직인 뒤 실링만 원위치에 남겨두는 임시 변환은 넣지 않았다.
3. **2D 치형 숫자와 평면 CAD 불일치:** `tool.*` 공칭면은 기존 의미를 보존하고 `.teeth`를 새 ID로 추가했다. nominal contactArea와 weld 관리영역은 치높이를 바꿔도 임의로 압흔으로 바꾸지 않는다. 치끝 평면은 기존 제품 접촉면 그대로이며 치근만 이동한다. 후공정 제품에는 공구를 삽입하지 않는다.
4. **메시/표시와 측정면의 구별:** 기존 용접 영역은 상면 투영 displayShape를 갖고 실제 접촉면 feature는 원래 Z에 있다. 새 단품은 실제 치형 CAD와 feature를 사용한다. 프리뷰는 동일한 서버 응답을 무손실 복원한다.

## 남은 경계

원래 계약을 완전히 새 datum/placement 저장 스키마로 이주하지 않았다. 기존 키와 의미를 유지한 소유권 분리와 공구 datum metadata를 추가한 단계다. 모든 사용자 정의 치수 조합, 실물 치형의 치끝 폭/치근 여유, 바디 치수, 실제 lead 접촉면, 테이프 숨은 경로는 확정하지 않았다. 개별 측정 feature의 위치는 기존 회귀가 다루는 범위로 구분했으며 임의 사내 파일은 열거나 수집하지 않았다.
