import { newPouchStages, stageContract } from "./stages.js";
export const pouchFieldDefinitions = [];
const phases = {
  form: newPouchStages,
  load: newPouchStages.filter((s) => stageContract[s].assembly),
  seal: newPouchStages.filter((s) => stageContract[s].seal),
  cut: newPouchStages.filter((s) => stageContract[s].cut),
  fold: ["folded"],
};
function add(path, label, basis, phase, partId, options, extra = {}) {
  const key = path.split(".").at(-1),
    type = options
      ? "string"
      : extra.type === "checkbox"
        ? "boolean"
        : "number";
  pouchFieldDefinitions.push({
    parameterId: "pouchProcess." + path,
    adapterPath: "pouchProcess." + path,
    path: "pouchProcess." + path,
    key,
    label,
    basis,
    reference: basis,
    unit:
      type === "number"
        ? /^(rx|ry|rz|angle)$/.test(key)
          ? "deg"
          : ["version", "order", "neutralFraction"].includes(key)
            ? null
            : "mm"
        : null,
    valueType: type,
    allowedValues: options ? Object.keys(options) : undefined,
    options,
    type: extra.type,
    activeStages: phases[phase],
    partId,
    side: "pouch",
    section: path.startsWith("sheets.")
      ? "sheet " + path.split(".")[1]
      : path.split(".")[0],
    step: /filmThickness/.test(path)
      ? 0.01
      : /^(rx|ry|rz|angle|order)$/.test(key)
        ? 1
        : 0.1,
    upstream: "파우치 조립 원점 / 재료 U,V,N",
    fixed: basis,
    effect: "해당 CAD·실링·절단·재료 주석을 갱신; 반대쪽 독립 입력 유지",
    ...extra,
  });
}
add(
  "type",
  "컵 구성",
  "실제 제품 선택. 현재 상하 독립 이중 컵만 지원",
  "form",
  "pouch.upper.pocket",
  { double_cup: "이중 컵 · 상하 독립" },
);
add(
  "construction",
  "외장 구성",
  "한 장 연결 외장은 미지원",
  "form",
  "pouch.upper.pocket",
  { separate_sheets: "분리된 두 장" },
);
add(
  "sidewall",
  "측벽 모델",
  "내면 개구 입력 → 바닥 치수 계산. 경사 벽 미지원",
  "form",
  "pouch.upper.pocket",
  { vertical: "수직 측벽" },
);
add(
  "seamGap",
  "공칭 상하 내면 간격",
  "Z=0 사이에 ±gap/2. 압착 후 두께/융착 예측 아님",
  "form",
  "pouch.upper.flange",
);
add(
  "neutralFraction",
  "폴딩 기준층 비율",
  "상하 외면 포락의 아래=0, 위=1. 지정 층 전개 길이 보존 가정",
  "fold",
  "pouch.upper.flange",
);
for (const half of ["upper", "lower"]) {
  const pre = "sheets." + half + ".",
    title = half === "upper" ? "상부" : "하부",
    pid = "pouch." + half + ".pocket";
  for (const [key, label, basis] of [
    ["openingLength", "개구 길이 X", "내면 림 경계 −X ↔ +X"],
    ["openingWidth", "개구 폭 Y", "내면 림 경계 −Y ↔ +Y"],
    ["depth", "성형 깊이", "해당 시트 내면 림 → 내면 바닥, Z"],
    ["floorR", "바닥 전이 R", "내면 바닥과 수직 측벽 접선 원호"],
    ["rimR", "림 전이 R", "내면 수직 측벽과 플랜지 접선 원호"],
    ["planR", "개구 평면 코너 R", "내면 개구 XY 원호"],
    ["filmThickness", "필름 공칭 두께", "내면 법선 오프셋, 균일 공칭값"],
  ])
    add(pre + key, title + " " + label, basis, "form", pid);
  for (const group of ["blank", "cut"])
    for (const edge of ["xMinus", "xPlus", "yMinus", "yPlus"])
      add(
        pre + group + "." + edge,
        title +
          " " +
          (group === "blank" ? "원재료 외곽 " : "남길 절단선 ") +
          edge,
        "재료 원점에서 부호 있는 절대 " +
          edge[0].toUpperCase() +
          " 좌표. keep-side는 네 경계 내부",
        group === "blank" ? "form" : "cut",
        "pouch." + half + ".flange",
      );
}
for (const key of ["x", "y", "z", "rx", "ry", "rz"])
  add(
    "assemblyPose." + key,
    "조립체 수납 " + key.toUpperCase(),
    key.length === 1
      ? "파우치 원점 대비 강체 이동 · 부품 고유 치수 보존"
      : "조립체 원점 중심 X→Y→Z 순서 강체 회전, 도",
    "load",
    "stack",
  );
