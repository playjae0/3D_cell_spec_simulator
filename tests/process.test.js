import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initial,
  measurement,
  validateProject,
  demoMeasurements,
} from "../src/data/project.js";
import { inspectLegacy, migrateV2 } from "../src/data/migration.js";
import {
  readField,
  writeField,
  bindingFor,
  references,
  forecast,
  driversForFeature,
  fieldsFor,
  stageOrder,
} from "../src/data/bindings.js";
import { evaluate } from "../src/annotations/measure.js";
import { RebuildQueue } from "../src/geometry/queue.js";
const legacy = JSON.parse(
  readFileSync(new URL("../examples/legacy-v1.1.json", import.meta.url)),
);
test("Legacy widths need explicit independent decisions; original inputs are preserved", () => {
  const old = structuredClone(legacy);
  assert.equal(inspectLegacy(old)[0].root, 38);
  assert.throws(() => migrateV2(old, {}));
  const p = migrateV2(old, {
    positive: { source: "root" },
    negative: { source: "gathered" },
  });
  assert.equal(p.product.positive.tab.foilWidth, 38);
  assert.equal(p.product.negative.tab.foilWidth, 29);
  assert.deepEqual(p.migration.originalProduct, old.product);
  assert.deepEqual(old, legacy);
  assert.equal(p.schemaVersion, 3);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});
