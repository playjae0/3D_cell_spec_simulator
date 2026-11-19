import { frameBounds } from '../viewer/framing.js';
import { Viewer } from '../viewer/viewer.js';
import { componentModel, dimensions, dimensionNames } from './contract.js';
import { renderParts } from '../overview/part-images.js';
import { designIdentity } from '../preview/identity.js';

export function mountComponentScenes(api) {
 const root=document.getElementById('component-scenes');
 root.innerHTML=`<header><h2 id="standalone-title">단품 CAD</h2><span id="standalone-mode"></span></header>
 <div class="component-viewbar"><button data-component-view="iso">입체</button><button data-component-view="work">작업면 정면</button><button data-component-view="side">측면</button><button id="component-fit">맞춤</button><select id="component-dimension" aria-label="단품 치수"></select><button id="component-edit">선택 치수 편집</button></div>
 <div id="standalone-viewport"></div><div id="component-plan" hidden></div><p id="component-datum"></p><p id="component-scene-status" role="status"></p>
 <section class="finished-reference"><header><h3 id="reference-title">완성 셀 · 같은 모델 / 개정</h3><button id="application-toggle">적용 공정 보기</button></header><div id="reference-viewport"></div><p id="reference-status" role="status"></p></section>
 <dialog id="component-dimension-editor"><form id="component-dimension-form"><h3>3D 치수 편집</h3><label>연결 치수<select id="component-edit-field"></select></label><label>값 (mm)<input id="component-edit-value" type="number" step="any" required></label><p id="component-edit-basis"></p><button type="button" id="component-edit-cancel">취소</button><button id="component-edit-submit" type="submit">CAD 미리보기</button></form></dialog>`;
 const $=id=>document.getElementById(id);
 let selection=null, source=null, active=[],generation=0, application=false, displayedKey='',chosen=null;
 const makeState=m=>({...api.project(),stage:m.stage,measurements:[],view:{...api.project().view,hidden:[],groupHidden:{},transparent:false,datums:false,internalOnly:false,showDimensions:true,section:{axis:'none',position:0}}});
 const viewer=new Viewer($('standalone-viewport'),{onSelect:(id,featureId)=>{const candidates=active.filter(d=>d.partId===id&&(!featureId||[d.a,d.b].includes(featureId)));if(candidates.length)choose(candidates[0].field);},onPick:()=>{},onEdit:hit=>edit(hit.measurement?.field,hit.featureId),onDimensionSelect:m=>choose(m.field)});
 const reference=new Viewer($('reference-viewport'),{onSelect:id=>reference.select(id),onPick:()=>{}});
 function camera(view='iso') {
  viewer.fit();
  if(view==='iso'&&selection?.kind==='horn') {const c=viewer.getCamera();c.position[2]=2*c.target[2]-c.position[2];viewer.restore(c);}
  else if(view==='work')viewer.view(selection?.kind==='horn'?'back':'front');
  else if(view==='side')viewer.view('side');
  if(view!=='iso')viewer.restore(frameBounds(viewer.data.parts.map(p=>p.bounds),viewer.getCamera(),[{width:$('standalone-viewport').clientWidth,height:$('standalone-viewport').clientHeight}]));
 }
 function choose(field) {
  const dim=active.find(d=>d.field===field);if(!dim)return;
  chosen=field;$('component-dimension').value=field;
  viewer.state.measurements=active.filter(d=>d.field===field).map(d=>({id:d.field,field:d.field,name:dimensionNames[d.key],stage:source.stage,visible:true,mode:'distance',a:{featureId:d.a},b:{featureId:d.b},offsetAxis:'y',offset:d.key==='height'?1:0.6}));
  viewer.select(null);viewer.selectedFeature=dim.a;viewer.draw();
  api.selectField?.(field);
 }
 function edit(field,featureId) {
  const candidates=field?active.filter(d=>d.field===field):featureId?active.filter(d=>[d.a,d.b].includes(featureId)):active;
  if(!candidates.length)return;
  choose(candidates[0].field);
  if(!api.editable()){$('component-scene-status').textContent='읽기 전용 · 치수와 기준 선택 가능 · 편집은 로컬 CAD 앱에서 실행하세요.';return;}
  $('component-edit-field').replaceChildren(...candidates.map(d=>new Option(dimensionNames[d.key]+' · '+d.field,d.field)));
  const fill=()=>{const d=active.find(d=>d.field===$('component-edit-field').value);$('component-edit-value').value=api.fieldValue(d.field)??d.value;$('component-edit-basis').textContent='치끝 접촉면 고정 · 같은 극/공정/공구의 왼쪽 사양과 연결 · 가상값';};
  $('component-edit-field').onchange=fill;fill();$('component-dimension-editor').showModal();
 }
 $('component-edit').onclick=()=>edit(chosen);
 $('component-dimension').onchange=e=>choose(e.target.value);
 $('component-edit-cancel').onclick=()=>$('component-dimension-editor').close();
 $('component-dimension-form').onsubmit=async e=>{e.preventDefault();if(!api.editable())return;const v=$('component-edit-value').valueAsNumber;if(!Number.isFinite(v))return;const path=$('component-edit-field').value;$('component-dimension-editor').close();await api.edit(path,v);};
 root.querySelectorAll('[data-component-view]').forEach(el=>el.onclick=()=>camera(el.dataset.componentView));
 $('component-fit').onclick=()=>camera();
 async function drawReference(token) {
  $('reference-status').textContent='같은 설계의 CAD 참조 조회 중…';
  const p=api.project();const stage=application?(selection.part==='ultrasonic'?selection.ws:selection.part==='seal'?'tab_sealed':selection.part==='laser'?'welded':selection.part==='pouch'?'assembly_loaded_open':'assembly'):(p.product.processTooling?'package_folded':p.product.pouchProcess?'folded':'finished');
  try{
   const m=await api.reference(stage);if(token!==generation)return;
   const state=makeState(m);state.view.transparent=true;reference.setModel(m,state);reference.fit();
   const side=selection.side;
   const ids=m.parts.filter(p=>['ultrasonic','laser'].includes(selection.part)?p.id.startsWith(side+'.joint.')||p.id.startsWith(side+'.preweld.')||p.id.startsWith(side+'.laser.'):
     selection.part==='seal'?p.id==='seal.'+selection.location:componentModel(m,selection).parts.some(x=>x.id===p.id)).map(p=>p.id);
   reference.select(null,ids);
   $('reference-title').textContent=(application?'적용 공정':'완성 셀')+' · '+api.stageLabel(stage);
   $('reference-status').textContent=(ids.length?'적용 부위 강조 · ':'이 상태의 적용 부위 추적 기록 없음 · ')+(api.pending()?'미적용 입력 전 확정 설계 · ':'')+(p.modelIdentity?.modelId||p.product.id)+' / '+(p.modelIdentity?.revision||p.intake?.model?.revision||'개정 미지정');
  }catch(e){if(token===generation){reference.setModel({parts:[],features:{},paths:[]},makeState({stage}));$('reference-status').textContent=e.message;}}
 }
 $('application-toggle').onclick=()=>{application=!application;$('application-toggle').textContent=application?'완성 셀 보기':'적용 공정 보기';drawReference(++generation);};
 return {
  viewer,
  async show(m,sel,{reset=false}={}) {
   source=m;selection=sel;const token=++generation;
   const key=JSON.stringify(sel);if(reset||key!==displayedKey){application=false;$('application-toggle').textContent='적용 공정 보기';}const fit=reset||key!==displayedKey;displayedKey=key;
   $('standalone-title').textContent=sel.part==='ultrasonic'?`${sel.side==='positive'?'양극':'음극'} · ${api.stageLabel(sel.ws)} · ${sel.kind==='horn'?'혼':'엔빌'} 접촉부`:api.title();
   $('standalone-mode').textContent=api.editable()?'실시간 CAD · 가상 예시 mm':'읽기 전용 · 사전 계산 CAD';
   const seal=sel.part==='seal';$('standalone-viewport').hidden=seal;$('component-plan').hidden=!seal;
   $('component-datum').textContent='';$('component-scene-status').textContent='';
   const sub=componentModel(m,sel);active=dimensions(sub);
   const state=makeState(m);viewer.setModel(sub,state);
   $('component-dimension').replaceChildren(...active.map(d=>new Option(dimensionNames[d.key]+' · '+d.value+' mm',d.field)));
   $('component-edit').disabled=!active.length||!api.editable();$('component-dimension').disabled=!active.length;
   if(active.length){choose(active.find(d=>d.field===chosen)?.field||active[0].field);const meta=sub.parts[0].meta;$('component-datum').textContent=`${meta.datum.name} · 치끝 0.000 / 치근 ${(meta.datum.rootZ-meta.datum.tipZ).toFixed(3)} mm · ${meta.toothCount}개 · ${meta.scope}`;}
   else if(sel.part==='laser'&&!sub.parts.some(p=>p.id.includes('.laser.')))$('component-scene-status').textContent='이 극의 적용 방식은 초음파입니다. 기록된 레이저 스팟 없음 · 신규 배열 편집은 후속 범위';
   else if(!seal&&!sub.parts.length)$('component-scene-status').textContent='이 설계·공정에는 단품 CAD 기록이 없습니다.';
   if(fit&&sub.parts.length)requestAnimationFrame(()=>{if(token===generation)camera();});
   await drawReference(token);
  },
  clear(){generation++;},
 };
}

