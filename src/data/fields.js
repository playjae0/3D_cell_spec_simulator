// Independent geometry inputs only. Derived dimensions live in the feature registry.
const f = (key, label, basis, step = 0.1) => ({ key, label, basis, step });
export const dictionaries = {
  stack: [
    f("length", "조립체 길이 X", "C / X=0 중심, 리드·탭 제외"),
    f("width", "조립체 폭 Y", "B / Y=0 중심"),
    f("thickness", "조립체 두께 Z", "A / Z=0 중심"),
    f("cornerR", "평면 코너 R", "조립체 XY 외곽"),
  ],
  tab: [
    f(
      "foilWidth",
      "포일 폭 · 뿌리부터 일정",
      "S0 입력 · 뿌리와 집속 구간의 Y 폭이 동일",
    ),
    f(
      "rootLength",
      "집속 전 돌출 길이",
      "S0 조립체 끝 고정 → 바깥 방향. 후속 집속 길이에 전달",
    ),
    f(
      "rootSpread",
      "뿌리 두께 분포",
      "포일 분포 포락 높이 · 개별 박 두께 아님",
    ),
    f("rootY", "뿌리 Y 중심", "B 기준"),
    f("rootZ", "뿌리 Z 중심", "A 기준"),
    f("gatherDistance", "뿌리→집속 거리", "조립체 끝단에서 바깥 X 방향"),
    f("gatherY", "집속 Y 중심", "B 기준 · 반대 극과 독립"),
    f("gatherZ", "집속 Z 오프셋", "A 기준 · 기본 0 = 조립체 중앙"),
    f("thickness", "집속 후 두께", "유한 포락 두께 Z", 0.01),
    f(
      "gatheredLength",
      "집속 후 길이",
      "집속점 고정. 입력 시 투영 수축을 계산하며 S0 돌출은 유지",
    ),
    f("edgeR", "집속 단면 모서리 R", "YZ 단면 · 테이프 감쌈 접촉면", 0.01),
  ],
  lead: [
    f("start", "리드 시작 거리", "집속점 기준 바깥 X"),
    f("length", "리드 전체 길이", "겹침 포함 · 돌출 길이는 계산"),
    f("width", "리드 폭", "Y 방향"),
    f("thickness", "리드 두께", "Z 방향", 0.01),
    f("offsetY", "집속 중심 대비 Y", "리드 중심 = 집속 Y + 오프셋"),
    {
      key: "contactSide",
      label: "탭과 접촉하는 위치",
      basis: "미확정 관계 · 변경 가능한 예시. 리드 Z는 접촉면에서 계산",
      options: { below: "탭 아래 (가정)", above: "탭 위 (가정)" },
    },
  ],
  joints: [
    {
      key: "enabled",
      label: "접합 영역 사용",
      basis: "실제 용접 흔적을 확정하지 않는 관리 영역",
      type: "checkbox",
    },
    f("start", "접합 시작 위치", "집속점 기준 바깥 X"),
    f("length", "접합 영역 길이", "실제 겹침 영역 내부"),
    f("width", "접합 영역 폭", "Y 방향"),
    f("offsetY", "접합 Y 위치", "집속 Y 대비"),
    {
      key: "process",
      label: "용접 공법 기록",
      basis: "형상 변경 없음 · 스펙 메타데이터",
      options: {
        unspecified: "미지정",
        ultrasonic: "초음파",
        laser: "레이저",
        other: "기타",
      },
    },
  ],
  tapes: [
    {
      key: "enabled",
      label: "테이프 사용",
      basis: "사진에서 확인한 노란 테이프",
      type: "checkbox",
    },
    {
      key: "path",
      label: "부착 경로",
      basis: "뒷면 전체 감쌈은 미확정 · 자동 복제 없음",
      options: { top: "집속 상면", top_edges: "상면 + 양쪽 모서리 (가정)" },
    },
    f("start", "부착 시작 위치", "집속점 기준 바깥 X"),
    f("length", "테이프 X 길이", "집속 상면 범위 내"),
    f("width", "상면 피복 폭", "Y 방향 · 모서리 경로에서는 호스트 폭으로 계산"),
    f("offsetY", "상면 Y 위치", "집속 중심 대비 · 모서리 경로에서는 0"),
    f("thickness", "테이프 두께", "부착면 법선 방향", 0.01),
    f(
      "edgeDrop",
      "모서리 아래 부착 길이",
      "모서리 경로 전용 · R 이후 측면 구간",
      0.01,
    ),
  ],
  leadFilm: [
    {
      key: "enabled",
      label: "리드 필름 사용",
      basis: "사진으로 세부 단면 미확정 · 가정",
      type: "checkbox",
    },
    f("start", "필름 시작 위치", "집속점 기준 바깥 X"),
    f("length", "필름 X 길이", "노출 리드 부착 범위"),
    f("overhang", "양쪽 Y 피복 여유", "리드 폭 대비"),
    f("thickness", "필름 공칭 두께", "리드 외면 법선 방향", 0.01),
  ],
  pouch: [
    f("openingLength", "성형 개구 길이 X", "성형 경계 기준 · 조립체와 별도"),
    f("openingWidth", "성형 개구 폭 Y", "성형 경계 기준"),
    f("planR", "평면 코너 R", "성형 개구의 XY 곡선"),
    f(
      "filmThickness",
      "외장 필름 두께",
      "내면의 법선 오프셋 · 균일 공칭값",
      0.01,
    ),
    f("upperDepth", "상부 성형 깊이", "A에서 내면 평탄부까지 +Z"),
    f("upperFloorR", "상부 바닥 연결 R", "내면 바닥–측벽"),
    f("upperRimR", "상부 상단 연결 R", "내면 측벽–외곽 평면"),
    f("lowerDepth", "하부 성형 깊이", "A에서 내면 평탄부까지 −Z"),
    f("lowerFloorR", "하부 바닥 연결 R", "내면 바닥–측벽"),
    f("lowerRimR", "하부 상단 연결 R", "내면 측벽–외곽 평면"),
    f("sealGap", "성형–실링 간격", "성형 끝→실링 시작"),
    f("sealWidth", "실링 관리 폭", "실링 시작→실링 끝 · 압축 단면 미지원"),
    f("trimMargin", "실링 밖 외곽 여유", "실링 끝→절단 끝 · 접기 전 재료 길이"),
    f(
      "foldAngle",
      "긴 변 접힘 각도 °",
      "완성 상태에만 적용 · 양끝 릴리프 있는 예시",
      1,
    ),
    f("foldR", "긴 변 접힘 내측 R", "완성 상태 · 외곽 여유를 호 길이로 소비"),
  ],
};
dictionaries.pouch.push(
  f(
    "packagingExtraYMinus",
    "패키징 −Y 추가 외장 여유",
    "패키징 상태만 · 용도 미확정 · 완성 시 제거 가정",
  ),
  f(
    "packagingExtraYPlus",
    "패키징 +Y 추가 외장 여유",
    "패키징 상태만 · 실제 용도는 사내 확인",
  ),
);
dictionaries.tapes.splice(1, 0, {
  key: "face",
  label: "테이프 부착면",
  basis: "카메라 기준 아님 · 탭 로컬 상/하면. 리드 접촉면과 충돌하면 거부",
  options: { top: "탭 상면", bottom: "탭 하면 (가정)" },
});

dictionaries.prewelds = dictionaries.joints.map((f) => ({
  ...f,
  label: f.label.replace("접합", "가용접"),
  basis: f.basis.replace("실제 겹침 영역 내부", "집속 포일 내부"),
}));
dictionaries.preweldLead = [
  {
    key: "included",
    label: "S2 리드 포함",
    basis: "데모 가정 · 메인 용접 단계 리드와 별도 배치 입력",
    type: "checkbox",
  },
  ...dictionaries.lead,
];
