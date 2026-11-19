import test from 'node:test';
import assert from 'node:assert/strict';
import {placementField,componentModel} from '../src/components/contract.js';
import {writeField} from '../src/data/bindings.js';
import {initial,parseProject} from '../src/data/project.js';
import {reconcileProject} from '../src/intake/adapter.js';
test('component intrinsic fields and assembly placement have distinct owners',()=>{
 for(const path of ['positive.lead.start','positive.tab.rootZ','positive.tapes.0.offsetY','processTooling.poles.negative.tools.preweld.anvil.rotation'])assert.equal(placementField(path),true,path);
 for(const path of ['positive.lead.width','processTooling.poles.positive.tools.welded.horn.pitchU','processTooling.packaging.cups.lower.x','processTooling.sealBars.positive_upper.relief.u'])assert.equal(placementField(path),false,path);
});
test('lead assembly move preserves legacy relative sealant offset and save/reopen',()=>{
 const p=initial(),pole=p.product.positive,a=pole.leadFilm.start-pole.lead.start,neg=structuredClone(p.product.negative);
 writeField(p.product,'positive.lead.start',pole.lead.start+.2);
 assert.equal(Math.round((pole.leadFilm.start-pole.lead.start)*1e8),Math.round(a*1e8));assert.deepEqual(p.product.negative,neg);
 const q=parseProject(JSON.stringify(reconcileProject(p)));assert.deepEqual(q.product,p.product);
});
test('standalone subset keeps component IDs and world datum values without re-centering',()=>{
 const m={parts:[{id:'positive.lead',bounds:{min:[3,4,5]}},{id:'positive.leadFilm'},{id:'negative.lead'}],paths:[],features:{'positive.lead.start':{partId:'positive.lead',point:[3,4,5]}}};
 const sub=componentModel(m,{part:'lead',side:'positive'});assert.equal(sub.parts.length,2);assert.equal(sub.parts[0],m.parts[0]);assert.equal(sub.features['positive.lead.start'],m.features['positive.lead.start']);
});

import {componentGroups,components} from '../src/overview/catalog.js';
import {sectionCenter} from '../src/components/section.js';
import {stageCode,groups} from '../src/overview/panel.js';
test('foil states belong to cell parts and cutting retains the old process codes',()=>{
 assert.deepEqual(componentGroups[0][1].slice(0,3),['tab','tab_preweld','tab_trimmed']);
 assert.equal(componentGroups[1][1].includes('gathering'),false);
 assert.equal(components.gathering,undefined);assert.equal(stageCode('welded'),'S3');assert.equal(stageCode('foil_trimmed'),'S2C');
 assert.ok(groups[0][1].some(([s])=>s==='foil_trimmed'));
});
test('component section centers use tool datum or cup opening, not visual bounding boxes',()=>{
 const m={parts:[{id:'tool.horn',meta:{datum:{origin:[-136,-1,.3]}}},{id:'pouch.lower.pocket',bounds:{min:[-100,-500,-5]}}],features:{'pouch.lower.pocket.opening':{point:[0,2,-1]}}};
 assert.deepEqual(sectionCenter(m,'tool.horn'),[-136,-1,.3]);assert.deepEqual(sectionCenter(m,'pouch.lower.pocket'),[0,2,-1]);
});

import {ownerForPath} from '../src/overview/catalog.js';
test('product dimension links route gathering inputs to the gathered foil component',()=>{
 assert.equal(ownerForPath('positive.tab.rootLength'),'tab');
 assert.equal(ownerForPath('positive.tab.gatheredLength'),'tab_preweld');
 assert.equal(ownerForPath('negative.tab.edgeR'),'tab_preweld');
});
