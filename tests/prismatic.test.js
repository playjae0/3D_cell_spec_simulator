import assert from "node:assert/strict";
import test from "node:test";
import { components, dimensions, initial, stages, validate } from "../src/prismatic/project.js";
import { designIdentity } from "../src/preview/identity.js";
import { initial as pouch, validateProject } from "../src/data/project.js";

test("Each prismatic dimension has one input owner or a CAD result", () => {
  const project = initial();
  assert.equal(new Set(dimensions.map(d => d.id)).size, 40);
  const inputs = dimensions.filter(d => d.owner);
  assert.deepEqual(inputs.map(d => d.id).sort(), Object.keys(project.product.values).sort());
  assert.equal(inputs.length, 25);
  assert.ok(inputs.every(d => components[d.owner] || stages[d.owner] || d.owner === "display"));
  assert.deepEqual(inputs.filter(d => d.owner === "display").map(d => d.id), ["W01"]);
  assert.throws(() => validate(initial({ A05: 1 })));
  assert.equal(validate(project), project);
});

test("Prismatic recordings distinguish geometry and revision; old pouch files still validate", () => {
  const a = initial();
  assert.notEqual(designIdentity(a), designIdentity(initial({ S02: 32 })));
  assert.notEqual(designIdentity(a), designIdentity({ ...a, modelIdentity: { ...a.modelIdentity, revision: "2" } }));
  assert.equal(designIdentity(a), designIdentity({ ...a, stage: "prism-insert" }));
  assert.doesNotThrow(() => validateProject(pouch()));
  assert.doesNotThrow(() => validateProject({ ...pouch(), productType: "pouch" }));
  assert.throws(() => validateProject(a));
});
