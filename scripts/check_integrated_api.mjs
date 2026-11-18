import fs from "node:fs";
import assert from "node:assert/strict";
import {
  projectFromIntake,
  reconcileProject,
  intakeFromProject,
} from "../src/intake/adapter.js";
import { basicMeasurements } from "../src/annotations/sets.js";
import { captureInspectionView } from "../src/annotations/presets.js";
import {
  ComparisonSession,
  calculatedDifferences,
  partDifferences,
} from "../src/models/compare.js";
import { ModelLibrary } from "../src/models/library.js";
import { planLibraryMerge } from "../src/models/merge.js";
const base = process.argv[2] || "http://127.0.0.1:8765";
let calls = 0;
async function compute(project, revision) {
  calls++;
  const requestToken = "integrated-" + calls,
    r = await fetch(base + "/api/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, revision, requestToken }),
    }),
    data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  assert.equal(data.requestToken, requestToken);
  return data;
}
const input = JSON.parse(
  fs.readFileSync("examples/intake/virtual-complete.json"),
);
let a = projectFromIntake(input, "welded");
const model = await compute(a, 1);
assert.ok(model.parts.some((p) => p.id === "positive.leadFilm"));
assert.ok(!model.parts.some((p) => p.id === "positive.tape.yellow"));
a.measurements = [];
a.measurements = basicMeasurements(a, model).added;
assert.ok(
  a.measurements.some((m) => m.a.featureId === "positive.leadFilm.widthMinus"),
);
a.inspectionViews = [
  captureInspectionView(a, model, {
    name: "가상 S3 검사",
    camera: {
      position: [0, 0, 400],
      target: [0, 0, 0],
      up: [0, 1, 0],
      zoom: 1,
    },
  }),
];
a = reconcileProject(a);
const b = structuredClone(a);
b.product.positive.leadFilm.length -= 1;
const currentBefore = JSON.stringify(a),
  session = new ComparisonSession(compute),
  result = await session.run(a, b, ["welded", "welded"]);
const rows = calculatedDifferences(result.projects, result.models);
const film = rows.find(
  (r) => r.items[0]?.parameterId === "positive.leadFilm.length",
);
assert.equal(film.delta, -1);
assert.ok(
  rows
    .filter(
      (r) =>
        r.items[0]?.parameterId?.startsWith("negative.") && r.delta !== null,
    )
    .every((r) => Math.abs(r.delta) < 1e-8),
);
const count = calls;
await session.run(a, b, ["welded", "welded"]);
assert.equal(calls, count);
assert.equal(JSON.stringify(a), currentBefore);
const stages = await session.run(a, a, ["preweld", "welded"]);
assert.deepEqual(
  partDifferences(stages.models).find((p) => p.id === "positive.lead").states,
  ["해당 공정에 없음", "존재"],
);
const leadMoved = structuredClone(a);
leadMoved.product.positive.lead.offsetY += 0.5;
const leadComparison = await session.run(a, leadMoved, ["welded", "welded"]);
const poleChanges = partDifferences(leadComparison.models);
assert.equal(
  poleChanges.find((p) => p.id === "positive.lead").delta.min[1],
  0.5,
);
assert.ok(
  poleChanges
    .filter((p) => p.id.startsWith("negative."))
    .every((p) => !p.changed),
);
const datumMoved = structuredClone(a);
datumMoved.datumSet.origin[1] += 10;
const beforeDatumCalls = calls;
const datumComparison = await session.run(a, datumMoved, ["welded", "welded"]);
assert.equal(calls, beforeDatumCalls);
assert.equal(
  datumComparison.models[0].geometryId,
  datumComparison.models[1].geometryId,
);
const datumRows = calculatedDifferences(
  datumComparison.projects,
  datumComparison.models,
);
assert.ok(
  datumRows.some(
    (r) =>
      r.items[0]?.mode === "signed_coordinate" &&
      r.items[0]?.axis === "y" &&
      r.delta === null &&
      r.reason.includes("기준"),
  ),
);
assert.ok(
  calculatedDifferences(datumComparison.projects, datumComparison.models, {
    common: true,
  }).every((r) => r.delta === null || Math.abs(r.delta) < 1e-8),
);
const restored = projectFromIntake(
    JSON.parse(JSON.stringify(intakeFromProject(a))),
    "welded",
  ),
  restoredModel = await compute(restored, 8);
assert.equal(restoredModel.geometryId, model.geometryId);
assert.deepEqual(restored.inspectionViews, a.inspectionViews);
const library = new ModelLibrary();
library.commit(restored);
const item = restored.measurements.find(
  (m) => m.mode === "signed_coordinate" && m.axis === "y",
);
assert.ok(item);
const sample = {
  sampleId: "virtual-A",
  modelId: restored.modelIdentity.modelId,
  modelRevision: restored.modelIdentity.revision,
  itemId: item.id,
  value: -1,
};
library.addSample(sample, restored);
const moved = structuredClone(restored);
moved.datumSet.origin[1] = 10;
assert.throws(
  () => library.addSample({ ...sample, sampleId: "virtual-B" }, moved),
  /새 개정/,
);
const backup = JSON.parse(JSON.stringify(library.snapshot())),
  plan = planLibraryMerge(library, backup);
assert.equal(plan.summary.addedRevisions, 0);
assert.equal(plan.summary.duplicateSamples, 1);
assert.deepEqual(
  plan.candidate.data.models[0].revisions[0].project.inspectionViews,
  restored.inspectionViews,
);
fs.mkdirSync("docs/validation-integrated", { recursive: true });
fs.writeFileSync(
  "docs/validation-integrated/api-results.json",
  JSON.stringify(
    {
      virtualOnly: true,
      apiCalls: calls,
      checks: [
        "S3 sealant without tape",
        "actual positive sealant length delta -1 mm",
        "opposite pole delta zero",
        "product/stage cache",
        "S2/S3 absent lead",
        "positive lead Y movement +0.5 mm, all negative parts unchanged",
        "datum-only compare reuses geometry, rejects direct delta, common frame delta zero",
        "JSON intake to actual CAD restore",
        "inspection preset roundtrip",
        "changed datum sample rejected",
        "nonempty library duplicate merge",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: integrated actual CAD / inspection definitions / views / revision-safe samples / nonempty backup merge",
);
