import fs from "node:fs";
import { template, conditionsDocument } from "../src/intake/contract.js";
import { initial } from "../src/data/project.js";
import { intakeFromProject, projectFromIntake } from "../src/intake/adapter.js";
const output = (name, value) =>
  fs.writeFileSync(name, JSON.stringify(value, null, 2) + "\n");
output("examples/intake/template-1.0.json", template());
output("docs/intake/required-fields.json", conditionsDocument());
const fixture = intakeFromProject(initial(), {
  modelId: "virtual-validation-001",
  modelName: "가상 검증 셀 · 실제 제품값 아님",
  revision: "1",
});
fixture.demo = true;
fixture.sources[0].documentName = "가상 검증 입력 · 실제 제조 문서가 아님";
fixture.requestedStages = [
  "assembly",
  "stacked",
  "gathered",
  "preweld",
  "welded",
  "packaged",
  "finished",
];
fixture.inspectionDatums = [
  {
    id: "fixture-frame",
    name: "가상 검사 지그",
    origin: [0, 2, 0],
    rotationZ: 0,
    visible: true,
  },
];
fixture.inspectionItems = [
  {
    itemId: "root-y",
    name: "양극 뿌리 Y 부호 위치",
    stage: "stacked",
    definition: {
      mode: "signed_coordinate",
      axis: "y",
      datumId: "legacy",
      a: "positive.tab.root",
      b: null,
      parameterId: "positive.tab.rootY",
    },
    target: -1,
    minus: 0.2,
    plus: 0.2,
    unit: "mm",
    sourceRefs: [{ sourceId: "legacy-project", locator: "가상 검사 항목 1" }],
  },
];
const thickness = fixture.parameters.find(
  (p) => p.parameterId === "positive.lead.thickness",
);
thickness.value = 350;
thickness.unit = "µm";
thickness.originalValue = 350;
thickness.originalUnit = "µm";
thickness.originalText = "가상 리드 공칭 두께 350 µm";
output("examples/intake/virtual-complete.json", fixture);
const partial = structuredClone(fixture);
partial.model.modelId = "virtual-s0-only";
partial.requestedStages = ["stacked"];
const wanted = new Set(
  conditionsDocument()
    .filter((f) => f.activeStages.includes("stacked"))
    .map((f) => f.parameterId),
);
for (const p of partial.parameters)
  if (!wanted.has(p.parameterId)) {
    p.value = null;
    p.status = "missing";
    p.reviewStatus = "pending";
    p.conversion = null;
  }
for (const c of partial.componentInstances) {
  c.existenceStatus = "unknown";
  c.sourceRefs = [];
}
output("examples/intake/virtual-s0-missing-future.json", partial);
output(
  "examples/intake/virtual-s0-project.json",
  projectFromIntake(partial, "stacked"),
);
