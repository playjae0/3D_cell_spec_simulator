import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  template,
  dictionaryFor,
  conditionsDocument,
  fieldPath,
  stableId,
  clone,
} from "../src/intake/contract.js";
import { validateIntake, reviewParameter } from "../src/intake/validate.js";
import {
  projectFromIntake,
  intakeFromProject,
  reconcileProject,
} from "../src/intake/adapter.js";
import {
  ModelLibrary,
  PreviewSession,
  revisionDiff,
} from "../src/models/library.js";
import { validateProject, initial } from "../src/data/project.js";
import { evaluate, dimensionLayout } from "../src/annotations/measure.js";
import { anchorPoint, withAnchors } from "../src/annotations/anchors.js";
const fixture = () =>
  JSON.parse(fs.readFileSync("examples/intake/virtual-complete.json", "utf8"));
const partial = () =>
  JSON.parse(
    fs.readFileSync("examples/intake/virtual-s0-missing-future.json", "utf8"),
  );
const param = (d, id) => d.parameters.find((x) => x.parameterId === id);
test("contract and required table are generated from the executable dictionary", () => {
  assert.deepEqual(
    JSON.parse(fs.readFileSync("examples/intake/template-1.2.json")),
    template(),
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync("docs/intake/required-fields-1.2.json")),
    conditionsDocument(),
  );
});
test("asymmetric values and negative Y survive intake to project to JSON; µm source stays intact", () => {
  const i = fixture(),
    p = projectFromIntake(i, "assembly");
  assert.equal(p.product.positive.tab.rootY, -1);
  assert.notEqual(
    p.product.positive.tab.foilWidth,
    p.product.negative.tab.foilWidth,
  );
  assert.ok(Math.abs(p.product.positive.lead.thickness - 0.35) < 1e-12);
  validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(param(p.intake, "positive.lead.thickness").unit, "µm");
});
test("missing future inputs stay null; S0 ready but S5 blocks with specific missing IDs", () => {
  const i = partial();
  assert.equal(validateIntake(i, "stacked").ready, true);
  const p = projectFromIntake(i, "stacked");
  assert.equal(p.product.pouch.openingWidth, null);
  assert.equal(p.product.positive.lead.thickness, null);
  assert.equal(p.product.positive.tab.gatherDistance, null);
  assert.equal(validateIntake(i, "packaged").ready, false);
  param(i, "stack.width").value = null;
  param(i, "stack.width").status = "missing";
  assert.throws(() => projectFromIntake(i, "stacked"), /stack.width/);
});
test("conflict, unknown fields, unit/type/enum, source IDs and repeated instances block", () => {
  for (const mutate of [
    (i) => {
      param(i, "positive.lead.contactSide").value = "else";
    },
    (i) => {
      param(i, "stack.width").unit = "deg";
    },
    (i) => {
      param(i, "stack.width").value = "68";
    },
    (i) => {
      i.componentInstances.push(clone(i.componentInstances[0]));
    },
    (i) => {
      i.unknown = 7;
    },
    (i) => {
      param(i, "stack.width").sourceRefs[0].sourceId = "missing";
    },
    (i) => {
      param(i, "stack.width").reviewStatus = "pending";
    },
    (i) => {
      i.conflicts.push({
        parameterId: "stack.width",
        description: "출처 불일치",
        sourceRefs: [],
      });
    },
  ]) {
    const i = fixture();
    mutate(i);
    assert.equal(validateIntake(i, "assembly").ready, false);
  }
});
test("presence false must be explicitly absent, metadata process is optional, no inferred absence", () => {
  const i = fixture(),
    c = i.componentInstances.find((c) => c.kind === "tape");
  c.existenceStatus = "unknown";
  assert.equal(validateIntake(i, "assembly").ready, false);
  c.existenceStatus = "absent";
  assert.equal(validateIntake(i, "assembly").ready, false);
  param(i, c.polarity + ".tapes." + c.instanceId + ".enabled").value = false;
  assert.equal(validateIntake(i, "assembly").ready, true);
});
test("allowlisted derivation recomputes, rejects arbitrary expressions and mismatched results", () => {
  const i = fixture(),
    p = param(i, "positive.lead.thickness");
  p.value = 0.35;
  p.unit = "mm";
  p.status = "derived";
  p.conversion = {
    op: "unit_scale",
    inputParameterIds: [],
    expression: "350 µm × 0.001",
  };
  assert.equal(validateIntake(i, "assembly").ready, true);
  p.value = 0.36;
  assert.equal(validateIntake(i, "assembly").ready, false);
  p.value = 0.35;
  p.conversion.op = "eval";
  assert.equal(validateIntake(i, "assembly").ready, false);
});
test("multiple weld/tape IDs retain definitions after array reorder", () => {
  const i = fixture();
  for (const [kind, section, oldId] of [
    ["joint", "joints", "main"],
    ["tape", "tapes", "yellow"],
  ]) {
    const c = clone(
      i.componentInstances.find(
        (c) => c.polarity === "positive" && c.kind === kind,
      ),
    );
    c.instanceId = "second";
    i.componentInstances.push(c);
    for (const p of i.parameters.filter((p) =>
      p.parameterId.startsWith("positive." + section + "." + oldId + "."),
    )) {
      const q = clone(p);
      q.parameterId = q.parameterId.replace("." + oldId + ".", ".second.");
      i.parameters.push(q);
    }
  }
  const a = projectFromIntake(i, "assembly");
  i.componentInstances.reverse();
  i.parameters.reverse();
  const b = projectFromIntake(i, "assembly");
  for (const section of ["joints", "tapes"]) {
    for (const x of a.product.positive[section])
      assert.deepEqual(
        x,
        b.product.positive[section].find((y) => y.id === x.id),
      );
    const path = fieldPath(b.product, `positive.${section}.second.width`);
    assert.equal(stableId(b.product, path), `positive.${section}.second.width`);
  }
});
test("new model apply once, duplicate revisions reject; samples never modify shape or copy", () => {
  const l = new ModelLibrary(),
    p = projectFromIntake(fixture(), "stacked");
  l.commit(p);
  assert.throws(() => l.commit(p), /이미/);
  const before = JSON.stringify(p.product);
  l.addSample({
    sampleId: "A",
    modelId: p.modelIdentity.modelId,
    modelRevision: "1",
    itemId: "root-y",
    value: -1,
  });
  l.addSample({
    sampleId: "B",
    modelId: p.modelIdentity.modelId,
    modelRevision: "1",
    itemId: "root-y",
    value: -1.2,
  });
  assert.equal(
    JSON.stringify(l.data.models[0].revisions[0].project.product),
    before,
  );
  const copy = projectFromIntake(
    { ...fixture(), model: { ...fixture().model, modelId: "copied" } },
    "stacked",
  );
  l.commit(copy);
  assert.equal(l.data.samples.filter((s) => s.modelId === "copied").length, 0);
});
test("preview cancellation, stale success/failure and one-time apply protect active state/history", async () => {
  const pending = [],
    session = new PreviewSession(
      (p) =>
        new Promise((resolve, reject) => pending.push({ resolve, reject, p })),
    ),
    active = { model: "A", history: ["original"] },
    before = clone(active);
  const a = session.run({ model: "B" });
  session.invalidate();
  pending[0].resolve("old");
  assert.equal(await a, null);
  assert.deepEqual(active, before);
  const b = session.run({ model: "C" });
  const c = session.run({ model: "D" });
  pending[1].reject(Error("old failure"));
  assert.equal(await b, null);
  pending[2].resolve("D");
  await c;
  assert.equal(session.take().project.model, "D");
  assert.throws(() => session.take());
  assert.deepEqual(active, before);
});
test("CAD manual edits update normalized intake only for changed field and log original value", () => {
  const p = projectFromIntake(fixture(), "assembly");
  p.product.positive.tab.rootY = -2;
  const q = reconcileProject(p);
  validateProject(q);
  assert.equal(param(q.intake, "positive.tab.rootY").value, -2);
  assert.equal(param(q.intake, "positive.lead.thickness").value, 350);
  assert.equal(q.intake.reviewLog.at(-1).parameterId, "positive.tab.rootY");
  assert.equal(p.intake.reviewLog.length, 0);
});
test("review action is explicit and recorded; diff matches stable IDs", () => {
  const a = fixture(),
    b = clone(a);
  param(b, "positive.tab.rootY").value = -2;
  reviewParameter(b, "positive.tab.rootY");
  assert.equal(b.reviewLog.length, 1);
  assert.deepEqual(
    revisionDiff(a, b).map((x) => x.parameterId),
    ["positive.tab.rootY"],
  );
});
test("signed coordinate/offset keep direction and inspection frames; existing y stays positive", () => {
  const f = { a: { point: [0, -1, 0] }, b: { point: [0, 1, 0] } },
    d = {
      datumSet: { origin: [0, 0, 0], rotationZ: 0 },
      inspectionDatums: [{ id: "jig", origin: [0, 2, 0], rotationZ: 0 }],
    },
    m = {
      a: { featureId: "a" },
      b: { featureId: "b" },
      mode: "signed_coordinate",
      axis: "y",
      datumId: "legacy",
      offset: 10,
      offsetAxis: "x",
    };
  assert.equal(evaluate(m, f, d).value, -1);
  assert.equal(evaluate({ ...m, datumId: "jig" }, f, d).value, -3);
  assert.equal(
    evaluate(
      {
        ...m,
        mode: "signed_offset",
        a: { featureId: "b" },
        b: { featureId: "a" },
      },
      f,
      d,
    ).value,
    -2,
  );
  assert.equal(evaluate({ ...m, mode: "y" }, f, d).value, 2);
  assert.equal(evaluate({ ...m, datumId: "gone" }, f, d).valid, false);
  assert.deepEqual(dimensionLayout(m, f, d).b, [0, -1, 0]);
});
test("fixed mm from selected edge differs from relative and invalidates after resize, no clamp", () => {
  const host = { point: [0, 0, 1], patch: { u: [10, 0, 0], v: [0, 5, 0] } },
    a = { mode: "fixed_mm", reference: "u_minus", distanceU: 3, distanceV: 0 };
  assert.deepEqual(anchorPoint(host, a), [-7, 0, 1]);
  host.patch.u = [20, 0, 0];
  assert.deepEqual(anchorPoint(host, a), [-17, 0, 1]);
  assert.deepEqual(anchorPoint(host, { u: -0.7, v: 0 }), [-14, 0, 1]);
  host.patch.u = [1, 0, 0];
  assert.equal(anchorPoint(host, a), null);
});
test("legacy schema3 remains valid and schema4 rejects inconsistent CAD versus intake", () => {
  validateProject(initial());
  const p = projectFromIntake(fixture(), "stacked");
  p.product.stack.width += 1;
  assert.throws(() => validateProject(p), /불일치/);
});
test("new revision carries current inspection specs and frames; source log retains evidence", () => {
  const p = projectFromIntake(fixture(), "stacked");
  p.measurements[0].spec.target = -2;
  p.datumSet.origin = [1, 2, 3];
  const i = intakeFromProject(p, { revision: "2", baseRevision: "1" });
  assert.equal(i.inspectionItems[0].target, -2);
  assert.deepEqual(i.legacyDatum.origin, [1, 2, 3]);
  p.product.positive.tab.rootY = -2;
  const q = reconcileProject(p);
  assert.match(q.intake.reviewLog.at(-1).action, /sourceRefs/);
});
test("excluding an intake region records explicit absence without losing its ID", () => {
  const p = projectFromIntake(fixture(), "assembly");
  p.product.positive.tapes[0].enabled = false;
  const q = reconcileProject(p);
  validateProject(q);
  assert.equal(
    q.intake.componentInstances.find(
      (c) => c.polarity === "positive" && c.kind === "tape",
    ).existenceStatus,
    "absent",
  );
  assert.equal(param(q.intake, "positive.tapes.yellow.enabled").value, false);
});
test("unsupported fields remain in rejected draft rather than disappearing", () => {
  const i = fixture();
  i.productSecretExtension = { localRule: "unknown shape" };
  assert.equal(validateIntake(i).ready, false);
  const library = new ModelLibrary();
  library.saveDraft(i);
  assert.deepEqual(
    library.data.drafts[0].intake.productSecretExtension,
    i.productSecretExtension,
  );
});
test("inspection labels, placement, visibility, notes and anchored points survive a new revision", () => {
  const p = projectFromIntake(fixture(), "stacked");
  p.measurements[0].visible = false;
  p.measurements[0].offset = 31;
  p.measurements[0].offsetAxis = "z";
  p.measurements[0].spec.note = "검사 기준 설명";
  p.anchors = [
    {
      id: "anchor.test",
      name: "고정 mm",
      baseFeatureId: "stack.thickness.plus",
      mode: "fixed_mm",
      reference: "u_minus",
      distanceU: 5,
      distanceV: 0,
    },
  ];
  const q = projectFromIntake(
    intakeFromProject(p, { revision: "2", baseRevision: "1" }),
    "stacked",
  );
  assert.deepEqual(q.anchors, p.anchors);
  assert.equal(q.measurements[0].offset, 31);
  assert.equal(q.measurements[0].visible, false);
  assert.equal(q.measurements[0].spec.note, "검사 기준 설명");
  validateProject(q);
});
