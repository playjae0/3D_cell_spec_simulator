import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initial, measurement, validateProject } from "../src/data/project.js";
import {
  sameInspection,
  definitionDiff,
} from "../src/annotations/semantics.js";
import { ModelLibrary } from "../src/models/library.js";
import { evaluate } from "../src/annotations/measure.js";
import { template } from "../src/intake/contract.js";
import { validateIntake } from "../src/intake/validate.js";
import { projectFromIntake, intakeFromProject } from "../src/intake/adapter.js";
import { basicMeasurements } from "../src/annotations/sets.js";
import {
  captureInspectionView,
  applyInspectionView,
} from "../src/annotations/presets.js";
import { withAnchors } from "../src/annotations/anchors.js";
import {
  ComparisonSession,
  calculatedDifferences,
  partDifferences,
} from "../src/models/compare.js";
import { planLibraryMerge } from "../src/models/merge.js";
import { LibraryStorage, LIBRARY_KEY } from "../src/models/storage.js";
export function inspectionFixture() {
  const p = initial();
  p.stage = "assembly";
  p.modelIdentity = {
    modelId: "review-fixture",
    revision: "1",
    baseRevision: null,
  };
  p.measurements = [
    measurement(
      "뿌리 Y",
      "positive.tab.root",
      "positive.tab.root",
      "signed_coordinate",
      "assembly",
      { id: "root-y", axis: "y", datumId: "legacy" },
    ),
  ];
  return p;
}
test("F1: changed origin -1 to -11, rotation, anchor, tolerance and conditions require a new inspection revision", () => {
  const saved = inspectionFixture(),
    lib = new ModelLibrary();
  lib.commit(saved);
  const sample = {
    sampleId: "A",
    modelId: "review-fixture",
    modelRevision: "1",
    itemId: "root-y",
    value: -11,
  };
  const changed = structuredClone(saved);
  changed.datumSet.origin[1] = 10;
  const f = { "positive.tab.root": { point: [0, -1, 0] } };
  assert.equal(evaluate(saved.measurements[0], f, saved).value, -1);
  assert.equal(evaluate(changed.measurements[0], f, changed).value, -11);
  for (const edit of [
    (p) => (p.datumSet.origin[1] = 10),
    (p) => (p.datumSet.rotationZ = 90),
    (p) => (p.measurements[0].spec.plus = 0.2),
    (p) => (p.measurements[0].conditions = "지그 A"),
  ]) {
    const p = structuredClone(saved);
    edit(p);
    assert.throws(() => lib.addSample(sample, p), /새 개정/);
  }
  const anchored = structuredClone(saved);
  anchored.anchors = [
    {
      id: "anchor.fixed",
      name: "고정",
      mode: "fixed_mm",
      reference: "u_minus",
      distanceU: 5,
      distanceV: 0,
      baseFeatureId: "stack.top",
    },
  ];
  anchored.measurements[0].a.featureId = "anchor.fixed";
  const moved = structuredClone(anchored);
  moved.anchors[0].distanceU = 6;
  assert.equal(sameInspection(anchored, moved), false);
  assert.equal(lib.data.samples.length, 0);
});
test("display changes do not change inspection meaning; samples retain stage and reject unit mismatch", () => {
  const p = inspectionFixture(),
    q = structuredClone(p),
    lib = new ModelLibrary();
  lib.commit(p);
  q.view.camera = {
    position: [1, 2, 3],
    target: [0, 0, 0],
    up: [0, 0, 1],
    zoom: 1,
  };
  q.measurements[0].offset = 55;
  q.measurements[0].visible = false;
  q.measurements[0].name = "별칭";
  q.measurements[0].spec.note = "설명";
  assert.equal(sameInspection(p, q), true);
  const sample = {
    sampleId: "A",
    modelId: "review-fixture",
    modelRevision: "1",
    itemId: "root-y",
    value: -1,
  };
  lib.addSample(sample, q);
  assert.equal(lib.data.samples[0].stage, "assembly");
  assert.equal(lib.data.samples[0].unit, "mm");
  assert.throws(
    () => lib.addSample({ ...sample, sampleId: "B", unit: "um" }, q),
    /단위/,
  );
});
test("F2: diff includes datum, anchor, item and existence changes, separates metadata and ignores object ordering", () => {
  const a = intakeFromProject(inspectionFixture()),
    b = structuredClone(a);
  b.legacyDatum.origin[1] = 10;
  assert.ok(
    definitionDiff(a, b).some(
      (r) => r.kind === "datum" && r.categories.includes("definition"),
    ),
  );
  b.inspectionItems[0].display.visible = false;
  b.componentInstances[0].existenceStatus = "unknown";
  const rows = definitionDiff(a, b);
  assert.ok(
    rows.some(
      (r) => r.kind === "inspectionItem" && r.categories.includes("display"),
    ),
  );
  assert.ok(rows.some((r) => r.kind === "component"));
  const reordered = structuredClone(a);
  reordered.parameters.reverse();
  reordered.componentInstances.reverse();
  reordered.legacyDatum = { rotationZ: 0, origin: [0, 0, 0] };
  assert.deepEqual(definitionDiff(a, reordered), []);
});
test("new intake 1.1 requires S3 sealant review; legacy sparse S3 keeps null without inferred absence", () => {
  const x = JSON.parse(
    fs.readFileSync("examples/intake/virtual-complete.json"),
  );
  x.requestedStages = ["welded"];
  for (const side of ["positive", "negative"]) {
    x.componentInstances.find(
      (c) => c.kind === "leadFilm" && c.polarity === side,
    ).existenceStatus = "unknown";
    for (const p of x.parameters.filter((p) =>
      p.parameterId.startsWith(side + ".leadFilm."),
    )) {
      p.value = null;
      p.status = "missing";
      p.reviewStatus = "pending";
    }
  }
  assert.equal(validateIntake(x, "welded").ready, false);
  x.formatVersion = "1.0";
  x.dictionaryVersion = "cell-intake-1.0";
  const r = validateIntake(x, "welded");
  assert.equal(r.ready, true, JSON.stringify(r.issues));
  assert.ok(r.issues.some((i) => !i.blocking && i.message.includes("미확정")));
  const p = projectFromIntake(x, "welded");
  assert.equal(p.product.positive.leadFilm.enabled, null);
  validateProject(p);
  assert.equal(template({}, ["welded"]).formatVersion, "1.2");
});
test("basic set only adds available CAD references, has no targets and is idempotent", () => {
  const p = initial();
  p.measurements = [];
  const f = {
    "stack.length.minus": { point: [-120, 0, 0], partId: "stack" },
    "stack.length.plus": { point: [120, 0, 0], partId: "stack" },
    "positive.tab.root": { point: [-120, -1, 0], partId: "positive.tab" },
  };
  const first = basicMeasurements(p, { features: f });
  assert.ok(first.added.length >= 2);
  assert.ok(
    first.added.every((m) => m.spec.target === null && m.datumId === "legacy"),
  );
  assert.ok(first.unsupported.length > 0);
  assert.ok(first.added.every((m) => evaluate(m, f, p).valid));
  p.measurements.push(...first.added);
  assert.equal(basicMeasurements(p, { features: f }).added.length, 0);
});
test("inspection view roundtrip restores only view and validates foreign references before applying", () => {
  const p = inspectionFixture(),
    data = {
      parts: [{ id: "positive.tab" }],
      features: {
        "positive.tab.root": { point: [0, -1, 0], partId: "positive.tab" },
      },
    };
  const camera = {
    position: [0, 0, 400],
    target: [0, 0, 0],
    up: [0, 1, 0],
    zoom: 2,
  };
  const v = captureInspectionView(p, data, {
    name: "검사",
    camera,
    selectedMeasurementId: "root-y",
  });
  p.inspectionViews = [v];
  const restored = projectFromIntake(intakeFromProject(p), p.stage);
  assert.deepEqual(restored.inspectionViews, [v]);
  const before = structuredClone(p);
  p.view.section = { axis: "x", position: 3 };
  p.measurements[0].visible = false;
  const applied = applyInspectionView(p, data, v);
  assert.deepEqual(applied.project.view.camera, camera);
  assert.equal(applied.project.measurements[0].visible, true);
  assert.deepEqual(p.view.section, { axis: "x", position: 3 });
  assert.equal(sameInspection(before, applied.project), true);
  const missing = structuredClone(p);
  missing.measurements = [];
  assert.throws(() => applyInspectionView(missing, data, v), /참조/);
  const other = structuredClone(p);
  other.modelIdentity.modelId = "other";
  assert.equal(applyInspectionView(other, data, v).crossModel, true);
});
test("anchor outside, absent stage and removed host are distinct and never clamped", () => {
  const a = {
    id: "anchor.a",
    name: "A",
    baseFeatureId: "host",
    mode: "fixed_mm",
    reference: "origin",
    distanceU: 9,
    distanceV: 0,
  };
  const host = {
    point: [0, 0, 0],
    partId: "part",
    patch: { u: [5, 0, 0], v: [0, 5, 0] },
  };
  const m = measurement(
    "A",
    "anchor.a",
    "anchor.a",
    "signed_coordinate",
    "assembly",
    { axis: "y" },
  );
  for (const [feature, code] of [
    [host, "anchor_outside"],
    [{ available: false }, "stage_absent"],
    [
      { available: false, reasonCode: "unconfirmed", reason: "입력 미확정" },
      "unconfirmed",
    ],
    [undefined, "reference_lost"],
  ]) {
    const data = withAnchors(
      { features: feature ? { host: feature } : {}, diagnostics: [] },
      [a],
    );
    assert.equal(evaluate(m, data.features).code, code);
    assert.equal(data.features[a.id].point, undefined);
    if (code === "unconfirmed")
      assert.equal(data.features[a.id].reason, "입력 미확정");
  }
});
test("comparison separates changed inspection datum from geometry and never invents a zero delta", () => {
  const a = inspectionFixture(),
    b = structuredClone(a);
  b.datumSet.origin[1] = 10;
  const data = {
    parts: [
      {
        id: "positive.tab",
        name: "탭",
        bounds: { min: [-130, -5, -1], max: [-120, 5, 1] },
        volume: 200,
      },
    ],
    features: {
      "positive.tab.root": { point: [-120, -1, 0], partId: "positive.tab" },
    },
    diagnostics: [],
  };
  const rows = calculatedDifferences([a, b], [data, data]),
    r = rows.find((x) => x.items[0]?.id === "root-y");
  assert.deepEqual(
    r.results.map((x) => x.value),
    [-1, -11],
  );
  assert.equal(r.delta, null);
  assert.match(r.reason, /직접 비교 불가/);
  assert.equal(partDifferences([data, data])[0].changed, false);
  const common = calculatedDifferences([a, b], [data, data], {
    common: true,
  }).find((x) => x.items[0]?.id === "root-y");
  assert.equal(common.delta, 0);
  const absent = {
    ...data,
    parts: [],
    features: {
      "positive.tab.root": { partId: "positive.tab", available: false },
    },
  };
  assert.equal(
    partDifferences([absent, data])[0].states[0],
    "해당 공정에 없음",
  );
  const missing = calculatedDifferences([a, b], [absent, data]).find(
    (x) => x.items[0]?.id === "root-y",
  );
  assert.equal(missing.delta, null);
  assert.equal(missing.results[0].valid, false);
  absent.features["positive.tab.root"].reasonCode = "unconfirmed";
  absent.features["positive.tab.root"].reason = "부품 입력 미확정";
  assert.equal(
    partDifferences([absent, data])[0].states[0],
    "부품 입력 미확정",
  );
});
test("comparison cache keys product+stage, serializes CAD and preserves snapshots on cancel/stale results", async () => {
  const p = inspectionFixture(),
    before = structuredClone(p);
  let calls = 0,
    active = 0,
    max = 0;
  const s = new ComparisonSession(async (project) => {
    calls++;
    active++;
    max = Math.max(max, active);
    await Promise.resolve();
    active--;
    return { parts: [], features: {}, diagnostics: [], stage: project.stage };
  });
  await s.run(p, p, ["welded", "welded"]);
  assert.equal(calls, 1);
  const moved = structuredClone(p);
  moved.view.section = { axis: "x", position: 4 };
  await s.run(p, moved, ["welded", "welded"]);
  assert.equal(calls, 1);
  await s.run(p, p, ["preweld", "assembly"]);
  assert.equal(calls, 3);
  assert.equal(max, 1);
  assert.deepEqual(p, before);
  let resolve;
  const pending = new ComparisonSession(
    () => new Promise((r) => (resolve = r)),
  );
  const job = pending.run(p, p, ["welded", "welded"]);
  await new Promise((r) => setImmediate(r));
  pending.invalidate();
  resolve({ parts: [], features: {}, diagnostics: [] });
  assert.equal(await job, null);
  assert.equal(pending.result, null);
  assert.deepEqual(p, before);
});
test("library merge skips identical revisions and adds a child without changing the original", () => {
  const p = inspectionFixture(),
    local = new ModelLibrary();
  local.commit(p);
  const incoming = new ModelLibrary(local.snapshot());
  const child = structuredClone(p);
  child.modelIdentity.revision = "2";
  child.modelIdentity.baseRevision = "1";
  child.product.positive.lead.offsetY += 0.2;
  incoming.commit(child);
  const before = local.snapshot(),
    plan = planLibraryMerge(local, incoming);
  assert.equal(plan.summary.duplicateRevisions, 1);
  assert.equal(plan.summary.addedRevisions, 1);
  assert.deepEqual(local.snapshot(), before);
  assert.equal(plan.candidate.data.models[0].revisions.length, 2);
  const repeat = planLibraryMerge(plan.candidate, incoming);
  assert.equal(repeat.summary.addedRevisions, 0);
  assert.equal(repeat.summary.duplicateRevisions, 2);
});
test("conflicting model copies remap parent, sample and saved-view references as a unit", () => {
  const p = projectFromIntake(
      JSON.parse(fs.readFileSync("examples/intake/virtual-complete.json")),
      "assembly",
    ),
    local = new ModelLibrary();
  local.commit(p);
  const incoming = new ModelLibrary(),
    changed = structuredClone(p);
  changed.datumSet.origin[1] = 10;
  incoming.commit(changed);
  const child = structuredClone(changed);
  child.modelIdentity.revision = "2";
  child.modelIdentity.baseRevision = "1";
  child.intake.model.revision = "2";
  child.intake.model.baseRevision = "1";
  const camera = {
    position: [0, 0, 400],
    target: [0, 0, 0],
    up: [0, 1, 0],
    zoom: 1,
  };
  child.inspectionViews = [
    captureInspectionView(
      child,
      { parts: [], features: {} },
      { name: "보기", camera },
    ),
  ];
  incoming.commit(child);
  incoming.addSample({
    sampleId: "A",
    modelId: p.modelIdentity.modelId,
    modelRevision: "2",
    itemId: "root-y",
    value: -11,
  });
  const preview = planLibraryMerge(local, incoming);
  assert.equal(preview.candidate, null);
  assert.equal(preview.unresolved.length, 1);
  for (const action of ["copy_model", "copy_revisions"]) {
    const choices = new Map([[preview.conflicts[0].key, { action }]]),
      plan = planLibraryMerge(local, incoming, choices);
    assert.ok(plan.candidate);
    const sample = plan.candidate.data.samples[0];
    const model = plan.candidate.data.models.find(
        (m) => m.modelId === sample.modelId,
      ),
      rev = model.revisions.find((r) => r.revision === sample.modelRevision);
    assert.ok(model.revisions.some((r) => r.revision === rev.baseRevision));
    assert.equal(rev.project.inspectionViews[0].owner.modelId, model.modelId);
    assert.equal(rev.project.inspectionViews[0].owner.revision, rev.revision);
    assert.equal(rev.project.intake.model.revision, rev.revision);
  }
  assert.equal(local.data.models.length, 1);
  assert.equal(local.data.samples.length, 0);
});
test("sample and draft conflicts require choices and copy without overwriting raw unknown fields", () => {
  const p = inspectionFixture(),
    a = new ModelLibrary();
  a.commit(p);
  a.addSample({
    sampleId: "A",
    modelId: "review-fixture",
    modelRevision: "1",
    itemId: "root-y",
    value: -1,
  });
  const draft = template({
    modelId: "review-fixture",
    revision: "draft",
    baseRevision: "1",
  });
  draft.unknownFutureField = { value: 17 };
  a.saveDraft(draft);
  const b = new ModelLibrary(a.snapshot());
  b.data.samples[0].value = -2;
  b.data.drafts[0].intake.unknownFutureField.value = 18;
  const plan = planLibraryMerge(a, b);
  assert.equal(plan.candidate, null);
  assert.equal(plan.conflicts.length, 2);
  const resolved = planLibraryMerge(
    a,
    b,
    new Map(plan.conflicts.map((c) => [c.key, { action: "rename" }])),
  );
  assert.equal(resolved.candidate.data.samples.length, 2);
  assert.equal(resolved.candidate.data.drafts.length, 2);
  assert.equal(
    resolved.candidate.data.drafts[1].intake.unknownFutureField.value,
    18,
  );
  assert.notEqual(
    resolved.candidate.data.drafts[1].intake.model.revision,
    "draft",
  );
  assert.equal(a.data.drafts[0].intake.unknownFutureField.value, 17);
});
test("library validates dangling or cyclic revision parents before accepting backup data", () => {
  const l = new ModelLibrary();
  l.commit(inspectionFixture());
  const data = l.snapshot();
  data.models[0].revisions[0].baseRevision = "missing";
  data.models[0].revisions[0].project.modelIdentity.baseRevision = "missing";
  assert.throws(() => new ModelLibrary(data), /참照|참조/);
  data.models[0].revisions[0].baseRevision = "1";
  data.models[0].revisions[0].project.modelIdentity.baseRevision = "1";
  assert.throws(() => new ModelLibrary(data), /순환/);
});
function memoryStorage(raw = null) {
  const values = new Map(raw === null ? [] : [[LIBRARY_KEY, raw]]);
  return {
    values,
    fail: false,
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) ?? null,
    setItem(k, v) {
      if (this.fail && k === LIBRARY_KEY) throw Error("quota");
      values.set(k, v);
    },
  };
}
test("save failure keeps memory and original bytes; corrupt/sample-only storage cannot be overwritten", () => {
  const local = new ModelLibrary();
  local.commit(inspectionFixture());
  const raw = JSON.stringify(local.snapshot()),
    memory = memoryStorage(raw),
    store = new LibraryStorage(memory),
    next = new ModelLibrary(local.snapshot());
  next.saveDraft(template({ modelId: "draft", revision: "1" }));
  memory.fail = true;
  assert.throws(() => store.save(next), /기존 데이터 유지/);
  assert.equal(memory.getItem(LIBRARY_KEY), raw);
  assert.equal(store.library.data.drafts.length, 0);
  for (const corrupt of [
    "{broken",
    JSON.stringify({
      format: "pouch-model-library",
      version: 1,
      models: [],
      drafts: [],
      samples: [{ sampleId: "orphan", value: 1 }],
    }),
  ]) {
    const m = memoryStorage(corrupt),
      s = new LibraryStorage(m);
    assert.equal(s.blocked, true);
    assert.throws(() => s.save(new ModelLibrary()), /백업/);
    assert.equal(m.getItem(LIBRARY_KEY), corrupt);
    const backup = s.recover();
    assert.equal(m.getItem(backup), corrupt);
    assert.equal(s.blocked, false);
    assert.equal(s.backups().length, 1);
  }
});
test("draft-only libraries are preserved by merge, including cancel and failed recovery writes", () => {
  const a = new ModelLibrary();
  a.saveDraft(template({ modelId: "draft", revision: "1" }));
  const before = a.snapshot(),
    b = new ModelLibrary();
  b.commit(inspectionFixture());
  const plan = planLibraryMerge(a, b);
  assert.equal(plan.candidate.data.drafts.length, 1);
  assert.deepEqual(a.snapshot(), before);
  const mem = memoryStorage("{broken"),
    store = new LibraryStorage(mem);
  mem.fail = true;
  assert.throws(() => store.recover(), /quota/);
  assert.equal(store.blocked, true);
  assert.equal(mem.getItem(LIBRARY_KEY), "{broken");
  assert.equal(store.backups().length, 1);
});
