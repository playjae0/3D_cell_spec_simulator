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