for (const half of ["upper", "lower"])
  for (const edge of ["xMinus", "xPlus", "yMinus", "yPlus"]) {
    const id = half + "_" + edge,
      pre = "toolFaces." + id + ".",
      pid = "seal." + id,
      title = (half === "upper" ? "상부 " : "하부 ") + edge;
    add(
      pre + "enabled",
      title + " 작업면 사용",
      "작업면과 공칭 제품 실링 영역 존재",
      "seal",
      pid,
      null,
      { type: "checkbox" },
    );
    for (const [key, label, basis] of [
      ["start", "실링 시작", "해당 시트 개구 경계 → 작업면 내측, 바깥 V 방향"],
      [
        "width",
        "작업면 폭",
        "작업면 내측→외측, 재료 V 방향. 접힌 현 길이와 구분",
      ],
      ["length", "작업면 길이", "변을 따라 U 방향"],
      ["offset", "작업면 U 위치", "재료 원점 기준 U 중심"],
      ["cornerR", "작업면 코너 R", "평면 윤곽 반경. 절단 노치 아님"],
      ["reliefLength", "홈 길이 U", "사용 시 작업면에서 제외할 내부 구간"],
      ["reliefWidth", "홈 폭 V", "사용 시 작업면에서 제외, 제품 절단 아님"],
      ["reliefOffset", "홈 U 중심", "작업면 U 중심 대비"],
    ])
      add(pre + key, title + " " + label, basis, "seal", pid);
    add(
      pre + "reliefEnabled",
      title + " 작업면 홈 사용",
      "명시적으로 켠 경우에만 작업면 영역 제외. 기본 꺼짐",
      "seal",
      pid,
      null,
      { type: "checkbox" },
    );
  }
for (const edge of ["yMinus", "yPlus"])
  for (const i of [1, 2]) {
    const id = edge + i,
      pre = "folds." + id + ".",
      pid = "pouch.upper.flange";
    add(
      pre + "enabled",
      id + " 접힘 사용",
      "양쪽 외장에 같은 재료 매핑. 교차/단변 접힘 미지원",
      "fold",
      pid,
      null,
      { type: "checkbox" },
    );
    for (const [key, label, basis] of [
      ["order", "순서", "각 변 안쪽→바깥쪽. ID와 별개; 역순/겹침은 거부"],
      [
        "line",
        "접힘 시작선",
        "재료 원점에서 해당 Y 변 바깥 방향 거리. 호의 시작 접선",
      ],
      [
        "angle",
        "각도 °",
        "양수 +Z, 음수 −Z, −180..180°. 실제 스프링백 예측 아님",
      ],
      ["innerR", "내측 R", "전체 명목 재료 포락 내측 반경. 기준층 반경은 계산"],
    ])
      add(pre + key, id + " " + label, basis, "fold", pid);
  }
for (const f of pouchFieldDefinitions)
  for (const k of Object.keys(f)) if (f[k] === undefined) delete f[k];
export function emptyPouchProcess() {
  const q = {
    version: 1,
    sheets: {},
    toolFaces: {},
    folds: {},
    assemblyPose: {},
  };
  for (const f of pouchFieldDefinitions) {
    const keys = f.path.split(".").slice(1),
      last = keys.pop();
    let obj = q;
    for (const k of keys) obj = obj[k] ??= {};
    obj[last] = null;
  }
  for (const [id, f] of Object.entries(q.toolFaces)) {
    [f.half, f.edge] = id.split("_");
  }
  for (const [id, f] of Object.entries(q.folds))
    f.edge = id.replace(/[12]$/, "");
  return q;
}
export function pouchFields(product, stage) {
  if (!product.pouchProcess || !stageContract[stage]?.pouch) return [];
  return pouchFieldDefinitions.map((f) => ({
    ...f,
    value: f.path.split(".").reduce((o, k) => o?.[k], product),
    available: f.activeStages.includes(stage),
  }));
}
export function pouchReferences(b, stage) {
  if (
    b.valueType !== "number" ||
    [
      "rx",
      "ry",
      "rz",
      "angle",
      "order",
      "neutralFraction",
      "reliefLength",
      "reliefWidth",
      "reliefOffset",
      "cornerR",
    ].includes(b.key)
  )
    return null;
  const stem = "pouch.input." + b.path.slice("pouchProcess.".length);
  const radius = ["floorR", "rimR", "planR", "innerR"].includes(b.key);
  return {
    a: { featureId: stem + ".a" },
    b: { featureId: radius ? stem + ".a" : stem + ".b" },
    mode: radius ? "radius" : "distance",
  };
}