test("Later gathered-length edit never changes S0 stock; upstream stock propagates", () => {
  const p = initial().product,
    before = structuredClone(p.negative),
    stock = p.positive.tab.rootLength;
  writeField(p, "positive.tab.gatheredLength", 8);
  assert.equal(readField(p, "positive.tab.gatheredLength"), 8);
  assert.equal(p.positive.tab.rootLength, stock);
  p.positive.tab.rootLength += 2;
  assert.equal(readField(p, "positive.tab.gatheredLength"), 10);
  assert.deepEqual(p.negative, before);
});
test("Same width in root and gathered references does not lock Y centers", () => {
  const p = initial().product;
  p.positive.tab.gatherY = 3;
  p.positive.tab.foilWidth = 35;
  const f = forecast(
    bindingFor(p, "gathered", "positive.tab.foilWidth"),
    p,
    "gathered",
  );
  assert.equal(evaluate(f.measurement, f.features).value, 35);
  assert.equal(p.positive.tab.rootY, -1);
  assert.equal(p.positive.tab.gatherY, 3);
});
test("Stage-scoped fields, preweld lead and independent region IDs", () => {
  const p = initial().product;
  assert.equal(
    bindingFor(p, "stacked", "positive.lead.width").available,
    false,
  );
  assert.equal(
    bindingFor(p, "preweld", "positive.preweldLead.width").available,
    true,
  );
  assert.equal(
    bindingFor(p, "welded", "positive.preweldLead.width").available,
    false,
  );
  assert.equal(
    bindingFor(p, "welded", "positive.tapes.0.width").available,
    false,
  );
  assert.ok(
    demoMeasurements("preweld", p).some((m) =>
      m.a.featureId.includes(".preweld.pre-1."),
    ),
  );
  assert.ok(
    demoMeasurements("welded", p).some((m) =>
      m.a.featureId.includes(".joint.main."),
    ),
  );
});
test("Semantic edge mapping exposes correct input choices, never a mesh index", () => {
  const p = initial().product;
  assert.deepEqual(
    driversForFeature("positive.tab.edge.rootWidth", p, "gathered"),
    ["positive.tab.foilWidth"],
  );
  assert.deepEqual(
    driversForFeature("positive.tab.edge.length", p, "gathered"),
    ["positive.tab.gatheredLength", "positive.tab.gatherDistance"],
  );
  assert.deepEqual(
    driversForFeature("positive.joint.main.start", p, "welded"),
    ["positive.joints.0.start"],
  );
  assert.ok(
    driversForFeature("positive.lead.overlapStart", p, "welded").includes(
      "positive.lead.start",
    ),
  );
  assert.deepEqual(
    driversForFeature("positive.lead.overlapWidthPlus", p, "welded"),
    ["positive.lead.width", "positive.lead.offsetY", "positive.tab.foilWidth"],
  );
});
test("Every numeric enabled field has a finite analytic guide, including R arcs", () => {
  const p = initial().product;
  for (const stage of stageOrder)
    for (const b of fieldsFor(p, stage).filter(
      (b) => b.available && typeof b.value === "number",
    )) {
      const g = forecast(b, p, stage);
      assert.ok(g, b.path);
      assert.ok(
        [...g.features["@a"].point, ...g.features["@b"].point].every(
          Number.isFinite,
        ),
        b.path,
      );
      if (b.key.endsWith("R")) assert.ok(g.arc?.length > 2, b.path);
    }
});
test("Unavailable stage reference differs from broken reference and is never relinked", () => {
  const m = measurement("lead", "leadA", "leadB", "x", "stacked");
  assert.match(evaluate(m, { leadA: { available: false } }).error, /해당 상태/);
  assert.match(evaluate(m, {}).error, /재선택/);
});
test("All stage templates and independent specs survive JSON", () => {
  const p = initial();
  p.measurements = stageOrder.flatMap((s) => demoMeasurements(s, p.product));
  p.measurements[0].spec = {
    target: 200,
    minus: 1,
    plus: 2,
    measured: 201,
    note: "S0 검사",
  };
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(
    new Set(p.measurements.map((m) => m.id)).size,
    p.measurements.length,
  );
});
test("Queued obsolete response cannot overwrite newer input, even before debounce", async () => {
  const jobs = [],
    accept = [],
    q = new RebuildQueue({
      delay: 1e6,
      compute: (p, r) => new Promise((resolve) => jobs.push({ p, r, resolve })),
      onAccept: (v) => accept.push(v),
    });
  q.schedule("old", { automatic: false }, false);
  const running = q.flush();
  q.schedule("new", { automatic: false }, false);
  jobs[0].resolve("old result");
  await running;
  assert.deepEqual(accept, []);
  const current = q.flush();
  jobs[1].resolve("new result");
  await current;
  assert.deepEqual(accept, ["new result"]);
  q.invalidate();
});
test("Repeated inputs coalesce into one CAD request and preserve group metadata", async () => {
  const sent = [],
    groups = [],
    q = new RebuildQueue({
      compute: async (p) => (sent.push(p), p),
      onAccept: (r, j) => groups.push(j.meta.group),
    });
  for (const v of [1, 2, 3, 4])
    q.schedule(v, { automatic: false, group: "held-button" }, false);
  await q.flush();
  assert.deepEqual(sent, [4]);
  assert.deepEqual(groups, ["held-button"]);
  q.invalidate();
});
test("Cancel invalidates an in-flight CAD response", async () => {
  let resolve;
  const accepted = [],
    q = new RebuildQueue({
      compute: () => new Promise((r) => (resolve = r)),
      onAccept: (r) => accepted.push(r),
    });
  q.schedule(1, { automatic: false }, false);
  const run = q.flush();
  q.invalidate();
  resolve("late");
  await run;
  assert.deepEqual(accepted, []);
});
test("Failed latest request reports error; superseded failure does not", async () => {
  const failures = [],
    jobs = [],
    q = new RebuildQueue({
      compute: () => new Promise((res, rej) => jobs.push({ res, rej })),
      onError: (e) => failures.push(e.message),
    });
  q.schedule(1, { automatic: false }, false);
  const a = q.flush();
  q.schedule(2, { automatic: false }, false);
  jobs[0].rej(Error("old"));
  await a;
  assert.deepEqual(failures, []);
  const b = q.flush();
  jobs[1].rej(Error("current invalid"));
  await b;
  assert.deepEqual(failures, ["current invalid"]);
  q.invalidate();
});