const imageCache=new Map();
export async function populateComponentCards(host,api) {
 const key=designIdentity(api.project());host.dataset.design=key;
 const jobs=[['tab','assembly'],['lead','assembly'],['tapes','assembly'],['pouch','film_formed'],['gathering','preweld'],['preweld','preweld'],['welded','welded'],['laser','welded'],['seal','tab_sealed']];
 for(const [part,stage] of jobs){
  const buttons=[...host.querySelectorAll(`[data-component="${part}"]`)];
  if(!buttons.length)continue;
  try{
   const m=await api.reference(part==='pouch'&&!api.project().product.processTooling?(api.project().product.pouchProcess?'pouch_formed':'packaged'):stage);
   if(host.dataset.design!==key)return;
   for(const button of buttons){
    const side=button.dataset.side||'positive',kind=button.dataset.kind||'horn';
    const sel={part:['preweld','welded'].includes(part)?'ultrasonic':part,side,ws:part,kind};
    let parts=componentModel(m,sel).parts;
    if(part==='seal')parts=m.parts.filter(p=>p.id===`tool.seal.${side}_upper`);
    if(part==='laser'&&!parts.some(p=>p.id.includes('.laser.')))parts=[];
    const cacheKey=key+':'+part+':'+side+':'+kind;
    let img=button.querySelector('img');if(!img){img=new Image();img.alt='';button.prepend(img);}
    if(part==='seal' && m.toolingResults?.seals?.[side+'_upper']?.crossSections?.length){
      const bar=m.toolingResults.seals[side+'_upper'],section=bar.crossSections[0];
      const pts=bar.base.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0-3} ${-y0-h-3} ${w+6} ${h+14}"><g fill="#b5ded1" stroke="#277469" stroke-width=".3">${bar.base.map(wire=>`<polygon points="${wire.map(([u,v])=>[u,-v].join(',')).join(' ')}"/>`).join('')}</g><text x="${x0}" y="${-y0+7}" font-size="3">단면 폭 ${section.width.toFixed(2)} · 홈 ${section.recessDepth.toFixed(2)} mm</text><path d="M${section.u} ${-y0-h} V${-y0}" stroke="#c66a28" stroke-width=".4"/></svg>`;
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);button.querySelector('small').textContent='공칭 작업면 평면 · 중앙 단면 치수';
    }else if(parts.length){if(!imageCache.has(cacheKey))imageCache.set(cacheKey,renderParts(parts,260,140,sel.part==='ultrasonic'&&kind==='horn'));img.src=imageCache.get(cacheKey);button.querySelector('small').textContent='같은 모델 · 실제 CAD';}
    else {img.remove();button.querySelector('small').textContent=part==='laser'?'이 극은 초음파 · 스팟 기록 없음':'이 모델의 단품 기록 없음';}
   }
  }catch(e){if(host.dataset.design===key)for(const button of buttons)button.querySelector('small').textContent=e.message;}
 }
 if(imageCache.size>100)imageCache.clear();
}
