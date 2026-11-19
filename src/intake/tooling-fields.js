// 1.4: layout stores IDs/structure only. Values and provenance have ONE owner:
// parameters[]. Older 1.3 snapshots remain readable without inventing provenance.
import layout from './tooling-layout.json' with {type:'json'};
import types from './tooling-types.json' with {type:'json'};
import {toolingDictionary, get, set} from '../tooling/contract.js';
import {stageIds} from '../data/stages.js';
const clone = x => structuredClone(x);
export const trialVersion = '1.4';
export function toolingLayout(q=layout) {
  const x=clone(q);
  function clear(o){for(const [k,v] of Object.entries(o)){if(v&&typeof v==='object')clear(v);else if(!['id','version'].includes(k))o[k]=null;}}
  clear(x);delete x.example;return x;
}
function checkShape(value, reference, path='processTooling') {
  if(Array.isArray(reference)) {
    if(!Array.isArray(value))throw Error(path+': 배열 구조 필요');
    const ids=new Set();for(const v of value){if(!v?.id||ids.has(v.id)||/[.]/.test(v.id)||['__proto__','constructor','prototype'].includes(v.id))throw Error(path+': 고유한 부품 ID 필요');ids.add(v.id);checkShape(v,reference.find(r=>r.id===v.id)||reference[0],path+'.'+v.id);}
  } else if(reference && typeof reference==='object') {
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error(path+': 구조 누락');
    for(const k of Object.keys(reference)) {if(!Object.hasOwn(value,k))throw Error(path+'.'+k+': 구조 누락');checkShape(value[k],reference[k],path+'.'+k);}
    for(const k of Object.keys(value))if(!Object.hasOwn(reference,k))throw Error(path+'.'+k+': 미지원 구조');
  } else if(path.endsWith('.id')) {
    if(typeof value!=='string'||!value||/[.]/.test(value)||['__proto__','constructor','prototype'].includes(value))throw Error(path+': 고유 ID 필요');
  } else if(path.endsWith('.version')) {if(value!==1)throw Error(path+': 버전 1 필요');}
  else if(value!==null)throw Error(path+': 1.4의 값은 parameters에 입력하세요. 구조 필드는 null 유지');
}
function basis(f) {
  const key=f.path.split('.').at(-1);
  const rules={bodyDepth:'고정 치형 뿌리면 → 치형 반대쪽 블록 뒷면; 치형 접촉면은 이동하지 않음',height:'고정 공칭 접촉 치끝 면 → 치근; 치끝 면은 고정, 치근과 지지 블록 위치가 높이를 따라 이동',pitchU:'작업면 U 방향 이웃 치형 중심 → 중심',pitchV:'작업면 V 방향 이웃 치형 중심 → 중심',removedLength:'가용접 후 포일 끝 → 절단 후 끝; 탭 길이 방향 제거량',topDatumZ:'조립체 A(Z=0) → 고정 상면',bottomZ:'조립체 A(Z=0) → 고정 하면',centerLength:'탭측 실링 제품쪽 중앙 수평 구간의 두 접점 사이',transitionR:'중앙 수평 구간과 바깥 구간의 연결 원호 반경',cutY:'조립체 B(Y=0) → 가스방 절단선',foldLineY:'조립체 B(Y=0) → 잔여 플랜지 접힘선',rotation:'작업면 로컬 U축 → 배치 회전각',revision:'해당 공구 또는 공정 구성의 독립 개정 ID'};
  return rules[key] || f.datum+'; '+f.path+'의 로컬 '+key+' 정의. 공구 배치와 제품 좌표 변환은 CAD 계약 참조';
}
export function toolingFields(q) {
  checkShape(q,layout);
  return toolingDictionary({processTooling:q}).filter(f=>!/[.](id|version)$/.test(f.path)).map(f=>{
    const t=types[f.adapterPath.replace(/\.(spots|vertices)\.\d+\./g,'.$1.*.')];
    if(!t)throw Error(f.id+': 지원하지 않는 공구 필드');
    const p=f.path.split('.');let partId=f.id.slice(0,f.id.lastIndexOf('.'));
    if(p[1]==='poles' && p[3]==='tools')partId=`tool.${p[2]}.${p[4]}.${p[5]}.`+(p.at(-1)==='bodyDepth'?'body':'teeth');
    else if(p[1]==='poles' && ['gathering','foilCut'].includes(p[3]))partId=p[2]+'.tab';
    else if(p[1]==='sealBars')partId='tool.seal.'+p[2];
    return {...t,parameterId:f.id,adapterPath:f.adapterPath,partId,polarity:f.polarity,kind:'design',basis:basis(f),activeStages:stageIds,processScope:p.includes('foilCut')?'foil_trimmed → downstream':f.stage,requiredRule:'1.4 시험판은 공구 구성 전체를 명시적으로 검토',tooling:true};
  });
}
export function addToolingIntake(intake, product, blank=false) {
  if(!product.processTooling)return intake;
  intake.formatVersion=trialVersion;intake.dictionaryVersion='cell-intake-'+trialVersion;
  intake.processTooling=toolingLayout(product.processTooling);
  const old=new Map(intake.parameters.map(p=>[p.parameterId,p]));
  intake.parameters=intake.parameters.filter(p=>!p.parameterId.startsWith('processTooling.'));
  for(const f of toolingFields(intake.processTooling)){
    const value=blank?null:get(product,f.adapterPath);
    intake.parameters.push(old.get(f.parameterId)||{parameterId:f.parameterId,label:f.label,value:value??null,unit:f.unit,status:value==null?'missing':'extracted',reviewStatus:blank?'pending':'reviewed',sourceRefs:blank?[]:[{sourceId:'legacy-project',locator:f.adapterPath}],originalText:null,conversion:null,note:blank?'확인 전 null 유지':'기존 프로젝트 공구 값. 원문 검토 별도'});
  }
  return intake;
}
export function toolingFromParameters(intake, normalized) {
  const p={processTooling:clone(intake.processTooling)};
  for(const f of toolingFields(intake.processTooling))set(p,f.adapterPath,normalized[f.parameterId]??null);
  p.processTooling.example=intake.demo===true;
  return p.processTooling;
}
