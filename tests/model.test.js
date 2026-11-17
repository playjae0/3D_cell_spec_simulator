import {test} from 'node:test';import assert from 'node:assert/strict';import {defaults,parts,measure,initial,parse,validate} from '../src/model.js';
const ref=(partId,uvw)=>({partId,uvw});
test('known body length and projected versus direct distance',()=>{const ps=parts({...defaults,radius:0},'S3');const m={a:ref('body',[-1,-1,0]),b:ref('body',[1,1,0]),axis:'x'};assert.equal(measure(m,ps),200);m.axis='distance';assert.equal(measure(m,ps),Math.hypot(200,65));});
test('lead end reference follows parameter change',()=>{const m={a:ref('body',[1,0,0]),b:ref('leadB',[1,0,0]),axis:'x'};assert.equal(measure(m,parts(defaults,'S3')),22);assert.equal(measure(m,parts({...defaults,leadLength:30},'S3')),30);});
test('missing reference is invalid, never reassigned',()=>assert.equal(measure({a:ref('tapeA',[0,0,0]),b:ref('body',[0,0,0]),axis:'x'},parts(defaults,'S3')),null));
test('roundtrip supports many measurements and visibility',()=>{const s=initial();s.measurements=Array.from({length:1000},(_,i)=>({id:String(i),name:'폭',group:'외형',stage:'S3',axis:'y',a:ref('body',[0,-1,0]),b:ref('body',[0,1,0]),offset:15,visible:i%2===0}));assert.deepEqual(parse(JSON.stringify(s)),s);});
test('reject invalid inputs and future schema',()=>{assert.throws(()=>validate({...defaults,radius:100}));assert.throws(()=>validate({...defaults,leadOffset:100}));assert.throws(()=>parse(JSON.stringify({...initial(),schemaVersion:99})));});
test('three process part identities',()=>{assert.ok(parts(defaults,'S1').some(x=>x.id==='weldA'));assert.ok(!parts(defaults,'S3').some(x=>x.id==='weldA'));assert.ok(parts(defaults,'S2').find(x=>x.id==='flange').size[1]>defaults.width);});

test('radius change invalidates removed corner reference',()=>{const m={a:ref('body',[1,1,0]),b:ref('body',[0,0,0]),axis:'x'};assert.equal(measure(m,parts(defaults,'S3')),null);});
