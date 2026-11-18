import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateProject,parseProject} from '../src/data/project.js';
import {intakeFromProject,projectFromIntake,reconcileProject} from '../src/intake/adapter.js';
import {toolingDictionary} from '../src/tooling/contract.js';
import {fieldsFor} from '../src/data/bindings.js';
const sample=()=>JSON.parse(fs.readFileSync(new URL('../examples/process-tooling-r4.json',import.meta.url)));
test('R4 config roundtrip includes tool revision, placement, stable spot IDs and independent polarity',()=>{
 const p=sample();p.product.processTooling.poles.positive.tools.preweld.horn.x+=.4;
 const intake=intakeFromProject(p);assert.equal(intake.formatVersion,'1.3');
 const q=projectFromIntake(intake,'preweld');validateProject(q);assert.deepEqual(q.product.processTooling,p.product.processTooling);
 q.product.processTooling.poles.positive.laser.spots.splice(2,1);
 const z=reconcileProject(q);validateProject(z);assert.deepEqual(parseProject(JSON.stringify(z)).product.processTooling,z.product.processTooling);
 assert.equal(z.product.processTooling.poles.negative.laser.spots.length,6);
});
test('R4 forming and sealed intakes restore through the common stage contract',()=>{
 for(const s of ['film_formed','tab_sealed','package_folded']){const p=sample();p.stage=s;const q=projectFromIntake(intakeFromProject(p),s);validateProject(q);assert.deepEqual(q.product.processTooling,p.product.processTooling);}
});
test('legacy reopening never invents R4 source data; derived gathering fields are not editable at S2',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../examples/pouch-process.json',import.meta.url)));assert.equal(parseProject(JSON.stringify(p)).product.processTooling,undefined);
 const q=sample();assert(!fieldsFor(q.product,'preweld').some(f=>f.path==='positive.tab.thickness'));assert(!fieldsFor(q.product,'tab_sealed').some(f=>f.path.includes('toolFaces')));
 const dict=toolingDictionary(q.product);assert(dict.some(f=>f.id==='processTooling.poles.positive.tools.preweld.horn.pitchU'&&f.unit==='mm'&&f.polarity==='positive'));
});

test('model revisions freeze their entire tool snapshot while a newer revision changes placement',async()=>{
 const {ModelLibrary}=await import('../src/models/library.js');const lib=new ModelLibrary();
 const p=projectFromIntake(intakeFromProject(sample(),{modelId:'r4-freeze',modelName:'R4',revision:'1',baseRevision:null}),'preweld');lib.commit(p);
 const q=structuredClone(p);q.modelIdentity.revision=q.intake.model.revision='2';q.modelIdentity.baseRevision=q.intake.model.baseRevision='1';q.product.processTooling.poles.positive.tools.preweld.horn.x=1.9;lib.commit(reconcileProject(q));
 const opened=new ModelLibrary(JSON.parse(JSON.stringify(lib.data)));assert.equal(opened.data.models[0].revisions[0].project.product.processTooling.poles.positive.tools.preweld.horn.x,1.5);assert.equal(opened.data.models[0].revisions[1].project.product.processTooling.poles.positive.tools.preweld.horn.x,1.9);
});

test('tooling preview carries newly added specs, datums and camera without mutating either snapshot',async()=>{
 const {toolingPreviewProject}=await import('../src/tooling/contract.js');
 const current=sample(),draft=structuredClone(current);draft.product.processTooling.packaging.cutY=52;draft.stage='package_trimmed';
 current.measurements.push({id:'new-inspection',spec:{target:4,minus:.2,plus:.2}});current.notes='new inspection note';
 const merged=toolingPreviewProject(current,draft);assert.equal(merged.measurements[0].id,'new-inspection');assert.equal(merged.product.processTooling.packaging.cutY,52);assert.equal(current.product.processTooling.packaging.cutY,50);merged.measurements[0].spec.target=5;assert.equal(current.measurements[0].spec.target,4);
});
