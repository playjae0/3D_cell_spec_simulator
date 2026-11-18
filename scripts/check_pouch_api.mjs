import fs from "node:fs";
import assert from "node:assert/strict";
import {
  projectFromIntake,
  reconcileProject,
  intakeFromProject,
} from "../src/intake/adapter.js";
import { basicMeasurements } from "../src/annotations/sets.js";
import { captureInspectionView } from "../src/annotations/presets.js";
import { ModelLibrary } from "../src/models/library.js";
import { planLibraryMerge } from "../src/models/merge.js";
import { partDifferences } from "../src/models/compare.js";

const base = process.argv[2] || "http://127.0.0.1:8765";
const input = JSON.parse(
  fs.readFileSync("examples/intake/virtual-pouch-1.2.json"),
);
let calls = 0;
async function compute(project, valid = true) {
  const requestToken = "pouch-" + ++calls;
  const response = await fetch(base + "/api/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, revision: calls, requestToken }),
  });
  const result = await response.json();
  if (!valid) {
    assert.equal(response.status, 422);
    return result;
  }
  assert.ok(response.ok, JSON.stringify(result));
  assert.equal(result.requestToken, requestToken);
  assert.equal(result.revision, calls);
  return result;
}
const models = {},
  summary = [];
for (const stage of ["pouch_formed", "loaded", "sealed", "trimmed", "folded"]) {
  const project = projectFromIntake(input, stage);
  models[stage] = await compute(project);
  summary.push({
    stage,
    geometryId: models[stage].geometryId,
    parts: models[stage].parts.length,
    metrics: models[stage].processMetrics.length,
    interference: models[stage].diagnostics.filter(
      (d) => d.code === "interference",
    ),
  });
  console.log("PASS", stage);
}
let project = projectFromIntake(input, "folded");
project.measurements = basicMeasurements(project, models.folded).added;
assert.ok(project.measurements.length > 100);
assert.equal(basicMeasurements(project, models.folded).added.length, 0);
project.inspectionViews = [
  captureInspectionView(project, models.folded, {
    name: "가상 폴딩 검토",
    camera: {
      position: [0, -400, 0],
      target: [0, 0, 0],
      up: [0, 0, 1],
      zoom: 1,
    },
  }),
];
project = reconcileProject(project);
const restored = projectFromIntake(
  JSON.parse(JSON.stringify(intakeFromProject(project))),
  "folded",
);
assert.deepEqual(restored.product.pouchProcess, project.product.pouchProcess);
const normalizedMeasurement = (m) => ({
  ...m,
  axis: m.axis ?? null,
  conditions: m.conditions || "",
  parameterId: m.parameterId ?? null,
});
assert.deepEqual(
  restored.measurements.map(normalizedMeasurement),
  project.measurements.map(normalizedMeasurement),
);
assert.deepEqual(restored.inspectionViews, project.inspectionViews);
assert.equal((await compute(restored)).geometryId, models.folded.geometryId);
const library = new ModelLibrary();
library.commit(restored);
const sample = {
  sampleId: "virtual-pouch",
  modelId: restored.modelIdentity.modelId,
  modelRevision: restored.modelIdentity.revision,
  itemId: restored.measurements[0].id,
  value: 1,
};
library.addSample(sample, restored);
const changed = structuredClone(restored);
changed.product.pouchProcess.sheets.upper.depth += 0.5;
assert.throws(
  () => library.addSample({ ...sample, sampleId: "changed" }, changed),
  /새 개정/,
);
const plan = planLibraryMerge(
  library,
  JSON.parse(JSON.stringify(library.snapshot())),
);
assert.equal(plan.summary.addedRevisions, 0);
assert.equal(plan.summary.duplicateSamples, 1);
assert.deepEqual(
  plan.candidate.data.models[0].revisions[0].project.inspectionViews,
  restored.inspectionViews,
);
const changedModel = await compute(changed);
const differences = partDifferences([models.folded, changedModel]);
assert.ok(
  differences.find((d) => d.id === "pouch.upper.pocket").surfaceChanged,
);
assert.ok(
  differences
    .filter(
      (d) => d.id.startsWith("negative.") || d.id.startsWith("pouch.lower."),
    )
    .every((d) => !d.changed),
);
const invalid = structuredClone(restored);
invalid.product.pouchProcess.sheets.upper.depth = 0.1;
assert.ok(
  (await compute(invalid, false)).errors.some((e) => e.includes("깊이")),
);
assert.equal((await compute(restored)).geometryId, models.folded.geometryId);
fs.mkdirSync("docs/validation-pouch-v1.5", { recursive: true });
fs.writeFileSync(
  "docs/validation-pouch-v1.5/api-results.json",
  JSON.stringify(
    {
      virtualOnly: true,
      calls,
      summary,
      checks: [
        "5 process stages through actual CAD API, revision/token echoed",
        "basic measurement set idempotent",
        "intake 1.2 JSON and CAD roundtrip",
        "inspection views and model library roundtrip",
        "changed pouch design rejects old revision sample",
        "nonempty duplicate backup merge preserves views and observations",
        "upper depth A/B changes upper local surface, lower and negative unchanged",
        "invalid depth returns 422; valid geometry stays recoverable",
      ],
      measurementCount: project.measurements.length,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: pouch CAD / intake / inspection / revision / backup / failure recovery",
);
