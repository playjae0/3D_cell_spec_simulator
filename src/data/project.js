import demo from '../../examples/demo.json' with {type:'json'};
export const clone = x => structuredClone(x);
export const initial = () => ({...clone(demo),anchors:[]});
export const stages={assembly:'탭 용접 · 테이프 부착 후',packaged:'파우치 패키징 후',finished:'완성 셀 · 접힘 예시'};
export function validateProject(p){
  const err=m=>{throw Error(m);};
  if(p?.schemaVersion!==2||p.modelVersion!=='pouch-datum-cad-1'||p.unit!=='mm')err('지원하지 않는 형식입니다. v0.4 파일은 기준이 달라 자동 변환하지 않습니다.');
  if(!stages[p.stage]||typeof p.demo!=='boolean'||typeof p.notes!=='string')err('프로젝트 상태/설명 형식 오류');
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(!p.datumSet||!vector(p.datumSet.origin)||!Number.isFinite(p.datumSet.rotationZ))err('검사 데이텀 형식 오류');
  if(!p.view||!Array.isArray(p.view.hidden)||!p.view.hidden.every(x=>typeof x==='string')||typeof p.view.transparent!=='boolean'||typeof p.view.datums!=='boolean'||!['none','x','y','z'].includes(p.view.section?.axis)||!Number.isFinite(p.view.section.position))err('표시 상태 형식 오류');
  if(p.view.camera&&(!vector(p.view.camera.position)||!vector(p.view.camera.target)||!vector(p.view.camera.up)||!Number.isFinite(p.view.camera.zoom)||p.view.camera.zoom<=0))err('카메라 형식 오류');
  const walk=(v,template,path)=>{for(const [k,t] of Object.entries(template)){const x=v?.[k];if(Array.isArray(t)){if(!Array.isArray(x))err(path+'.'+k+' 목록 필요');if(t.length)for(const item of x)walk(item,t[0],path+'.'+k);}else if(t&&typeof t==='object')walk(x,t,path+'.'+k);else if(t!==null&&typeof x!==typeof t)err(path+'.'+k+' 형식 오류');else if(typeof t==='number'&&!Number.isFinite(x))err(path+'.'+k+' 유한한 수 필요');}};
  walk(p.product,demo.product,'product');
  if(p.anchors!==undefined){if(!Array.isArray(p.anchors))err('표면 기준점 목록 오류');const ids=new Set();for(const a of p.anchors){if(typeof a.id!=='string'||!a.id.startsWith('anchor.')||ids.has(a.id)||typeof a.name!=='string'||typeof a.baseFeatureId!=='string'||![a.u,a.v].every(x=>Number.isFinite(x)&&Math.abs(x)<=1))err('표면 기준점 형식 오류');ids.add(a.id);}}
  for(const side of ['positive','negative'])for(const list of ['tapes','joints']){const ids=p.product[side][list].map(x=>x.id);if(new Set(ids).size!==ids.length||ids.some(x=>!/^[-\w]+$/.test(x)))err(side+'.'+list+' ID는 중복 없는 영문/숫자/하이픈');}
  if(!Array.isArray(p.measurements)||p.measurements.length>20000)err('측정 목록은 20,000개 이하');
  const ids=new Set();for(const m of p.measurements){
    if(typeof m.id!=='string'||ids.has(m.id)||typeof m.name!=='string'||typeof m.group!=='string'||!stages[m.stage]||typeof m.visible!=='boolean'||!['distance','x','y','z','thickness','radius'].includes(m.mode)||!Number.isFinite(m.offset)||!['x','y','z'].includes(m.offsetAxis))err('치수 정의 형식 오류');
    ids.add(m.id);if(typeof m.a?.featureId!=='string'||(m.mode!=='radius'&&typeof m.b?.featureId!=='string'))err('치수 기준 ID 필요');
    if(!m.spec||typeof m.spec.note!=='string')err('스펙 설명 필요');
    for(const k of ['target','minus','plus','measured'])if(m.spec[k]!==null&&!Number.isFinite(m.spec[k]))err('스펙 숫자 오류');
    if(m.spec.minus<0||m.spec.plus<0)err('공차 크기는 음수 불가');
  }
  return p;
}
export function parseProject(text){if(text.length>12*1024*1024)throw Error('12 MB 이하 파일만 지원합니다');return validateProject(JSON.parse(text));}
export function measurement(name,a,b,mode,stage,extra={}){return {id:crypto.randomUUID(),name,group:'기본',stage,mode,a:{featureId:a},b:{featureId:b},visible:true,offset:mode==='y'?18:15,offsetAxis:mode==='y'?'x':'y',spec:{target:null,minus:null,plus:null,measured:null,note:''},...extra};}
export function demoMeasurements(stage){
  if(stage==='assembly')return [measurement('조립체 폭','stack.width.minus','stack.width.plus','y',stage),measurement('양극 · 뿌리–리드 끝','positive.tab.root','positive.lead.end','x',stage,{offset:-30}),measurement('음극 · 리드 폭','negative.lead.widthMinus','negative.lead.widthPlus','y',stage),measurement('양극 · 집속 두께','positive.tab.bottom','positive.tab.top','thickness',stage,{visible:false})];
  return [measurement('성형 개구 길이','pouch.forming.x.minus','pouch.forming.x.plus','x',stage,{offset:-55}),measurement('성형 개구 폭','pouch.forming.y.minus','pouch.forming.y.plus','y',stage,{offset:175}),measurement('실링 유효 폭','pouch.sealInner.y.plus','pouch.sealOuter.y.plus','y',stage,{offset:120}),measurement('상부 바닥 R','pouch.upper.floorR',null,'radius',stage,{offset:8,offsetAxis:'z'})];
}
export class History{
  constructor(){this.undoList=[];this.redoList=[];}
  push(p){this.undoList.push(clone(p));if(this.undoList.length>30)this.undoList.shift();this.redoList=[];}
  undo(current){if(!this.undoList.length)return null;this.redoList.push(clone(current));return this.undoList.pop();}
  redo(current){if(!this.redoList.length)return null;this.undoList.push(clone(current));return this.redoList.pop();}
}
