import fs from "node:fs";
import assert from "node:assert/strict";
import { projectFromIntake } from "../src/intake/adapter.js";
const base = process.argv[2] || "http://127.0.0.1:8765";
const read = (n) => JSON.parse(fs.readFileSync("examples/intake/" + n));
async function post(p, revision) {
  const r = await fetch(base + "/api/rebuild", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: p,
      revision,
      requestToken: "intake-" + revision,
    }),
  });
  const data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  assert.equal(data.requestToken, "intake-" + revision);
  return data;
}
const p = projectFromIntake(read("virtual-s0-missing-future.json"), "stacked"),
  a = await post(p, 1);
assert.equal(a.parts.length, 3);
assert.equal(a.features["positive.tab.root"].point[1], -1);
assert.equal(p.product.positive.lead.thickness, null);
const full = read("virtual-complete.json"),
  q = projectFromIntake(full, "assembly"),
  b = await post(q, 2);
assert.equal(b.parts.length, 13);
assert.ok(
  Math.abs(
    b.features["positive.lead.top"].point[2] -
      b.features["positive.lead.bottom"].point[2] -
      0.35,
  ) < 1e-7,
);
full.parameters.find((p) => p.parameterId === "positive.tab.gatherY").value =
  -2;
const c = await post(projectFromIntake(full, "assembly"), 3);
assert.equal(c.features["positive.tab.gather"].point[1], -2);
assert.deepEqual(
  b.parts.filter((p) => p.id.startsWith("negative.")),
  c.parts.filter((p) => p.id.startsWith("negative.")),
);
console.log(
  "PASS: schema4 sparse S0 / normalized µm / actual independent CAD / request identity",
);
