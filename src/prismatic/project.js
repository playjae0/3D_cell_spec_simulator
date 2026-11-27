import example from "../../examples/prismatic.json" with { type: "json" };
import patentExample from "../../examples/prismatic-patent.json" with { type: "json" };
import hardware from "./hardware.json" with { type: "json" };
import baseDimensions from "./dimensions.json" with { type: "json" };

export const dimensions = [...baseDimensions, ...hardware];
const defaults = Object.fromEntries(hardware.map((d) => [d.id, d.default]));
export const capIds = [
  "cap",
  "terminal-a",
  "terminal-b",
  "cap-outline",
  "collector",
  "cap-insulator",
];
const foilIds = ["foil-root", "foil-gather", "tab"];
export const stages = {
  "prism-stack": "스택 준비",
  "prism-join": "탭–캡 집전체 접합",
  "prism-insulate": "5면 절연",
  "prism-insert": "캔 삽입·캡 안착",
  "prism-weld": "캔–캡 둘레 용접",
};
export const components = {
  stack: ["적층 스택", "prism-stack", ["stack", ...foilIds]],
  tab: ["포일 탭 다발", "prism-stack", foilIds],
  cap: ["캡 조립체", "prism-join", capIds],
  "terminal-a": ["터미널 A", "prism-join"],
  "terminal-b": ["터미널 B", "prism-join"],
  collector: ["하부 집전체", "prism-join"],
  insulation: ["5면 절연층", "prism-insulate"],
  can: ["중공 캔", "prism-insert"],
};

export function componentParts(parts, id) {
  return parts.filter((p) => (components[id][2] ?? [id]).includes(p.id));
}

export function initial(changes = {}) {
  const project = structuredClone(example);
  Object.assign(project.product.values, defaults, changes);
  return project;
}

export const recordedExamples = {
  standard: () => initial(),
  patent: () => validate(structuredClone(patentExample)),
  approach: () => initial({ A01: 95 }),
  halfway: () => initial({ A01: 45 }),
  interference: () => initial({ S02: 32 }),
};

export function validate(project) {
  if (
    project?.productType !== "prismatic" ||
    project.schemaVersion !== 4 ||
    project.unit !== "mm" ||
    project.modelVersion !== example.modelVersion ||
    !Object.hasOwn(stages, project.stage) ||
    !project.modelIdentity?.modelId ||
    !project.modelIdentity?.revision ||
    typeof project.product?.name !== "string" ||
    !project.product.id
  )
    throw Error("각형 셀 형식·단위·모델 개정을 확인하세요.");
  const values = project.product.values;
  if (values && !hardware.some((d) => Object.hasOwn(values, d.id)))
    Object.assign(values, defaults);
  const keys = [
    ...Object.keys(example.product.values),
    ...Object.keys(defaults),
  ];
  if (
    !values ||
    Object.keys(values).length !== keys.length ||
    keys.some((key) => !Number.isFinite(values[key]))
  )
    throw Error("독립 입력 36개의 mm 값이 필요합니다.");
  return project;
}
