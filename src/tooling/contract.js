import { stageContract } from '../data/stages.js';
export const clone = x => structuredClone(x);
export const get = (o,p) => p.split('.').reduce((v,k)=>v?.[k],o);
export function set(o,p,v){const a=p.split('.'),k=a.pop();a.reduce((v,k)=>v[k],o)[k]=v;}
export const labels={depth:'침입 깊이',topDatumZ:'고정 상면 데이텀 Z',bottomZ:'고정 하면 Z',method:'메인 용접 방식',x:'진입 X 기준 위치',y:'중심 Y 기준 위치',u:'작업면 U',v:'작업면 V',rotation:'배치 회전',length:'외곽 길이 U',width:'외곽 폭 V',cornerR:'외곽 코너 R',knurlLength:'너링 길이 U',knurlWidth:'너링 폭 V',pitchU:'너링 U 피치',pitchV:'너링 V 피치',direction:'너링 방향',height:'대표 치형 높이',tooth:'대표 치형',diameter:'공칭 스팟 직경',rows:'배열 행 수',columns:'배열 열 수',pitchX:'배열 X 피치',pitchY:'배열 Y 피치',row:'행 인덱스',column:'열 인덱스',dx:'개별 X 이동',dy:'개별 Y 이동',arc:'도착 구간 원호 처짐 (+내측 연장)',bridgeInnerR:'브리지 안쪽 R',gasOuterY:'가스 외곽 기록 기준 Y',finalSealY:'최종 실링 기록 기준 Y',cutY:'가스방 절단선 Y',foldLineY:'잔여 플랜지 접힘선 Y',foldAngle:'접힘 각도',foldR:'접힘 안쪽 R',id:'고유 ID',revision:'공구 개정',enabled:'사용',openingLength:'컵 입구 길이',openingWidth:'컵 입구 폭',floorR:'바닥 전이 R',rimR:'입구 연결 R',planR:'평면 코너 R',filmThickness:'필름 두께',seamGap:'닫힘 상하 필름 간격'};
export function fieldsForObject(object,prefix,context={}) {
 const fields=[];
 function walk(v,path){for(const [k,x] of Object.entries(v)){const id=path+'.'+k;if(x&&typeof x==='object')walk(x,id);else fields.push({id,path:id,label:labels[k]||k,value:x,unit:typeof x==='number'?(/rotation|direction|Angle/.test(k)?'deg':/^(version|rows|columns|row|column)$/.test(k)?'1':'mm'):'',datum:context.datum||'제품 A/B/C; U=작업면 길이, V=폭',stage:context.stage||'공구 적용 공정',polarity:context.polarity||'공통',kind:'design',...context});}}walk(object,prefix);return fields;
}
export function toolingDictionary(product){
 if(!product.processTooling)return [];
 return fieldsForObject(product.processTooling,'processTooling').map(f=>{
  const p=f.path.split('.'),polarity=p.find(x=>x==='positive'||x==='negative')||(['positive','negative'].find(x=>p.some(k=>k.startsWith(x+'_'))))||'common';
  let id=f.id;
  const spotIndex=p.indexOf('spots');if(spotIndex>=0){const item=get(product,p.slice(0,spotIndex+2).join('.'));id=p.map((x,i)=>i===spotIndex+1?item.id:x).join('.');}
  const vertexIndex=p.indexOf('vertices');if(vertexIndex>=0){const item=get(product,p.slice(0,vertexIndex+2).join('.'));id=p.map((x,i)=>i===vertexIndex+1?item.id:x).join('.');}
  return {...f,id,adapterPath:f.path,polarity,stage:p.includes('preweld')?'preweld':p.includes('welded')||p.includes('laser')||p.includes('method')?'welded → downstream':p.includes('sealBars')?'tab_sealed → package_folded':p.includes('gathering')?'preweld → downstream':'film_formed → package_folded'};
 });
}
export function validateTooling(c){
 if(c===undefined)return;
 if(c?.version!==1||!c.poles||!c.sealBars||!c.packaging)throw Error('R4 공구 스냅샷 구조 오류');
 for(const side of ['positive','negative']){
  const p=c.poles[side];if(!p?.gathering||!p.tools?.preweld?.horn||!p.tools?.welded?.anvil||!['ultrasonic','laser'].includes(p.method)||!Array.isArray(p.laser?.spots))throw Error(side+': 공정 공구 설정 누락');
  const ids=p.laser.spots.map(s=>s.id);if(ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)throw Error(side+': 스팟 ID 중복/누락');
 }
 for(const f of fieldsForObject(c,'processTooling'))if(typeof f.value==='number'&&!Number.isFinite(f.value))throw Error(f.id+': 유한수 필요');
}
export function syncTooling(intake,product){
 if(product.processTooling){intake.processTooling=clone(product.processTooling);intake.formatVersion='1.3';intake.dictionaryVersion='cell-intake-1.3';}
 else delete intake.processTooling;
 return intake;
}
export const r4Stages=Object.keys(stageContract).filter(k=>stageContract[k].r4);

// Geometry drafts must never replace inspections or view edits made after the draft opened.
export function toolingPreviewProject(current, draft) {
  return {...clone(current), product:clone(draft.product), stage:draft.stage};
}
