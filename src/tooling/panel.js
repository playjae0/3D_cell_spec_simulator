import { placementField } from "../components/contract.js";
import { sealSection } from "../components/seal-section.js";
import { detailImage } from "../overview/part-images.js";
import { tabSealPlan } from "./seal-plan.js";
import {clone,get,set,labels,fieldsForObject,toolingDictionary,r4Stages,toolingPreviewProject} from './contract.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number.isFinite(x)?x.toFixed(3):'—';
export function mountTooling(api){
 const root=document.getElementById('tooling-pane');
 let paired=true, drawVersion=0;
 let project=null,result=null,part='ultrasonic',side='positive',ws='preweld',kind='horn',location='positive',half='upper',pending=false,working=false,token=0,validated=null;
 root.innerHTML=`<div class="tooling-intro"><b>공정·요소기술 R4</b><p>가상 예시 · mm · 공칭 형상. 설계 / 계산 / 실측을 구분합니다.</p></div><div id="r4-controls" hidden><div class="tooling-nav"><select id="r4-mode" aria-label="요소기술 종류"><option value="ultrasonic">혼·엔빌 작업면</option><option value="gathering">가용접 포일 집속</option><option value="laser">레이저 스팟</option><option value="seal">실링바 평면 윤곽</option><option value="pouch">한 장 필름·가스방</option></select><select id="r4-side" aria-label="요소기술 극"><option value="positive">양극 · 독립</option><option value="negative">음극 · 독립</option></select><select id="r4-wstage" aria-label="공구 적용 공정"><option value="preweld">S2 가용접 공구</option><option value="welded">S3 메인 용접 공구</option></select><select id="r4-kind" aria-label="혼 또는 엔빌"><option value="horn">혼 (상부)</option><option value="anvil">엔빌 (하부)</option></select><select id="r4-location" aria-label="실링 위치"><option value="positive">양극 탭측</option><option value="negative">음극 탭측</option><option value="gas">가스방 외곽</option><option value="final">몸체 최종 실링</option></select><select id="r4-half" aria-label="실링바 상하"><option value="upper">상부 바</option><option value="lower">하부 바</option></select></div><div id="r4-basis" class="small"></div><div id="r4-plan"></div><div id="r4-results" aria-live="polite"></div><div class="r4-actions"><button id="r4-preview">CAD 미리보기</button><button id="r4-apply" class="primary" disabled>미리보기 적용</button><button id="r4-cancel">취소 · 확정 복원</button></div><p id="r4-message" role="status"></p><div id="r4-special"></div><div id="r4-fields"></div><button id="r4-dictionary">R4 필드·명칭 양식 내려받기</button></div>`;
 const $=id=>document.getElementById(id),value=()=>project?.product.processTooling;
 const editable=()=>api.editable();
 function mark(){if(!editable())return;token++;working=false;$('r4-preview').disabled=false;pending=true;validated=null;$('r4-apply').disabled=true;api.lock(true);$('r4-message').textContent='설계 입력 변경 · 계산/평면은 마지막 미리보기입니다. CAD 미리보기를 실행하세요.';}
 function reset(){token++;project=clone(api.project());result=api.model();pending=false;working=false;validated=null;$('r4-apply').disabled=true;$('r4-preview').disabled=!editable();$('r4-message').textContent='';render();}
 function fields(object,prefix){return fieldsForObject(object,prefix).filter(f=>!['location','half','example','version'].includes(f.id.split('.').at(-1)) && (!api.componentMode() || !placementField(f.id)));}
 function input(f){const k=f.id.split('.').at(-1),opts=k==='method'?{ultrasonic:'초음파',laser:'레이저'}:k==='tooth'?{pyramid:'피라미드',ridge:'평행 리지'}:null;
 if(f.id.startsWith('pouchProcess.sheets.'))f={...f,label:(f.id.includes('.upper.')?'상부 ':'하부 ')+(k==='depth'?'성형 깊이':f.label)};
 if(f.id.includes('.cups.')&&['x','y'].includes(k))f={...f,label:'필름 내 컵 중심 '+k.toUpperCase()+' · 필름 기준'};
 const name=esc(f.id);let control=opts?`<select data-r4-field="${name}" aria-label="${name}">${Object.entries(opts).map(([v,l])=>`<option value="${v}" ${v===f.value?'selected':''}>${l}</option>`).join('')}</select>`:typeof f.value==='boolean'?`<input type="checkbox" data-r4-field="${name}" aria-label="${name}" ${f.value?'checked':''}>`:`<input type="${typeof f.value==='number'?'number':'text'}" step="any" data-r4-field="${name}" aria-label="${name}" value="${esc(f.value)}" ${k==='id'?'readonly':''}>`;
 return `<label class="r4-field"><span>${esc(f.label)} <small>${f.unit}</small><code>${name.replace('processTooling.','')}</code></span>${control}</label>`;}
 function render(){
 const q=value();$('r4-controls').hidden=!q;root.classList.toggle('r4-active',!!q);if(!q){$('r4-results').replaceChildren();return;}
 $('r4-side').hidden=['seal','pouch'].includes(part);$('r4-wstage').hidden=part!=='ultrasonic';$('r4-kind').hidden=part!=='ultrasonic';$('r4-location').hidden=part!=='seal';$('r4-half').hidden=part!=='seal';
 let fs=[],special='',basis='';const pre='processTooling.poles.'+side;
 if(part==='ultrasonic'){
  fs=fields({bodyDepth:3,...q.poles[side].tools[ws][kind]},pre+'.tools.'+ws+'.'+kind);basis=`${side} / ${ws} / ${kind} · 공칭 접촉/치끝 면 고정. 피치 격자는 작업면 중심에서 배열합니다. 치근 뒤에 지지 블록을 생성합니다. 블록 깊이는 가상 예시이며 제품 압흔은 해석하지 않습니다.`;
  special=api.componentMode()?'':'<button id="r4-half-pitch">선택 공구만 +½ U 피치 이동</button>';
 }else if(part==='gathering'){
  fs=fields(q.poles[side].gathering,pre+'.gathering');basis='집속 잔류 두께와 포일 경로 · smoothstep 포락 예시, 실제 변형 해석 아님';
 }else if(part==='laser'){
  fs=[{...fields({method:q.poles[side].method},pre)[0]},...fields(q.poles[side].laser,pre+'.laser').filter(f=>!f.id.includes('.spots.'))];basis='S3 이후 메인 방식=레이저일 때 표시 · 탭–리드 실제 겹침면 기준. 빨강은 중심이 내부여도 원주가 겹침 밖인 점입니다. 배열 변경 후에도 기존 ID 유지.';
  special='<button id="r4-grid">행×열 배열 재구성</button><button id="r4-add-spot">스팟 1개 추가</button>'+q.poles[side].laser.spots.map((s,i)=>`<details><summary>${esc(s.id)} · 행 ${s.row}, 열 ${s.column}</summary>${fields(s,pre+'.laser.spots.'+i).map(input).join('')}<button data-r4-remove="${esc(s.id)}">${esc(s.id)} 삭제</button></details>`).join('');
 }else if(part==='seal'){
  const f=q.sealBars[location+'_'+half], prefix='processTooling.sealBars.'+location+'_'+half;
  if (f.tabProfile) {
   fs=[...fields(f.tabProfile,prefix+'.tabProfile').filter(field=>/\.(centerLength|transitionR)$/.test(field.id)),...fields(f.relief,prefix+'.relief')];
   basis='접선 프로파일 · 리드 중심 기준 · L은 중앙 수평부의 두 접점 간 거리. R은 전이 접선 원호입니다. 중앙·바깥 폭과 리드 쪽 외측선은 고정합니다.';
   const pairAvailable = q.sealBars[location+'_upper'].tabProfile && q.sealBars[location+'_lower'].tabProfile;
   special=pairAvailable ? `<label><input id="r4-paired-tab" type="checkbox" ${paired?'checked':''}> 상·하 바의 L·R 함께 편집</label>` : '';
  } else {
   fs=fields(f,prefix).filter(field=>!field.id.includes('.vertices.'));
   basis='기존 꼭짓점·원호 형식 · U–V 닫힌 작업면. 각 점의 원호 값은 직전 점→현재 점의 현에서 왼쪽 방향 처짐(mm), 0=직선. 제품 면적=상하 작업면 중첩∩남아 있는 필름.';
   special='<h4>작업면 윤곽 · 직선/원호</h4>'+f.vertices.map((v,i)=>`<details open><summary>${esc(v.id)}</summary>${fields({...v,arc:v.arc||0},prefix+'.vertices.'+i).map(input).join('')}</details>`).join('');
  }
 }else{
  fs=fields(q.packaging,'processTooling.packaging').filter(f=>!['gasOuterY','finalSealY'].includes(f.id.split('.').at(-1)));
  for(const h of ['lower','upper'])fs.push(...fields(project.product.pouchProcess.sheets[h],'pouchProcess.sheets.'+h).filter(f=>!f.id.includes('.blank.')&&!f.id.includes('.cut.')));
  basis='필름 평면 Z=−브리지 R, 길이 X, 브리지 중심선은 −Y측. 가스방은 반대 +Y측. 두 컵 크기는 독립 입력. 한 장 필름 두께와 브리지 접합 변은 일치해야 합니다.';
  special='';
 }
 if(part==='laser' && api.componentMode()) {special='';basis='기록된 스팟과 기존 설정 보존 · 새 레이저 배열 편집은 후속 범위';}
 $('r4-basis').textContent=basis;$('r4-fields').innerHTML=fs.map(input).join('');$('r4-special').innerHTML=special;
 for (const el of root.querySelectorAll('[data-r4-field], [data-r4-remove], #r4-half-pitch, #r4-add-spot, #r4-grid, #r4-dictionary, #r4-preview, #r4-cancel'))
  el.disabled = !editable() || (part==='laser' && api.componentMode());
 for (const el of root.querySelectorAll('[data-r4-stage]'))
  el.disabled = !editable() && !api.recorded();
 const pair=$('r4-paired-tab');
 if (pair) {
  pair.disabled=!editable();
  pair.onchange=()=>{paired=pair.checked;};
 }
 root.querySelectorAll('[data-r4-field]').forEach(el=>el.oninput=()=>{
  if(!editable())return;
  const path=el.dataset.r4Field;
  const value=el.type==='checkbox'?el.checked:el.type==='number'?(el.value.trim()===''?NaN:Number(el.value)):el.value;
  set(project.product,path,value);
  if (pair && paired && path.includes('.tabProfile.')) {
   const other=half==='upper'?'lower':'upper';
   set(project.product,path.replace(location+'_'+half,location+'_'+other),value);
  }
  mark();
 });
 root.querySelectorAll('[data-r4-remove]').forEach(el=>el.onclick=()=>{if(!editable())return;const l=q.poles[side].laser;l.spots=l.spots.filter(s=>s.id!==el.dataset.r4Remove);mark();render();});
 root.querySelectorAll('[data-r4-stage]').forEach(el=>el.onclick=()=>{if(api.recorded())return api.openStage(el.dataset.r4Stage);if(!editable())return;project.stage=el.dataset.r4Stage;mark();preview();});
 if($('r4-half-pitch'))$('r4-half-pitch').onclick=()=>{if(!editable())return;const f=q.poles[side].tools[ws][kind];f.x+=f.pitchU/2;mark();render();};
 if($('r4-add-spot'))$('r4-add-spot').onclick=()=>{if(!editable())return;q.poles[side].laser.spots.push({id:'spot-'+crypto.randomUUID().slice(0,8),row:0,column:0,dx:0,dy:0});mark();render();};
 if($('r4-grid'))$('r4-grid').onclick=()=>{if(!editable())return;const l=q.poles[side].laser;if(!Number.isInteger(l.rows)||!Number.isInteger(l.columns)||l.rows<1||l.columns<1||l.rows*l.columns>2500){$('r4-message').textContent='행열은 양의 정수, 2500개 이하입니다.';return;}l.spots=Array.from({length:l.rows*l.columns},(_,i)=>l.spots.find(s=>s.row===Math.floor(i/l.columns)&&s.column===i%l.columns)||{id:'spot-'+crypto.randomUUID().slice(0,8),row:Math.floor(i/l.columns),column:i%l.columns,dx:0,dy:0});mark();render();};
 for(const id of ['r4-mode','r4-side','r4-wstage','r4-kind','r4-location','r4-half'])$(id).dataset.prior=$(id).value;
 for(const label of root.querySelectorAll('.r4-field')){
   const el=label.querySelector('[data-r4-field]');
   const key=el?.dataset.r4Field.split('.').at(-1);
   if(!['transitionR','centerLength'].includes(key)){label.onclick=el.onfocus=()=>api.selectField?.(el.dataset.r4Field);continue;}
   const emphasize=()=>{for(const g of root.querySelectorAll('[data-seal-guide]'))
     g.classList.toggle('chosen-guide',g.dataset.sealGuide===key);};
   label.onclick=el.onfocus=emphasize;
 }
 draw();
 }
 async function draw(){
 const version=++drawVersion;
 const physicalStage=api.project().stage;
 const appliedAt=location==='gas'?4:location==='final'?5:3;
 const toolOnly=part==='seal' && r4Stages.indexOf(physicalStage)<appliedAt;
 let source=result;
 const needed=part==='seal' && (!source?.toolingResults?.seals?.[location+'_'+half] || toolOnly) ? r4Stages[appliedAt] :
   part==='ultrasonic' ? ws : part==='laser' ? 'welded' :
   part==='pouch' && !source?.toolingResults?.packaging ? 'film_formed' :
   part==='gathering' && !source?.toolingResults?.poles?.[side] ? 'preweld' : null;
 $('r4-plan').replaceChildren();$('r4-results').replaceChildren();
 if(needed && needed!==source?.stage && api.isOpen()){
   $('r4-plan').textContent=api.recorded()?'단품 CAD 기록 조회 중…':'단품 CAD 계산 중…';
   try { source=await api.reference(needed); }
   catch(error){if(version===drawVersion)$('r4-plan').textContent=error.message;return;}
   if(version!==drawVersion)return;
 }
 if(source && api.isOpen())api.component(source,{part,side,ws,kind,location,half});
 const planHost=document.getElementById('component-plan');if(api.componentMode())planHost.append($('r4-plan'),$('r4-results'));
 const r=source?.toolingResults;if(!r){$('r4-plan').textContent='이 모델의 공구 기록 없음';return;}
 let layer=[],caption='',rows=[],detail='',profilePlan='';
 const add=(ps,color,dash=false)=>{for(const points of ps||[])if(points.length)layer.push({points,color,dash});};
 if(part==='ultrasonic'||part==='laser'){
  const p=r.plans[side];if(!p){$('r4-results').textContent='현재 공정에는 용접 작업면이 없습니다. 공정 상태에서 S2 또는 S3를 선택하세요.';return;}
  add(p.overlap,'#338b75');caption=`${side} · ${p.stage} · 공칭 작업면 (U,V mm)`;
  for(const [k,f] of Object.entries(p.tools||{})){
   if(part==='ultrasonic' && k!==kind)continue;
   add(f.outer,k==='horn'?'#528be1':'#bb69c6');add(f.knurl,k==='horn'?'#528be1':'#bb69c6',true);rows.push([k+' 공칭 접촉 면적',num(f.contactArea)+' mm²']);rows.push([k+' 접촉 중심 U,V',f.center?.map(num).join(', ')||'겹침 없음']);
  }
  if(part==='laser' && !p.spots?.length)rows.push(['레이저 스팟','선택 극의 적용 공정에 레이저 접합 기록 없음']);
  for(const s of p.spots||[]){if (part==='laser') {const pts=Array.from({length:49},(_,i)=>[s.x+s.diameter/2*Math.cos(i*Math.PI/24),s.y+s.diameter/2*Math.sin(i*Math.PI/24),0]);add([pts],s.outside?'#ef5757':'#299e82');}rows.push([s.id,`${num(s.x)}, ${num(s.y)} · Ø${num(s.diameter)}${s.outside?' · 원주 이탈':''}`]);}
 }else if(part==='seal'){
  const f=r.seals[location+'_'+half],s=r.seals[location];if(!f){$('r4-results').textContent='닫힌 패키지 R2 이후에서 실링 평면을 계산합니다.';return;}
  if (f.definition.tabProfile) {
   profilePlan=tabSealPlan(r.seals,project,location,half,toolOnly);
   const dim=(toolOnly ? f.tabDimensions : s.tabDimensions) || {};
   rows.push([toolOnly?'공구 중앙 접점 L':'제품 중앙 접점 L',dim.center ? num(dim.center.length)+' mm' : '동일 접점 없음 · 중첩 경계 확인'],
     [toolOnly?'공구 전이 R':'제품 전이 R',dim.radius ? num(dim.radius.radius)+' mm' : '동일 원호 없음 · 중첩 경계 확인'],
     ['공구 제한',s.limitingBars?.length ? s.limitingBars.map(x=>x==='upper'?'상부':'하부').join(' · ') : '상·하 일치']);
   for (const [label,key] of [['바깥 왼쪽','left'],['중앙','center'],['바깥 오른쪽','right']])
    if (!toolOnly && s.profileWidths) rows.push([label+' 폭',num(s.profileWidths[key])+' mm']);
  }
  add(f.base,'#5792dc');add(f.union,'#d6923c',true);add(f.working,'#48ab8e');caption=`${location} / ${half} · 작업면 U–V · 파랑 1회 타격, 주황 합집합`;
  rows.push(['선택 바 1회 타격',num(f.baseArea)+' mm²'],['선택 바 투영 합집합',num(f.projectionArea)+' mm²'],['상하 유효 중첩',num(s.overlapArea)+' mm²'],['제품 필름 위 공칭 실링',toolOnly?'현재 공정 적용 전':num(s.productArea)+' mm²']);
  for(const v of toolOnly?[]:s.sections)rows.push([v.id+' / Y='+num(v.y),`폭 ${num(v.width)} / 실런트 중첩 ${num(v.sealantOverlap)} mm`]);
  detail=sealSection(f);
 }else if(part==='gathering'){
  const v=r.poles[side],t={rootZ:v?.rootZ,rootSpread:v?.rootSpread};if(!v)return;
  if(api.recorded()){const tab=source.parts.find(p=>p.id===side+'.tab');if(tab)profilePlan='<p>집속 포일 단품 · 사전 계산 CAD</p><img class="recorded-part" src="'+detailImage(tab)+'" alt="집속 포일 단품">';}if(!api.recorded()){const n=48;const curve=(a,b)=>Array.from({length:n+1},(_,i)=>{const u=i/n,f=u*u*(3-2*u);return [v.entryX*u,a+(b-a)*f,0];});add([curve(t.rootZ+t.rootSpread/2,v.topZ)],'#528be1');add([curve(t.rootZ-t.rootSpread/2,v.bottomZ)],'#aa72bc');add([[[v.entryX,v.topZ,0],[v.entryX+4,v.topZ,0],[v.entryX+4,v.bottomZ,0],[v.entryX,v.bottomZ,0]]],'#3f9e88');caption='길이–두께 단면 X–Z · 일정 폭 포일 포락선';}rows=Object.entries(v).map(([k,v])=>[k,num(v)+(k.includes('Slope')?' mm/mm':' mm')]);
 }else{
  const p=r.packaging;if(p)rows=Object.entries(p).filter(([k])=>!['step','open'].includes(k)).map(([k,v])=>[k,typeof v==='number'?num(v)+' mm':v]);caption='왼쪽 실제 CAD: 열린 두 컵 → 닫힘 → 실링 → 절단·폴딩';
 }
 if(profilePlan){$('r4-plan').innerHTML=profilePlan+detail;}else if(layer.length){const pts=layer.flatMap(x=>x.points),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),w=Math.max(xmax-xmin,1),h=Math.max(ymax-ymin,1),pad=Math.max(w,h)*.08;const svg=layer.map(l=>`<polyline points="${l.points.map(p=>p[0]+','+(-p[1])).join(' ')}" fill="none" stroke="${l.color}" stroke-width="1.5" vector-effect="non-scaling-stroke" ${l.dash?'stroke-dasharray="5 3"':''}/>`).join('');$('r4-plan').innerHTML=`<p>${esc(caption)}</p><svg viewBox="${xmin-pad} ${-ymax-pad} ${w+2*pad} ${h+2*pad}" role="img" aria-label="${esc(caption)}">${svg}</svg>${detail}`;}else $('r4-plan').innerHTML=`<p>${esc(caption)}</p>${detail}`;
 $('r4-results').innerHTML=`<strong>${api.recorded()?'사전 계산 기록':pending?'미리보기 CAD 계산':'확정 CAD 계산'} · ${esc(api.stageLabel(source.stage))}</strong><table>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
 }
 async function preview(){if(working||!editable())return;project=toolingPreviewProject(api.project(),project);const id=++token;working=true;api.lock(true);$('r4-preview').disabled=true;$('r4-apply').disabled=true;$('r4-message').textContent='미리보기 CAD 계산 중…';try{
  if(part==='ultrasonic')project.stage=ws;
  if(part==='gathering')project.stage='preweld';
  if(part==='laser')project.stage='welded';
  if(part==='pouch')project.stage='film_formed';
  if(part==='seal'){const min=location==='gas'?4:location==='final'?5:3;if(r4Stages.indexOf(project.stage)<min)project.stage=r4Stages[min];}
  const r=await api.preview(clone(project));if(id!==token)return;result=r;pending=true;validated=JSON.stringify(project);api.showPreview(result,project);$('r4-message').textContent='미리보기 완료 · 아직 저장되지 않았습니다. 3D 치수는 현재 계산 결과입니다. 취소/적용을 선택하세요.';$('r4-apply').disabled=false;draw();
 }catch(e){if(id===token){validated=null;$('r4-message').textContent=e.message;}}finally{if(id===token){working=false;$('r4-preview').disabled=false;}}}
 for(const [id,fn] of [['r4-mode',v=>part=v],['r4-side',v=>side=v],['r4-wstage',v=>ws=v],['r4-kind',v=>kind=v],['r4-location',v=>location=v],['r4-half',v=>half=v]])$(id).onchange=e=>{if(pending){e.target.value=e.target.dataset.prior;return;}fn(e.target.value);api.optionChanged(id,e.target.value);render();};
 $('r4-preview').onclick=preview;$('r4-cancel').onclick=()=>{if(!editable())return;api.restore();api.lock(false);reset();$('r4-message').textContent='취소 완료 · 확정 형상과 설정을 복원했습니다.';};
 $('r4-apply').onclick=()=>{if(!editable()||validated!==JSON.stringify(project))return;api.apply(clone(project));};
 $('r4-dictionary').onclick=()=>{if(!editable())return;const data={format:'cell-r4-field-guide',sourceModel:project.product.id,revision:value().revision,unit:'mm',example:project.demo,fields:toolingDictionary(project.product).map(f=>({...f,companyName:'',sourceDocument:'',tolerance:null,note:'설계 입력. 실측은 공정별 검사 항목에 저장.'}))};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='R4-field-and-naming-guide.json';a.click();URL.revokeObjectURL(a.href);};
 reset();
 return {
  refresh:reset,
  kind: value=>{kind=value;$('r4-kind').value=value;},
  fieldValue:path=>get(project?.product,path),
  async edit(path,v){
    if(!editable())return;
    const prefix='processTooling.poles.'+side+'.tools.'+ws+'.'+kind+'.';
    if(!(part==='ultrasonic'&&path.startsWith(prefix))&&!(part==='pouch'&&/^pouchProcess\.sheets\.(upper|lower)\./.test(path)))throw Error('현재 단품과 다른 필드 ID');
    set(project.product,path,v);mark();render();await preview();
  },
  open(mode, pole, stage, sealSide) {
    part=mode;side=pole;
    if(stage)ws=stage;
    if(sealSide)location=sealSide;
    for(const [id,v] of Object.entries({'r4-mode':part,'r4-side':side,'r4-wstage':ws,'r4-location':location,'r4-half':half}))
      $(id).value=v;
    reset();
  },
  isPending:()=>pending,
 };
}
