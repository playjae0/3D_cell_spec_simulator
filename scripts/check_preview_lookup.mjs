import assert from "node:assert/strict";
import { loadPreview } from "../src/preview/records.js";
import { previewExamples } from "../src/preview/examples.js";
import { designIdentity } from "../src/preview/identity.js";
import { ComparisonSession } from "../src/models/compare.js";

const url = process.argv[2];
if (!url) throw Error("Pass the static preview directory URL (with trailing slash).");
const records = await loadPreview(new URL("preview/", url));
const original = previewExamples["pouch-process"]();
const viewed = structuredClone(original);
viewed.view.hidden = ["stack"];
viewed.view.section = { axis: "y", position: 2 };
viewed.view.camera = { position: [3, 4, 5], target: [0, 0, 0], up: [0, 0, 1], zoom: 2 };
assert.deepEqual(await records.model(original), await records.model(viewed));
const session = new ComparisonSession(p => records.model(p),
  p => JSON.stringify([designIdentity(p), p.stage]));
const valid = await session.run(original, viewed, ["sealed", "folded"]);
assert.deepEqual(valid.models.map(m => m.stage), ["sealed", "folded"]);

// Prime the comparison cache first. Same geometry must not alias an unrecorded revision.
const unknownRevision = structuredClone(original);
unknownRevision.modelIdentity = { modelId: original.product.id, revision: "unrecorded" };
const changed = structuredClone(original);
changed.product.stack.length += 0.1;
for (const candidate of [unknownRevision, changed]) {
  await assert.rejects(session.run(original, candidate, ["sealed", "sealed"]),
    /기록되지 않은.*로컬 CAD 서버/);
}
console.log("Recorded lookup and comparison reject changed designs and unrecorded revisions after cache warm-up: PASS");
