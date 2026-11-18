import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { Viewer } from "../src/viewer/viewer.js";
import {
  editorTargets,
  fieldsForTarget,
  fieldIdentity,
  fieldUnit,
} from "../src/data/editor-targets.js";
import { viewAvailability } from "../src/viewer/presentation.js";
import { validateProject, measurement } from "../src/data/project.js";
import {
  captureInspectionView,
  applyInspectionView,
} from "../src/annotations/presets.js";

const project = () =>
  JSON.parse(fs.readFileSync("examples/pouch-process.json"));
const part = (id) => ({ id, name: id });

test("stage editor targets keep tape polarity and instance IDs, and remove absent parts", () => {
  const p = project().product;
  for (const side of ["positive", "negative"]) {
    const fields = fieldsForTarget(p, "assembly", side + ".tape.yellow");
    assert.ok(fields.length > 5);
    assert.ok(fields.every((f) => f.side === side && f.section === "tapes"));
    const start = fields.find((f) => f.key === "start");
    assert.equal(fieldIdentity(start), side + ".tapes.yellow.start");
    assert.equal(fieldUnit(start), "mm");
    assert.equal(
      fieldsForTarget(p, "stacked", side + ".tape.yellow").length,
      0,
    );
  }
  const s0 = editorTargets(
    p,
    "stacked",
    ["stack", "positive.tab", "negative.tab"].map(part),
  );
  assert.ok(
    s0.every((o) => !o.value.includes("tape") && !o.value.includes("pouch")),
  );
  const p0 = editorTargets(
    p,
    "pouch_formed",
    ["pouch.upper.pocket", "pouch.lower.pocket"].map(part),
  );
  assert.ok(p0.every((o) => o.value.startsWith("pouch")));
  const p1 = editorTargets(
    p,
    "loaded",
    ["stack", "positive.tab", "pouch.upper.pocket"].map(part),
  );
  assert.ok(p1.some((o) => o.value === "stack"));
});

test("tool and seal selection resolve only their own independent work-face fields", () => {
  const p = project().product;
  for (const half of ["upper", "lower"])
    for (const edge of ["xMinus", "xPlus", "yMinus", "yPlus"]) {
      const id = half + "_" + edge;
      const tool = fieldsForTarget(p, "sealed", "tool." + id),
        seal = fieldsForTarget(p, "sealed", "seal." + id);
      assert.deepEqual(tool, seal);
      assert.ok(tool.length > 5);
      assert.ok(
        tool.every((f) =>
          f.path.startsWith("pouchProcess.toolFaces." + id + "."),
        ),
      );
      assert.equal(fieldUnit(tool.find((f) => f.key === "width")), "mm");
    }
  assert.deepEqual(fieldsForTarget(p, "sealed", "seal.common.xMinus"), []);
  assert.ok(
    editorTargets(p, "sealed", [part("seal.common.xMinus")]).some(
      (o) => o.value === "seal.common.xMinus",
    ),
  );
});

function viewerWithoutWindow() {
  const v = Object.create(Viewer.prototype);
  Object.assign(v, {
    model: new T.Group(),
    meshes: [],
    draw() {},
    selected: null,
    host: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    },
  });
  return v;
}

test("actual Three ray picking passes through shell, seal and visible tools in internal-only mode", () => {
  const v = viewerWithoutWindow();
  v.ray = new T.Raycaster();
  v.camera = new T.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  v.camera.position.set(0, 0, 10);
  v.camera.lookAt(0, 0, 0);
  v.camera.updateMatrixWorld();
  v.meshes = [
    "stack",
    "seal.upper_xMinus",
    "pouch.upper.pocket",
    "tool.upper_xMinus",
  ].map((id, i) => {
    const mesh = new T.Mesh(
      new T.BoxGeometry(2, 2, 0.2),
      new T.MeshBasicMaterial(),
    );
    mesh.position.z = i;
    mesh.userData.part = part(id);
    mesh.updateMatrixWorld();
    return mesh;
  });
  v.state = { view: { hidden: [], section: { axis: "none", position: 0 } } };
  v.data = {
    features: Object.fromEntries(
      v.meshes.map((m) => [
        m.userData.part.id,
        { partId: m.userData.part.id, point: [0, 0, m.position.z] },
      ]),
    ),
  };
  assert.equal(
    v.hit({ clientX: 50, clientY: 50 }).hits[0].object.userData.part.id,
    "tool.upper_xMinus",
  );
  v.through = true;
  assert.equal(
    v.hit({ clientX: 50, clientY: 50 }).hits[0].object.userData.part.id,
    "stack",
  );
  assert.deepEqual(
    v.visibleFeatures().map(([id]) => id),
    ["stack"],
  );
  assert.equal(
    viewAvailability([part("pouch.upper.pocket")]).internalOnly,
    false,
  );
  assert.equal(viewAvailability([part("stack")]).transparent, false);
  assert.equal(
    viewAvailability(v.meshes.map((m) => m.userData.part)).internalOnly,
    true,
  );
});

