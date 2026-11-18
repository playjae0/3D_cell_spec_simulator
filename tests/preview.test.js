import assert from "node:assert/strict";
import test from "node:test";
import { designIdentity, sha256 } from "../src/preview/identity.js";
import { packSuccess, restoreResponse, stripRequestFields } from "../src/preview/codec.js";
import { previewExamples } from "../src/preview/examples.js";
import { checkLimits } from "../scripts/preview-limits.mjs";

test("CAD response packing preserves UTF-8, original numbers, order and duplicate parts", () => {
  const a = '{"mesh": [1.20e+3,-0.0], "name":"가, \\"나\\""}';
  const b = '{"mesh":[],"revision": 7}';
  const raw = `{ "revision": 843, "requestToken": "a,b", "model": { "revision": "R3" },
  "parts": [ ${a},\n${b}, ${a} ], "z":1.01e+01 }\n`;
  const normalized = `{ "model": { "revision": "R3" },
  "parts": [ ${a},\n${b}, ${a} ], "z":1.01e+01 }\n`;
  assert.equal(stripRequestFields(raw), normalized);
  const parts = {};
  const packed = { status: 200, ...packSuccess(normalized, parts, sha256) };
  assert.equal(Object.keys(parts).length, 2);
  assert.equal(packed.refs[0], packed.refs[2]);
  assert.deepEqual(Buffer.from(restoreResponse(packed, parts)), Buffer.from(normalized));
  assert.throws(() => restoreResponse(packed, {}), /Missing part reference/);
  assert.equal(stripRequestFields('{"errors": ["입력 오류"], "revision":3 }'), '{"errors": ["입력 오류"] }');
  assert.equal(stripRequestFields('{"revision": 1, "errors": ["입력 오류"]}'), '{"errors": ["입력 오류"]}');
  assert.equal(stripRequestFields('{"revision": 1, "requestToken": "token"}'), '{}');
});

test("record identity binds the saved design, revision and tooling but ignores view state", () => {
  const project = previewExamples["process-tooling-r4"]();
  const id = designIdentity(project);
  project.stage = "gas_sealed";
  project.view.hidden = ["stack"];
  project.view.section = { axis: "z", position: 1 };
  project.view.camera = { zoom: 2 };
  project.revision = 45;
  project.requestToken = "new";
  assert.equal(designIdentity(project), id);
  const revision = { ...project, modelIdentity: { modelId: project.product.id, revision: "R2" } };
  assert.notEqual(designIdentity(revision), id);
  project.product.processTooling.poles.positive.tools.preweld.horn.x += 0.2;
  assert.notEqual(designIdentity(project), id);
});

test("deployment limits accept exact decimal boundaries and report exceeded limits", () => {
  const make = (count, bytes) => Array.from({ length: count }, (_, i) => ({ path: String(i), bytes }));
  assert.equal(checkLimits(make(16, 16_000_000)).bytes, 256_000_000);
  assert.equal(checkLimits(make(511, 512)).files, 511);
  assert.throws(() => checkLimits(make(1, 16_000_001)), /0: 16000001 > 16000000 bytes/);
  assert.throws(() => checkLimits(make(512, 1)), /512 > 511/);
  assert.throws(() => checkLimits([...make(16, 16_000_000), ...make(1, 1)]), /256000001 > 256000000/);
});
