import test from 'node:test';
import assert from 'node:assert/strict';
import {kitData} from '../scripts/build-intake-kit.mjs';
import {validateIntake} from '../src/intake/validate.js';
import {projectFromIntake,reconcileProject} from '../src/intake/adapter.js';
import {reviewCsv} from '../src/intake/review-csv.js';
const data=()=>kitData('test-source-commit');
const id='processTooling.poles.positive.tools.welded.horn.bodyDepth';
const param=(i,key)=>i.parameters.find(p=>p.parameterId===key);
test('1.4 blank never inherits any dimension and blocks CAD; genuine zero stays zero',()=>{
  const {blank,filled}=data();assert.ok(blank.parameters.every(p=>p.value===null));
  assert.equal(validateIntake(blank,'welded').ready,false);
  param(filled,id).value=null;assert.equal(validateIntake(filled,'welded').ready,false);
  param(filled,id).value=3;
  const zero='processTooling.poles.positive.tools.welded.horn.rotation';
  assert.equal(param(filled,zero).value,0);assert.equal(validateIntake(filled,'welded').ready,true);
});
test('1.4 tool units, provenance, stable references and assembly datums survive edits and save/reopen',()=>{
  const {filled}=data();param(filled,id).value=3000;param(filled,id).unit='µm';
  const p=projectFromIntake(filled,'welded');assert.equal(p.product.processTooling.poles.positive.tools.welded.horn.bodyDepth,3);
  assert.equal(param(p.intake,id).unit,'µm');
  const opposite=structuredClone(p.product.processTooling.poles.negative);
  p.product.processTooling.poles.positive.tools.welded.horn.bodyDepth=4;
  const q=reconcileProject(p);assert.equal(param(q.intake,id).value,4);assert.equal(param(q.intake,id).unit,'mm');
  assert.equal(param(q.intake,id).sourceRefs[0].sourceId,'manual-edits');
  assert.equal(param(q.intake,id).originalValue,4);assert.equal(param(q.intake,id).originalUnit,'mm');
  assert.match(q.intake.reviewLog.at(-1).action,/µm/);
  const r=projectFromIntake(JSON.parse(JSON.stringify(q.intake)),'welded');
  assert.equal(r.product.processTooling.poles.positive.tools.welded.horn.bodyDepth,4);
  assert.deepEqual(r.product.processTooling.poles.negative,opposite);
  assert.deepEqual(r.datumSet,p.datumSet);assert.deepEqual(r.inspectionDatums,p.inspectionDatums);
  assert.equal(r.product.processTooling.poles.positive.foilCut.removedLength,1);
  const csv=reviewCsv(q.intake);assert.ok(csv.includes(id));assert.ok(csv.includes('manual-edits'));assert.ok(csv.includes('고정 치형 뿌리면'));
});
test('1.4 stable laser spot additions and removals reconcile without stale values',()=>{
  const {filled}=data(),p=projectFromIntake(filled,'welded');
  const spots=p.product.processTooling.poles.positive.laser.spots;
  const deleted=spots.shift();spots.push({id:'new-spot',row:0,column:0,dx:1,dy:0});
  const q=reconcileProject(p),r=projectFromIntake(q.intake,'welded');
  assert.deepEqual(r.product.processTooling.poles.positive.laser.spots,spots);
  assert.ok(!q.intake.parameters.some(f=>f.parameterId.includes('.spots.'+deleted.id+'.')&&f.parameterId.includes('.positive.')));
  assert.ok(q.intake.reviewLog.some(f=>f.action.startsWith('user-removed')));
});
test('1.4 missing tool structure, unreviewed values and wrong units cannot silently fall back',()=>{
  for(const change of [i=>delete i.processTooling.poles.positive.foilCut,
    i=>{i.parameters=i.parameters.filter(p=>p.parameterId!==id)},
    i=>{param(i,id).unit='deg'},i=>{param(i,id).reviewStatus='pending'},
    i=>{i.processTooling.poles.positive.tools.welded.horn.bodyDepth=3}]){
    const {filled}=data();change(filled);assert.equal(validateIntake(filled,'welded').ready,false);
  }
});
