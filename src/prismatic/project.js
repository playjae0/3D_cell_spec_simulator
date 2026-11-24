import example from "../../examples/prismatic.json" with { type: "json" };
import dimensions from "./dimensions.json" with { type: "json" };

export { dimensions };
export const stages = {
  "prism-stack": "스택 준비",
  "prism-join": "탭–캡 집전체 접합",
  "prism-insulate": "5면 절연",
  "prism-insert": "캔 삽입·캡 안착",
  "prism-weld": "캔–캡 둘레 용접",
};
export const components = {
  stack: ["적층 스택", "prism-stack"],
  tab: ["탭 접촉대", "prism-stack"],
  cap: ["캡 몸체", "prism-join"],
  collector: ["집전체 접촉면", "prism-join"],
  insulation: ["5면 절연층", "prism-insulate"],
  can: ["중공 캔", "prism-insert"],
};

export function initial(changes = {}) {
  const project = structuredClone(example);
  Object.assign(project.product.values, changes);
  return project;
}

export const recordedExamples = {
  standard: () => initial(),
  approach: () => initial({ A01: 95 }),
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
  const keys = Object.keys(example.product.values);
  if (
    !values ||
    Object.keys(values).length !== keys.length ||
    keys.some((key) => !Number.isFinite(values[key]))
  )
    throw Error("독립 입력 25개의 mm 값이 필요합니다.");
  return project;
}