test("rendered materials make product skin transparent without changing tooling or CAD input", () => {
  const v = viewerWithoutWindow(),
    mesh = { positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], indices: [0, 1, 2] };
  const data = {
    parts: [
      "pouch.upper.pocket",
      "seal.upper_xMinus",
      "tool.upper_xMinus",
      "stack",
    ].map((id) => ({
      id,
      color: "#889999",
      role: id.startsWith("seal") || id.startsWith("tool") ? "region" : "solid",
      mesh,
    })),
    paths: [],
  };
  const before = structuredClone(data),
    state = {
      view: {
        transparent: false,
        hidden: [],
        section: { axis: "none", position: 0 },
      },
    };
  v.setModel(data, state);
  assert.ok(
    v.meshes.every((m) => m.material.opacity === 1 && m.material.depthWrite),
  );
  state.view.transparent = true;
  v.setModel(data, state);
  assert.equal(v.meshes[0].material.opacity, 0.22);
  assert.equal(v.meshes[1].material.opacity, 0.32);
  assert.ok(v.meshes.slice(0, 2).every((m) => !m.material.depthWrite));
  assert.ok(
    v.meshes
      .slice(2)
      .every((m) => m.material.opacity === 1 && m.material.depthWrite),
  );
  assert.deepEqual(data, before);
});

test("global dimension visibility removes dimension drawing and hit targets but preserves datums and item choices", () => {
  const old = globalThis.document;
  globalThis.document = {
    createElementNS: () => ({
      children: [],
      attrs: {},
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      append(...c) {
        this.children.push(...c);
      },
    }),
  };
  try {
    const v = viewerWithoutWindow();
    delete v.draw;
    v.renderer = { render() {} };
    v.overlay = {
      children: [],
      replaceChildren() {
        this.children = [];
      },
      append(...a) {
        this.children.push(...a);
      },
    };
    v.project = (p) => p;
    v.selectionMode = "part";
    v.state = project();
    v.state.stage = "sealed";
    v.state.view.datums = true;
    v.data = {
      features: { a: { point: [0, 0, 0] }, b: { point: [10, 0, 0] } },
    };
    v.state.measurements = [
      measurement("shown", "a", "b", "distance", "sealed"),
      measurement("hidden", "a", "b", "distance", "sealed", { visible: false }),
    ];
    const original = structuredClone(v.state.measurements);
    v.draw();
    assert.equal(v.dimensionHits.length, 2);
    v.state.view.showDimensions = false;
    v.draw();
    assert.equal(v.dimensionHits.length, 0);
    assert.ok(v.overlay.children.some((n) => n.textContent === "X · C"));
    assert.ok(
      !v.overlay.children.some((n) => n.textContent?.includes("shown")),
    );
    v.state.view.showDimensions = true;
    v.draw();
    assert.equal(v.dimensionHits.length, 2);
    assert.deepEqual(v.state.measurements, original);
  } finally {
    globalThis.document = old;
  }
});

test("view gate and internal picking survive project/preset restore; legacy presets remain valid", () => {
  const p = project();
  p.view.showDimensions = false;
  p.view.internalOnly = true;
  p.measurements = [];
  const data = { parts: [part("stack")], features: {} };
  const camera = {
    position: [0, 0, 400],
    target: [0, 0, 0],
    up: [0, 1, 0],
    zoom: 1,
  };
  const preset = captureInspectionView(p, data, { name: "saved", camera });
  p.inspectionViews = [preset];
  const restored = JSON.parse(JSON.stringify(p));
  validateProject(restored);
  restored.view.showDimensions = true;
  restored.view.internalOnly = false;
  const result = applyInspectionView(restored, data, preset).project;
  assert.equal(result.view.showDimensions, false);
  assert.equal(result.view.internalOnly, true);
  const old = structuredClone(preset);
  delete old.view.showDimensions;
  delete old.view.internalOnly;
  const legacy = applyInspectionView(restored, data, old).project;
  assert.notEqual(legacy.view.showDimensions, false);
  preset.view.showDimensions = "false";
  assert.throws(() => applyInspectionView(restored, data, preset));
});
