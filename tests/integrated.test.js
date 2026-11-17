import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initial, measurement, validateProject } from "../src/data/project.js";
import { sameInspection, definitionDiff } from "../src/annotations/semantics.js";
import { ModelLibrary } from "../src/models/library.js";
import { evaluate } from "../src/annotations/measure.js";
import { template } from "../src/intake/contract.js";
import { validateIntake } from "../src/intake/validate.js";
import { projectFromIntake, intakeFromProject } from "../src/intake/adapter.js";
import { basicMeasurements } from "../src/annotations/sets.js";
import { captureInspectionView, applyInspectionView } from "../src/annotations/presets.js";
import { withAnchors } from "../src/annotations/anchors.js";
export function inspectionFixture() {
  const p = initial();
  p.stage = "assembly";
  p.modelIdentity = { modelId: "review-fixture", revision: "1", baseRevision: null };
  p.measurements = [measurement("뿌리 Y", "positive.tab.root", "positive.tab.root", "signed_coordinate", "assembly", { id: "root-y", axis: "y", datumId: "legacy" })];
  return p;
}
test("F1: changed origin -1 to -11, rotation, anchor, tolerance and conditions require a new inspection revision", () => {
  const saved = inspectionFixture(), lib = new ModelLibrary(); lib.commit(saved);
  const sample = { sampleId: "A", modelId: "review-fixture", modelRevision: "1", itemId: "root-y", value: -11 };
  const changed = structuredClone(saved); changed.datumSet.origin[1] = 10;
  const f = { "positive.tab.root": { point:[0,-1,0] } };
  assert.equal(evaluate(saved.measurements[0],f,saved).value,-1);
  assert.equal(evaluate(changed.measurements[0],f,changed).value,-11);
  for (const edit of [p => p.datumSet.origin[1]=10, p => p.datumSet.rotationZ=90, p => p.measurements[0].spec.plus=.2, p => p.measurements[0].conditions="지그 A"] ) {
    const p=structuredClone(saved); edit(p); assert.throws(() => lib.addSample(sample,p), /새 개정/);
  }
  const anchored = structuredClone(saved); anchored.anchors=[{id:"anchor.fixed",name:"고정",mode:"fixed_mm",reference:"u_minus",distanceU:5,distanceV:0,baseFeatureId:"stack.top"}]; anchored.measurements[0].a.featureId="anchor.fixed";
  const moved=structuredClone(anchored); moved.anchors[0].distanceU=6; assert.equal(sameInspection(anchored,moved),false);
  assert.equal(lib.data.samples.length,0);
});
test("display changes do not change inspection meaning; samples retain stage and reject unit mismatch", () => {
  const p=inspectionFixture(), q=structuredClone(p), lib=new ModelLibrary();lib.commit(p);
  q.view.camera={position:[1,2,3],target:[0,0,0],up:[0,0,1],zoom:1};q.measurements[0].offset=55;q.measurements[0].visible=false;q.measurements[0].name="별칭";q.measurements[0].spec.note="설명";
  assert.equal(sameInspection(p,q),true);
  const sample={sampleId:"A",modelId:"review-fixture",modelRevision:"1",itemId:"root-y",value:-1};lib.addSample(sample,q);
  assert.equal(lib.data.samples[0].stage,"assembly");assert.equal(lib.data.samples[0].unit,"mm");
  assert.throws(()=>lib.addSample({...sample,sampleId:"B",unit:"um"},q),/단위/);
});
test("F2: diff includes datum, anchor, item and existence changes, separates metadata and ignores object ordering", () => {
  const a=intakeFromProject(inspectionFixture()), b=structuredClone(a);b.legacyDatum.origin[1]=10;
  assert.ok(definitionDiff(a,b).some(r=>r.kind==="datum" && r.categories.includes("definition")));
  b.inspectionItems[0].display.visible=false;b.componentInstances[0].existenceStatus="unknown";
  const rows=definitionDiff(a,b);assert.ok(rows.some(r=>r.kind==="inspectionItem" && r.categories.includes("display")));assert.ok(rows.some(r=>r.kind==="component"));
  const reordered=structuredClone(a);reordered.parameters.reverse();reordered.componentInstances.reverse();reordered.legacyDatum={rotationZ:0,origin:[0,0,0]};assert.deepEqual(definitionDiff(a,reordered),[]);
});
test("new intake 1.1 requires S3 sealant review; legacy sparse S3 keeps null without inferred absence", () => {
  const x=JSON.parse(fs.readFileSync("examples/intake/virtual-complete.json"));x.requestedStages=["welded"];
  for(const side of ["positive","negative"]){x.componentInstances.find(c=>c.kind==="leadFilm"&&c.polarity===side).existenceStatus="unknown";for(const p of x.parameters.filter(p=>p.parameterId.startsWith(side+".leadFilm."))){p.value=null;p.status="missing";p.reviewStatus="pending";}}
  assert.equal(validateIntake(x,"welded").ready,false);
  x.formatVersion="1.0";x.dictionaryVersion="cell-intake-1.0";
  const r=validateIntake(x,"welded");assert.equal(r.ready,true,JSON.stringify(r.issues));assert.ok(r.issues.some(i=>!i.blocking&&i.message.includes("미확정")));
  const p=projectFromIntake(x,"welded");assert.equal(p.product.positive.leadFilm.enabled,null);validateProject(p);
  assert.equal(template({},["welded"]).formatVersion,"1.1");
});
test("basic set only adds available CAD references, has no targets and is idempotent",()=>{
  const p=initial();p.measurements=[];
  const f={"stack.length.minus":{point:[-120,0,0],partId:"stack"},"stack.length.plus":{point:[120,0,0],partId:"stack"},"positive.tab.root":{point:[-120,-1,0],partId:"positive.tab"}};
  const first=basicMeasurements(p,{features:f});assert.ok(first.added.length>=2);assert.ok(first.added.every(m=>m.spec.target===null&&m.datumId==="legacy"));
  assert.ok(first.unsupported.length>0);assert.ok(first.added.every(m=>evaluate(m,f,p).valid));p.measurements.push(...first.added);
  assert.equal(basicMeasurements(p,{features:f}).added.length,0);
});
test("inspection view roundtrip restores only view and validates foreign references before applying",()=>{
  const p=inspectionFixture(),data={parts:[{id:"positive.tab"}],features:{"positive.tab.root":{point:[0,-1,0],partId:"positive.tab"}}};
  const camera={position:[0,0,400],target:[0,0,0],up:[0,1,0],zoom:2};
  const v=captureInspectionView(p,data,{name:"검사",camera,selectedMeasurementId:"root-y"});p.inspectionViews=[v];
  const restored=projectFromIntake(intakeFromProject(p),p.stage);assert.deepEqual(restored.inspectionViews,[v]);
  const before=structuredClone(p);p.view.section={axis:"x",position:3};p.measurements[0].visible=false;
  const applied=applyInspectionView(p,data,v);assert.deepEqual(applied.project.view.camera,camera);assert.equal(applied.project.measurements[0].visible,true);assert.deepEqual(p.view.section,{axis:"x",position:3});assert.equal(sameInspection(before,applied.project),true);
  const missing=structuredClone(p);missing.measurements=[];assert.throws(()=>applyInspectionView(missing,data,v),/참조/);
  const other=structuredClone(p);other.modelIdentity.modelId="other";assert.equal(applyInspectionView(other,data,v).crossModel,true);
});
test("anchor outside, absent stage and removed host are distinct and never clamped",()=>{
  const a={id:"anchor.a",name:"A",baseFeatureId:"host",mode:"fixed_mm",reference:"origin",distanceU:9,distanceV:0};
  const host={point:[0,0,0],partId:"part",patch:{u:[5,0,0],v:[0,5,0]}};
  const m=measurement("A","anchor.a","anchor.a","signed_coordinate","assembly",{axis:"y"});
  for(const [feature,code] of [[host,"anchor_outside"],[{available:false},"stage_absent"],[undefined,"reference_lost"]]){
    const data=withAnchors({features:feature?{host:feature}:{},diagnostics:[]},[a]);assert.equal(evaluate(m,data.features).code,code);assert.equal(data.features[a.id].point,undefined);
  }
});
