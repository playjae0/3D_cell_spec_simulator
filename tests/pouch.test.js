import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stageContract, assemblyRank } from "../src/data/stages.js";
import {
  template,
  dictionaryFor,
  requiredField,
} from "../src/intake/contract.js";
import { validateIntake } from "../src/intake/validate.js";
import {
  projectFromIntake,
  intakeFromProject,
  reconcileProject,
} from "../src/intake/adapter.js";
import { validateProject, measurement } from "../src/data/project.js";
import {
  fieldsFor,
  writeField,
  references,
  driversForFeature,
} from "../src/data/bindings.js";
import { evaluate, dimensionLayout } from "../src/annotations/measure.js";
import {
  pointOnPatch,
  locateOnPatch,
  withAnchors,
} from "../src/annotations/anchors.js";
import { materialPoint, rigidPoint } from "../src/geometry/material.js";
import { partDifferences, comparisonSnapshot } from "../src/models/compare.js";
import { basicMeasurements } from "../src/annotations/sets.js";
const intake = () =>
  JSON.parse(fs.readFileSync("examples/intake/virtual-pouch-1.2.json"));
const project = () => projectFromIntake(intake(), "sealed");
test("process graph separates formed pouch from assembly; old IDs keep meaning", () => {
  assert.equal(stageContract.pouch_formed.assembly, null);
  assert.equal(assemblyRank("loaded"), 4);
  assert.equal(stageContract.packaged.legacyPouch, true);
  const i = intake();
  for (const p of i.parameters)
    if (!p.parameterId.startsWith("pouchProcess.")) {
      p.value = null;
      p.status = "missing";
      p.reviewStatus = "pending";
    }
  // Blank pole polarity is unknown, not inferred from screen or pouch stage.
  const r = validateIntake(i, "pouch_formed");
  assert.equal(r.ready, true, JSON.stringify(r.issues));
  assert.equal(validateIntake(i, "loaded").ready, false);
  const p = projectFromIntake(i, "pouch_formed");
  assert.ok(
    fieldsFor(p.product, p.stage).every((f) =>
      f.path.startsWith("pouchProcess."),
    ),
  );
});
test("1.2 roundtrip retains independent pouch inputs; legacy 1.0/1.1 never gets invented pouch dimensions", () => {
  for (const s of ["pouch_formed", "loaded", "sealed", "trimmed", "folded"])
    assert.equal(validateIntake(intake(), s).ready, true);
  const p = project();
  writeField(p.product, "pouchProcess.sheets.upper.depth", 5.1);
  const saved = reconcileProject(p);
  validateProject(saved);
  const restored = projectFromIntake(
    JSON.parse(JSON.stringify(intakeFromProject(saved))),
    "sealed",
  );
  assert.deepEqual(restored.product.pouchProcess, saved.product.pouchProcess);
  assert.notEqual(restored.product.pouchProcess.sheets.lower.depth, 5.1);
  for (const version of ["1.0", "1.1"]) {
    const old = JSON.parse(
      fs.readFileSync("examples/intake/virtual-complete.json"),
    );
    old.formatVersion = version;
    old.dictionaryVersion = "cell-intake-" + version;
    const before = structuredClone(old);
    const result = projectFromIntake(old, "assembly");
    assert.equal(result.product.pouchProcess, undefined);
    assert.deepEqual(old, before);
    assert.throws(() => comparisonSnapshot(result, "loaded"), /누락|미확인/);
  }
  const blank = template({}, ["pouch_formed"]);
  assert.ok(blank.parameters.every((p) => p.value === null));
});
test("new inputs expose stable feature drivers and process-specific requirements", () => {
  const p = project();
  const f = fieldsFor(p.product, "sealed").find(
    (f) => f.path === "pouchProcess.sheets.upper.depth",
  );
  const r = references(f, p.product, p.stage);
  assert.equal(r.a.featureId, "pouch.input.sheets.upper.depth.a");
  assert.deepEqual(driversForFeature(r.a.featureId, p.product, p.stage), [
    f.path,
  ]);
  assert.deepEqual(
    driversForFeature("pouch.result.clearance.yPlus.a", p.product, p.stage),
    [],
  );
  const d = dictionaryFor(p.intake.componentInstances).find(
    (f) => f.parameterId === "pouchProcess.toolFaces.upper_xMinus.width",
  );
  assert.equal(requiredField(d, p.intake, "pouch_formed"), false);
  assert.equal(requiredField(d, p.intake, "sealed"), true);
});
test("curved material patch anchors follow bend, invert accurately, and break after cut", () => {
  const R = 2,
    s0 = 10,
    end = 20,
    theta = Math.PI / 2;
  const profiles = {
    yPlus: {
      neutral: 0,
      limit: end,
      pieces: [
        [0, s0, [0, 0], 0, 0, null],
        [s0, s0 + R * theta, [s0, 0], 0, 1 / R, "bend"],
        [s0 + R * theta, end, [s0 + R, R], theta, 0, null],
      ],
    },
  };
  const material = {
    origin: [0, 12, 0.1],
    bounds: { xMinus: -5, xPlus: 5, yMinus: -20, yPlus: 20 },
    profiles,
  };
  const host = {
    partId: "pouch.upper.flange",
    point: [0, 12, 0.1],
    patch: { u: [5, 0, 0], v: [0, 3, 0], material },
  };
  const point = pointOnPatch(host, 0.2, 0);
  assert.ok(point[2] > 0.5);
  assert.ok(Math.abs(Math.hypot(point[1] - 10, point[2] - 2) - 1.9) < 1e-7);
  const uv = locateOnPatch(host, point);
  assert.ok(Math.abs(uv.u - 0.2) < 1e-6);
  assert.ok(Math.abs(uv.v) < 1e-6);
  const a = {
    id: "anchor.material",
    name: "재료 고정점",
    baseFeatureId: "material.face",
    mode: "relative",
    u: 0.2,
    v: 0,
  };
  const data = { features: { "material.face": host }, diagnostics: [] };
  assert.deepEqual(withAnchors(data, [a]).features[a.id].point, point);
  host.patch.material.bounds.yPlus = 11;
  const broken = withAnchors(data, [a]).features[a.id];
  assert.equal(broken.available, false);
});
test("thickness follows paired physical normals through arbitrary rigid placement", () => {
  const pose = { x: 1, y: 2, z: 3, rx: 19, ry: 27, rz: 31 };
  const normal = rigidPoint([0, 0, 1], pose, false);
  const features = {
    a: {
      partId: "s",
      kind: "face",
      point: rigidPoint([0, 0, -1], pose),
      normal: normal.map((v) => -v),
    },
    b: {
      partId: "s",
      kind: "face",
      point: rigidPoint([0, 0, 1], pose),
      normal,
    },
  };
  const m = measurement("두께", "a", "b", "thickness", "loaded");
  assert.ok(Math.abs(evaluate(m, features).value - 2) < 1e-8);
  const line = dimensionLayout(m, features, {
    origin: [0, 0, 0],
    rotationZ: 0,
  });
  assert.ok(
    Math.abs(Math.hypot(...line.d.map((v, i) => v - line.c[i])) - 2) < 1e-8,
  );
  features.b.point[0] += 1;
  assert.equal(evaluate(m, features).valid, false);
});
test("A/B detects a local surface change even if bounds and volume match", () => {
  const p = {
    id: "p",
    name: "p",
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    volume: 1,
    meta: { surfaceSignature: "before" },
  };
  const models = [
    { parts: [p], features: {} },
    { parts: [{ ...p, meta: { surfaceSignature: "after" } }], features: {} },
  ];
  const diff = partDifferences(models)[0];
  assert.equal(diff.changed, true);
  assert.equal(diff.surfaceChanged, true);
  assert.equal(diff.delta.volume, 0);
});
