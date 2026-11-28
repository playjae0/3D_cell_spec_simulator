import assert from "node:assert/strict";
import test from "node:test";
import {
  components,
  dimensions,
  initial,
  recordedExamples,
  stages,
  validate,
} from "../src/prismatic/project.js";
import { designIdentity } from "../src/preview/identity.js";
import { initial as pouch, validateProject } from "../src/data/project.js";

test("Each prismatic dimension has one input owner or a CAD result", () => {
  const project = initial();
  assert.equal(new Set(dimensions.map((d) => d.id)).size, 51);
  const inputs = dimensions.filter((d) => d.owner);
  assert.deepEqual(
    inputs.map((d) => d.id).sort(),
    Object.keys(project.product.values).sort(),
  );
  assert.equal(inputs.length, 36);
  assert.ok(
    inputs.every(
      (d) => components[d.owner] || stages[d.owner] || d.owner === "display",
    ),
  );
  assert.deepEqual(
    inputs.filter((d) => d.owner === "display").map((d) => d.id),
    ["W01"],
  );
  assert.throws(() => validate(initial({ A05: 1 })));
  assert.equal(validate(project), project);
});

test("Prismatic recordings distinguish geometry and revision; old pouch files still validate", () => {
  const a = initial();
  assert.notEqual(designIdentity(a), designIdentity(initial({ S02: 32 })));
  assert.notEqual(
    designIdentity(a),
    designIdentity({
      ...a,
      modelIdentity: { ...a.modelIdentity, revision: "2" },
    }),
  );
  assert.equal(
    designIdentity(a),
    designIdentity({ ...a, stage: "prism-insert" }),
  );
  assert.doesNotThrow(() => validateProject(pouch()));
  assert.doesNotThrow(() =>
    validateProject({ ...pouch(), productType: "pouch" }),
  );
  assert.throws(() => validateProject(a));
});

test("Older prismatic files acquire complete virtual terminal dimensions; partial new inputs are rejected", () => {
  const legacy = initial();
  for (const key of Object.keys(legacy.product.values))
    if (key.startsWith("T") || key === "K08") delete legacy.product.values[key];
  assert.deepEqual(validate(legacy), initial());
  delete legacy.product.values.T03;
  assert.throws(() => validate(legacy));
});

test("Fixed Rev1 persists a spec reference; only custom terminals store editable T10", () => {
  const fixed = recordedExamples.demoB();
  fixed.product.values.K03 = 3;
  assert.deepEqual(validate(JSON.parse(JSON.stringify(fixed))), fixed);
  for (const id of ["T08", "T09", "T10"]) {
    assert.ok(!Object.hasOwn(fixed.product.values, id));
    const invalid = structuredClone(fixed);
    invalid.product.values[id] = 4;
    assert.throws(() => validate(invalid));
  }
  const custom = recordedExamples.patent();
  custom.product.values.T10 = 5;
  assert.deepEqual(validate(JSON.parse(JSON.stringify(custom))), custom);
});
