import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  measurement,
  parseProject,
  validateProject,
  History,
} from "../src/data/project.js";
import {
  evaluate,
  dimensionLayout,
  inspection,
} from "../src/annotations/measure.js";
import { clipMesh } from "../src/viewer/clip.js";
import {
  pointOnPatch,
  locateOnPatch,
  withAnchors,
} from "../src/annotations/anchors.js";
const datum = { origin: [0, 0, 0], rotationZ: 0 };
const features = {
  a: { point: [0, 0, 0], partId: "part", kind: "point" },
  b: { point: [3, 4, 0], partId: "part", kind: "point" },
  top: { point: [0, 0, 4], partId: "part", kind: "face", normal: [0, 0, 1] },
  bottom: {
    point: [0, 0, -3],
    partId: "part",
    kind: "face",
    normal: [0, 0, -1],
  },
  radius: {
    point: [0, 2, 0],
    center: [0, 0, 0],
    value: 2,
    partId: "part",
    kind: "radius",
  },
};
test("Euclidean versus datum-axis projection", () => {
  const m = measurement("test", "a", "b", "distance", "assembly");
  assert.equal(evaluate(m, features, datum).value, 5);
  m.mode = "x";
  assert.equal(evaluate(m, features, datum).value, 3);
  assert.ok(
    Math.abs(
      evaluate(m, features, { origin: [10, 20, 0], rotationZ: 90 }).value - 4,
    ) < 1e-9,
  );
});
test("Z thickness requires opposite corresponding faces; cannot relabel arbitrary distance", () => {
  const m = measurement("T", "bottom", "top", "thickness", "assembly");
  assert.equal(evaluate(m, features, datum).value, 7);
  m.a.featureId = "a";
  assert.equal(evaluate(m, features, datum).valid, false);
  m.a.featureId = "top";
  assert.equal(evaluate(m, features, datum).valid, false);
});
test("Radius line starts at arc center and terminates on arc", () => {
  const m = measurement("R", "radius", null, "radius", "assembly");
  const layout = dimensionLayout(m, features, datum);
  assert.equal(layout.value, 2);
  assert.deepEqual(layout.c, [0, 0, 0]);
  assert.deepEqual(layout.d, [0, 2, 0]);
});
test("Projection drawing agrees with number, also in rotated inspection datum", () => {
  const m = measurement("X", "a", "b", "x", "assembly", {
    offset: 8,
    offsetAxis: "y",
  });
  const layout = dimensionLayout(m, features, {
    origin: [0, 0, 0],
    rotationZ: 90,
  });
  assert.ok(
    Math.abs(Math.hypot(...layout.c.map((v, i) => layout.d[i] - v)) - 4) < 1e-9,
  );
});
test("Dangling semantic references are errors and never reassigned", () => {
  const m = measurement("lost", "missing", "b", "x", "assembly");
  assert.deepEqual(evaluate(m, features), {
    valid: false,
    code: "reference_lost",
    error: "참조가 없음 · 재선택 필요",
  });
});
test("10,000 dimensions with specs and visibility survive JSON roundtrip", () => {
  const s = initial();
  s.measurements = Array.from({ length: 10000 }, (_, i) =>
    measurement("관리 " + i, "a", "b", "x", "assembly", {
      visible: i % 3 === 0,
      group: "G" + (i % 8),
      spec: {
        target: 3,
        minus: 0.2,
        plus: 0.1,
        measured: 3.05,
        note: "조건 25 C",
      },
    }),
  );
  s.view.hidden = ["positive.tape.yellow"];
  s.view.section = { axis: "y", position: 2 };
  s.view.camera = {
    position: [10, -20, 30],
    target: [0, 0, 0],
    up: [0, 0, 1],
    zoom: 2,
  };
  assert.deepEqual(parseProject(JSON.stringify(s)), s);
});
test("Reject incompatible version, NaN, bad tolerance, duplicate IDs, malformed camera", () => {
  for (const mutate of [
    (s) => (s.schemaVersion = 1),
    (s) => (s.product.stack.width = NaN),
    (s) => (s.view.camera = {}),
    (s) => (s.measurements[0].spec.minus = -1),
    (s) => s.measurements.push({ ...s.measurements[0] }),
  ]) {
    const s = initial();
    s.measurements = [measurement("x", "a", "b", "x", "assembly")];
    mutate(s);
    assert.throws(() => validateProject(s));
  }
});
test("Measured values affect inspection only, never product parameters", () => {
  const s = initial(),
    before = structuredClone(s.product),
    m = measurement("x", "a", "b", "x", "assembly");
  m.spec = { target: 5, minus: 0.2, plus: 0.3, measured: 5.4, note: "" };
  assert.equal(inspection(m), "공차 이탈");
  m.spec.measured = 5.1;
  assert.equal(inspection(m), "공차 내");
  assert.deepEqual(s.product, before);
});
test("Undo/redo keeps independent copies", () => {
  const h = new History(),
    s = initial();
  h.push(s);
  s.product.positive.lead.width = 44;
  const previous = h.undo(s);
  assert.equal(previous.product.positive.lead.width, 36);
  assert.equal(h.redo(previous).product.positive.lead.width, 44);
});
test("Display section clips triangle and leaves source geometry unchanged", () => {
  const mesh = { positions: [-2, 0, 0, 2, 0, 0, 0, 3, 0], indices: [0, 1, 2] },
    before = structuredClone(mesh);
  const out = clipMesh(mesh, "x", 0);
  assert.equal(out.contours.length, 1);
  assert.ok(
    out.mesh.positions.filter((_, i) => i % 3 === 0).every((x) => x <= 0),
  );
  assert.deepEqual(mesh, before);
});
test("Surface anchors track analytic patch changes and invalidate a removed host", () => {
  const feature = {
    point: [10, 0, 0.2],
    patch: { u: [5, 0, 0], v: [0, 10, 0] },
    partId: "lead",
  };
  assert.deepEqual(locateOnPatch(feature, [12.5, 5, 0.2]), { u: 0.5, v: 0.5 });
  const a = {
    id: "anchor.test",
    name: "pick",
    baseFeatureId: "lead.top",
    u: 0.5,
    v: 0.5,
  };
  feature.patch.v = [0, 20, 0];
  const data = { features: { "lead.top": feature }, diagnostics: [] };
  assert.deepEqual(
    withAnchors(data, [a]).features[a.id].point,
    [12.5, 10, 0.2],
  );
  delete data.features["lead.top"];
  assert.equal(withAnchors(data, [a]).features[a.id].available, false);
  assert.equal(withAnchors(data, [a]).features[a.id].reasonCode, "reference_lost");
});
test("Surface points in a removed rounded corner are invalid, never clamped", () => {
  const f = {
    point: [0, 0, 0],
    patch: { u: [10, 0, 0], v: [0, 5, 0], cornerR: 2, halfSize: [10, 5] },
  };
  assert.equal(pointOnPatch(f, 1, 1), null);
  assert.deepEqual(pointOnPatch(f, 0.5, 0.5), [5, 2.5, 0]);
});
