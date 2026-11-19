// Run against scripts/start.* (CadQuery) and write measured public-example evidence.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reconcileProject } from "../src/intake/adapter.js";
import { rebuildRequest } from "../src/geometry/request.js";
import { previewExamples } from "../src/preview/examples.js";

const base = process.argv[2] || "http://127.0.0.1:8765";
const destination = resolve(process.argv[3] || "docs/ui-review");
const example = previewExamples["pouch-phase1"];
const sample = example();
const http = await fetch(new URL("/api/health", base));
assert.equal(http.status, 200);
const engine = await http.json();
assert.equal(engine.mode, "live-cad");
let revision = 0;
async function model(stage, edit) {
  const source = example();
  source.stage = stage;
  edit?.(source.product);
  const { requestToken, options } = rebuildRequest(reconcileProject(source), ++revision);
  const response = await fetch(new URL("/api/rebuild", base), options);
  const data = await response.json();
  assert.equal(response.status, 200, stage + ": " + JSON.stringify(data.errors));
  assert.equal(data.mode, "live-cad");
  assert.equal(data.revision, revision);
  assert.equal(data.requestToken, requestToken);
  assert.equal(data.stage, stage);
  return data;
}
const rounded = value => Number(value.toFixed(6));
function pole(data, side) {
  function coord(name, axis = 0) { return data.features[side + "." + name].point[axis]; }
  return {
    rootX: coord("tab.root"), gatherX: coord("tab.gather"), foilTipX: coord("tab.end"),
    leadStartX: coord("lead.start"), tapeStartX: coord("tape.yellow.start"),
    jointStartX: coord("joint.main.start"), sealantStartX: coord("leadFilm.start"),
    leadWidth: rounded(coord("lead.widthPlus", 1) - coord("lead.widthMinus", 1)),
    sealantWidth: rounded(coord("leadFilm.widthPlus", 1) - coord("leadFilm.widthMinus", 1)),
    sealantOverhang: rounded(coord("leadFilm.outerSide", 1) - coord("leadFilm.leadSide", 1)),
  };
}
function profile(data, side) {
  const seal = data.toolingResults.seals[side];
  return {
    centerL: rounded(seal.tabDimensions.center.length),
    transitionR: rounded(seal.tabDimensions.radius.radius),
    widths: Object.fromEntries(Object.entries(seal.profileWidths).map(([k, v]) => [k, rounded(v)])),
    productArea: rounded(seal.productArea),
  };
}
function negativeParts(m) {
  return m.parts.filter(part => part.id.startsWith("negative.") ||
    part.id.startsWith("seal.negative") || part.id.includes(".negative"));
}
const stage = "tab_sealed";
const baseline = await model(stage);
const gather = await model(stage, p => { p.positive.tab.gatherDistance = 11; });
const lead = await model(stage, p => { p.positive.lead.width = 37.5; });
function editR(p) {
  for (const half of ["upper", "lower"]) p.processTooling.sealBars["positive_" + half].tabProfile.transitionR = 5;
}
const radius = await model(stage, editR);
const basePole = pole(baseline, "positive");
const stations = ["gatherX", "leadStartX", "tapeStartX", "jointStartX", "sealantStartX"];
const movedPole = pole(gather, "positive");
for (const key of stations) assert.equal(movedPole[key], basePole[key] - 1);
assert.deepEqual(movedPole, { ...basePole, ...Object.fromEntries(stations.map(k => [k, basePole[k] - 1])) });
assert.deepEqual(pole(lead, "positive"), { ...basePole, leadWidth: 37.5, sealantWidth: 41.5 });
assert.deepEqual(pole(radius, "positive"), basePole);
const firstSeal = profile(baseline, "positive"), changedSeal = profile(radius, "positive");
assert.equal(firstSeal.transitionR, 3);
assert.equal(changedSeal.transitionR, 5);
assert.equal(firstSeal.centerL, changedSeal.centerL);
assert.deepEqual(firstSeal.widths, changedSeal.widths);
assert.ok(changedSeal.productArea < firstSeal.productArea);
assert.ok(negativeParts(baseline).length > 3);
for (const variant of [gather, lead, radius]) {
  assert.deepEqual(negativeParts(variant), negativeParts(baseline), "negative pole geometry changed");
  assert.deepEqual(profile(variant, "negative"), profile(baseline, "negative"));
}
const stages = {};
for (const [i, key] of ["film_formed", "assembly_loaded_open", "package_closed", "tab_sealed",
                         "gas_sealed", "final_sealed", "package_trimmed", "package_folded"].entries()) {
  const data = key === stage ? baseline : await model(key);
  const result = data.toolingResults.packaging;
  const ids = data.parts.map(p => p.id);
  assert.equal(result.step, i);
  assert.equal(result.open, i < 2);
  assert.equal(ids.includes("stack"), i >= 1);
  assert.equal(ids.includes("seal.positive"), i >= 3);
  assert.equal(ids.includes("seal.gas"), i >= 4 && i < 6);
  assert.equal(ids.includes("seal.final"), i >= 5);
  assert.equal(result.filmEdgeY, i >= 6 ? 50 : 80);
  stages[key] = {
    status: result.gasState, opened: result.open, hasStack: ids.includes("stack"),
    activeSeals: ids.filter(id => id.startsWith("seal.")),
    filmEdgeY: result.filmEdgeY, foldTip: result.foldTip?.map(rounded),
  };
}
const folded = await model("package_folded"), foldedR = await model("package_folded", editR);
assert.deepEqual(negativeParts(foldedR), negativeParts(folded));
assert.equal(profile(foldedR, "positive").transitionR, 5);
assert.notEqual(profile(foldedR, "positive").productArea, profile(folded, "positive").productArea);
await mkdir(destination, { recursive: true });
const report = {
  model: sample.modelIdentity, engine: engine.engine, engineVersion: engine.version, unit: "mm",
  input: { positiveGatherDistance: [10, 11], positiveLeadWidth: [36, 37.5], positiveUpperLowerBarR: [3, 5] },
  assembly: { baseline: basePole, gather: movedPole, lead: pole(lead, "positive"), radius: pole(radius, "positive"), negativeAll: pole(baseline, "negative") },
  tabSeal: { baseline: firstSeal, radius: changedSeal, negativeAll: profile(baseline, "negative") },
  foldedSeal: { baseline: profile(folded, "positive"), radius: profile(foldedR, "positive"), negativeBoth: profile(folded, "negative") },
  unchangedNegativePartIdsAtTabSeal: negativeParts(baseline).map(p => p.id),
  stages,
};
await writeFile(resolve(destination, "live-cad.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Verified independent geometry, CAD datums and all eight packaging stages");
