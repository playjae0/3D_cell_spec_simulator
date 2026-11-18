import {clone,get,set,labels,fieldsForObject,toolingDictionary,r4Stages,toolingPreviewProject} from './contract.js';
import demo from '../../examples/process-tooling-r4.json' with {type:'json'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number.isFinite(x)?x.toFixed(3):'—';
export function mountTooling(api){
 const root=document.getElementById('tooling-pane');
 let project=null,result=null,part='ultrasonic',side='positive',ws='preweld',kind='horn',location='positive',half='upper',pending=false,working=false,token=0,validated=null;
 root.innerHTML=`<div class="tooling-intro"><b>공정·요소기술 R4</b><p>가상 예시 · mm · 공칭 형상. 설계 / 계산 / 실측을 구분합니다.</p></div><button id="r4-example" class="primary">R4 가상 예제 열기</button><div id="r4-controls" hidden><div class="tooling-nav"><select id="r4-mode" aria-label="요소기술 종류"><option value="ultrasonic">혼·엔빌 작업면</option><option value="gathering">가용접 포일 집속</option><option value="laser">레이저 스팟</option><option value="seal">실링바 평면 윤곽</option><option value="pouch">한 장 필름·가스방</option></select><select id="r4-side" aria-label="요소기술 극"><option value="positive">양극 · 독립</option><option value="negative">음극 · 독립</option></select><select id="r4-wstage" aria-label="공구 적용 공정"><option value="preweld">S2 가용접 공구</option><option value="welded">S3 메인 용접 공구</option></select><select id="r4-kind" aria-label="혼 또는 엔빌"><option value="horn">혼 (상부)</option><option value="anvil">엔빌 (하부)</option></select><select id="r4-location" aria-label="실링 위치"><option value="positive">양극 탭측</option><option value="negative">음극 탭측</option><option value="gas">가스방 외곽</option><option value="final">몸체 최종 실링</option></select><select id="r4-half" aria-label="실링바 상하"><option value="upper">상부 바</option><option value="lower">하부 바</option></select></div><div id="r4-basis" class="small"></div><div id="r4-plan"></div><div id="r4-results" aria-live="polite"></div><div class="r4-actions"><button id="r4-preview">CAD 미리보기</button><button id="r4-apply" class="primary" disabled>미리보기 적용</button><button id="r4-cancel">취소 · 확정 복원</button></div><p id="r4-message" role="status"></p><div id="r4-special"></div><div id="r4-fields"></div><button id="r4-dictionary">R4 필드·명칭 양식 내려받기</button></div>`;
 const $=id=>document.getElementById(id),value=()=>project?.product.processTooling;
 function mark(){token++;working=false;$('r4-preview').disabled=false;pending=true;validated=null;$('r4-apply').disabled=true;api.lock(true);$('r4-message').textContent='설계 입력 변경 · 계산/평면은 마지막 미리보기입니다. CAD 미리보기를 실행하세요.';}
 function reset(){token++;project=clone(api.project());result=api.model();pending=false;working=false;validated=null;$('r4-apply').disabled=true;$('r4-preview').disabled=false;$('r4-message').textContent='';render();}
 function fields(object,prefix){return fieldsForObject(object,prefix).filter(f=>!['location','half','example','version'].includes(f.id.split('.').at(-1)));}
 function input(f){const k=f.id.split('.').at(-1),opts=k==='method'?{ultrasonic:'초음파',laser:'레이저'}:k==='tooth'?{pyramid:'피라미드',ridge:'평행 리지'}:null;
 if(f.id.includes('.cups.')&&['x','y'].includes(k))f={...f,label:'컵 입구 중심 '+k.toUpperCase()+' · 닫힘 제품 데이텀'};
 const name=esc(f.id);let control=opts?`<select data-r4-field="${name}" aria-label="${name}">${Object.entries(opts).map(([v,l])=>`<option value="${v}" ${v===f.value?'selected':''}>${l}</option>`).join('')}</select>`:typeof f.value==='boolean'?`<input type="checkbox" data-r4-field="${name}" aria-label="${name}" ${f.value?'checked':''}>`:`<input type="${typeof f.value==='number'?'number':'text'}" step="any" data-r4-field="${name}" aria-label="${name}" value="${esc(f.value)}" ${k==='id'?'readonly':''}>`;
 return `<label class="r4-field"><span>${esc(f.label)} <small>${f.unit}</small><code>${name.replace('processTooling.','')}</code></span>${control}</label>`;}
 function render(){
 const q=value();$('r4-controls').hidden=!q;root.classList.toggle('r4-active',!!q);if(!q)return;
 $('r4-side').hidden=['seal','pouch'].includes(part);$('r4-wstage').hidden=part!=='ultrasonic';$('r4-kind').hidden=part!=='ultrasonic';$('r4-location').hidden=part!=='seal';$('r4-half').hidden=part!=='seal';
 let fs=[],special='',basis='';const pre='processTooling.poles.'+side;
 if(part==='ultrasonic'){
  fs=fields(q.poles[side].tools[ws][kind],pre+'.tools.'+ws+'.'+kind);basis=`${side} / ${ws} / ${kind} · U=집속 진입 X부터 바깥쪽, V=집속 중심 Y부터. 파랑 혼·보라 엔빌·초록 탭/리드 겹침. 너링 공칭 접촉과 실제 접합 관리 영역은 별개입니다.`;
  special='<button id="r4-half-pitch">선택 공구만 +½ U 피치 이동</button>';
 }else if(part==='gathering'){
  fs=fields(q.poles[side].gathering,pre+'.gathering');basis='S2부터 적용 · 상면 Z = 상면 데이텀 − 침입 깊이. 하면·뿌리·진입 X·포일 폭 고정. 경사는 뿌리→집속 구간의 할선 기울기 (mm/mm); 경로는 smoothstep 포락 예시입니다.';
 }else if(part==='laser'){
  fs=[{...fields({method:q.poles[side].method},pre)[0]},...fields(q.poles[side].laser,pre+'.laser').filter(f=>!f.id.includes('.spots.'))];basis='S3 이후 메인 방식=레이저일 때 표시 · 탭–리드 실제 겹침면 기준. 빨강은 중심이 내부여도 원주가 겹침 밖인 점입니다. 배열 변경 후에도 기존 ID 유지.';
  special='<button id="r4-grid">행×열 배열 재구성</button><button id="r4-add-spot">스팟 1개 추가</button>'+q.poles[side].laser.spots.map((s,i)=>`<details><summary>${esc(s.id)} · 행 ${s.row}, 열 ${s.column}</summary>${fields(s,pre+'.laser.spots.'+i).map(input).join('')}<button data-r4-remove="${esc(s.id)}">${esc(s.id)} 삭제</button></details>`).join('');
 }else if(part==='seal'){
  const f=q.sealBars[location+'_'+half];fs=fields(f,'processTooling.sealBars.'+location+'_'+half).filter(f=>!f.id.includes('.vertices.'));
  basis='U–V 닫힌 작업면. 각 점의 원호 값은 직전 점→현재 점의 현에서 왼쪽 방향 처짐(mm), 0=직선. 외곽과 내측선을 따로 편집합니다. 제품 면적=상하 작업면 중첩∩남아 있는 필름. 추가 타격은 합집합입니다.';
  special='<h4>작업면 윤곽 · 직선/원호</h4>'+f.vertices.map((v,i)=>`<details open><summary>${esc(v.id)}</summary>${fields({...v,arc:v.arc||0},'processTooling.sealBars.'+location+'_'+half+'.vertices.'+i).map(input).join('')}</details>`).join('');
 }else{
  fs=fields(q.packaging,'processTooling.packaging').filter(f=>!['gasOuterY','finalSealY'].includes(f.id.split('.').at(-1)));
  for(const h of ['lower','upper'])fs.push(...fields(project.product.pouchProcess.sheets[h],'pouchProcess.sheets.'+h).filter(f=>!f.id.includes('.blank.')&&!f.id.includes('.cut.')));
  basis='필름 평면 Z=−브리지 R, 길이 X, 브리지 중심선은 −Y측. 가스방은 반대 +Y측. 두 컵 크기는 독립 입력. 한 장 필름 두께와 브리지 접합 변은 일치해야 합니다.';
  special='<div class="r4-stage-list">'+r4Stages.map(s=>`<button data-r4-stage="${s}">${esc(api.stageLabel(s))}</button>`).join('')+'</div>';
 }
 $('r4-basis').textContent=basis;$('r4-fields').innerHTML=fs.map(input).join('');$('r4-special').innerHTML=special;
 root.querySelectorAll('[data-r4-field]').forEach(el=>el.oninput=()=>{const path=el.dataset.r4Field;set(project.product,path,el.type==='checkbox'?el.checked:el.type==='number'?(el.value.trim()===''?NaN:Number(el.value)):el.value);mark();});
 root.querySelectorAll('[data-r4-remove]').forEach(el=>el.onclick=()=>{const l=q.poles[side].laser;l.spots=l.spots.filter(s=>s.id!==el.dataset.r4Remove);mark();render();});
 root.querySelectorAll('[data-r4-stage]').forEach(el=>el.onclick=()=>{project.stage=el.dataset.r4Stage;mark();preview();});
 if($('r4-half-pitch'))$('r4-half-pitch').onclick=()=>{const f=q.poles[side].tools[ws][kind];f.x+=f.pitchU/2;mark();render();};
 if($('r4-add-spot'))$('r4-add-spot').onclick=()=>{q.poles[side].laser.spots.push({id:'spot-'+crypto.randomUUID().slice(0,8),row:0,column:0,dx:0,dy:0});mark();render();};
 if($('r4-grid'))$('r4-grid').onclick=()=>{const l=q.poles[side].laser;if(!Number.isInteger(l.rows)||!Number.isInteger(l.columns)||l.rows<1||l.columns<1||l.rows*l.columns>2500){$('r4-message').textContent='행열은 양의 정수, 2500개 이하입니다.';return;}l.spots=Array.from({length:l.rows*l.columns},(_,i)=>l.spots.find(s=>s.row===Math.floor(i/l.columns)&&s.column===i%l.columns)||{id:'spot-'+crypto.randomUUID().slice(0,8),row:Math.floor(i/l.columns),column:i%l.columns,dx:0,dy:0});mark();render();};
 draw();
 }
 function draw(){
 const r=result?.toolingResults;$('r4-plan').innerHTML='';$('r4-results').innerHTML='';if(!r)return;
 let layer=[],caption='',rows=[],detail='';
 const add=(ps,color,dash=false)=>{for(const points of ps||[])if(points.length)layer.push({points,color,dash});};
 if(part==='ultrasonic'||part==='laser'){
  const p=r.plans[side];if(!p){$('r4-results').textContent='현재 CAD 공정에 용접면이 없습니다. 미리보기로 적용 공정을 전환하세요.';return;}
  add(p.overlap,'#338b75');caption=`${side} · ${p.stage} · 제품 데이텀 공유 작업면 (U,V mm)`;
  for(const [k,f] of Object.entries(p.tools||{})){
   add(f.outer,k==='horn'?'#528be1':'#bb69c6');add(f.knurl,k==='horn'?'#528be1':'#bb69c6',true);rows.push([k+' 공칭 접촉 면적',num(f.contactArea)+' mm²']);rows.push([k+' 접촉 중심 U,V',f.center?.map(num).join(', ')||'겹침 없음']);
  }
  if(part==='ultrasonic'){
   const f=p.tools?.[kind]?.definition;
   if(f){const h=f.height,pu=f.pitchU;detail=`<details class="r4-tooth"><summary>대표 치형 단면 · ${esc(f.tooth)} / 피치 ${num(pu)} / 높이 ${num(h)} mm</summary><svg viewBox="0 ${-Math.max(h*1.4,pu)} ${5*pu} ${Math.max(h*1.4,pu)+pu*.2}" role="img" aria-label="대표 치형 단면"><path d="${Array.from({length:9},(_,i)=>(i?'L':'M')+(.5*pu+i*pu/2)+' '+(i%2?-h:0)).join(' ')}" fill="none" stroke="#528be1" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><small>실제 피치/높이 비율 · 대표 U 단면, 실제 압흔 해석 아님</small></details>`;
    // Clipped parametric knurl pattern, same tool placement and independently rotated teeth.
    const a=f.rotation*Math.PI/180,co=Math.cos(a),si=Math.sin(a),d=f.direction*Math.PI/180,dc=Math.cos(d),ds=Math.sin(d);const n=Math.ceil(Math.hypot(f.knurlLength,f.knurlWidth)/Math.min(f.pitchU,f.pitchV));
    for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const x=i*f.pitchU*dc-j*f.pitchV*ds,y=i*f.pitchU*ds+j*f.pitchV*dc;if(Math.abs(x)>f.knurlLength/2||Math.abs(y)>f.knurlWidth/2)continue;const size=Math.min(f.pitchU,f.pitchV)*.22;const local=f.tooth==='ridge'?[[x-size,y],[x+size,y]]:[[x-size,y],[x,y-size],[x+size,y],[x,y+size],[x-size,y]];add([local.map(([u,v])=>[f.x+u*co-v*si,f.y+u*si+v*co,0])],kind==='horn'?'#7597c9':'#bd80c5');}
   }
  }
  for(const s of p.spots||[]){const pts=Array.from({length:49},(_,i)=>[s.x+s.diameter/2*Math.cos(i*Math.PI/24),s.y+s.diameter/2*Math.sin(i*Math.PI/24),0]);add([pts],s.outside?'#ef5757':'#299e82');rows.push([s.id,`${num(s.x)}, ${num(s.y)} · Ø${num(s.diameter)}${s.outside?' · 원주 이탈':''}`]);}
 }else if(part==='seal'){
  const f=r.seals[location+'_'+half],s=r.seals[location];if(!f){$('r4-results').textContent='닫힌 패키지 R2 이후에서 실링 평면을 계산합니다.';return;}
  add(f.base,'#5792dc');add(f.union,'#d6923c',true);add(f.working,'#48ab8e');caption=`${location} / ${half} · 작업면 U–V · 파랑 1회 타격, 주황 합집합`;
  rows.push(['선택 바 1회 타격',num(f.baseArea)+' mm²'],['선택 바 투영 합집합',num(f.projectionArea)+' mm²'],['상하 유효 중첩',num(s.overlapArea)+' mm²'],['제품 필름 위 공칭 실링',num(s.productArea)+' mm²']);
  for(const v of s.sections)rows.push([v.id+' / Y='+num(v.y),`폭 ${num(v.width)} / 실런트 중첩 ${num(v.sealantOverlap)} mm`]);
  const relief=f.definition.relief,rx=relief.u,rl=relief.length,rd=relief.enabled?relief.depth:0;
  detail=`<details class="r4-tooth" ${relief.enabled?'open':''}><summary>선택 U=${num(rx)} 국부 단면 · 홈 길이 ${num(rl)} / 깊이 ${num(rd)} mm</summary><svg viewBox="${rx-rl} ${-Math.max(rd*1.5,rl*.2)} ${rl*2} ${Math.max(rd*1.5,rl*.2)+rl*.1}" role="img" aria-label="실링바 홈 국부 단면"><path d="M${rx-rl} 0 L${rx-rl/2} 0 L${rx-rl/2} ${-rd} L${rx+rl/2} ${-rd} L${rx+rl/2} 0 L${rx+rl} 0" fill="none" stroke="#5792dc" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><small>초록 = 홈을 제외한 공칭 접촉면. 홈 깊이는 융착/압력 해석값이 아닙니다.</small></details>`;
 }else if(part==='gathering'){
  const v=r.poles[side],t={rootZ:v?.rootZ,rootSpread:v?.rootSpread};if(!v)return;const n=48;const curve=(a,b)=>Array.from({length:n+1},(_,i)=>{const u=i/n,f=u*u*(3-2*u);return [v.entryX*u,a+(b-a)*f,0];});add([curve(t.rootZ+t.rootSpread/2,v.topZ)],'#528be1');add([curve(t.rootZ-t.rootSpread/2,v.bottomZ)],'#aa72bc');add([[[v.entryX,v.topZ,0],[v.entryX+4,v.topZ,0],[v.entryX+4,v.bottomZ,0],[v.entryX,v.bottomZ,0]]],'#3f9e88');caption='길이–두께 단면 X–Z · 일정 폭 포일 포락선';rows=Object.entries(v).map(([k,v])=>[k,num(v)+(k.includes('Slope')?' mm/mm':' mm')]);
 }else{
  const p=r.packaging;if(p)rows=Object.entries(p).filter(([k])=>!['step','open'].includes(k)).map(([k,v])=>[k,typeof v==='number'?num(v)+' mm':v]);caption='왼쪽 실제 CAD: 열린 두 컵 → 닫힘 → 실링 → 절단·폴딩';
 }
 if(layer.length){const pts=layer.flatMap(x=>x.points),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),w=Math.max(xmax-xmin,1),h=Math.max(ymax-ymin,1),pad=Math.max(w,h)*.08;const svg=layer.map(l=>`<polyline points="${l.points.map(p=>p[0]+','+(-p[1])).join(' ')}" fill="none" stroke="${l.color}" stroke-width="1.5" vector-effect="non-scaling-stroke" ${l.dash?'stroke-dasharray="5 3"':''}/>`).join('');$('r4-plan').innerHTML=`<p>${esc(caption)}</p><svg viewBox="${xmin-pad} ${-ymax-pad} ${w+2*pad} ${h+2*pad}" role="img" aria-label="${esc(caption)}">${svg}</svg>${detail}`;}else $('r4-plan').innerHTML=`<p>${esc(caption)}</p>${detail}`;
 $('r4-results').innerHTML=`<strong>${pending?'미리보기 CAD 계산':'확정 CAD 계산'} · ${esc(api.stageLabel(result.stage))}</strong><table>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
 }
 async function preview(){if(working)return;project=toolingPreviewProject(api.project(),project);const id=++token;working=true;api.lock(true);$('r4-preview').disabled=true;$('r4-apply').disabled=true;$('r4-message').textContent='미리보기 CAD 계산 중…';try{
  if(part==='ultrasonic')project.stage=ws;
  if(part==='gathering')project.stage='preweld';
  if(part==='laser')project.stage='welded';
  if(part==='seal'){const min=location==='gas'?4:location==='final'?5:3;if(r4Stages.indexOf(project.stage)<min)project.stage=r4Stages[min];}
  const r=await api.preview(clone(project));if(id!==token)return;result=r;pending=true;validated=JSON.stringify(project);api.showPreview(result,project);$('r4-message').textContent='미리보기 완료 · 아직 저장되지 않았습니다. 부품·치수 선택은 적용 후 가능합니다. 취소/적용을 선택하세요.';$('r4-apply').disabled=false;draw();
 }catch(e){if(id===token){validated=null;$('r4-message').textContent=e.message;}}finally{if(id===token){working=false;$('r4-preview').disabled=false;}}}
 $('r4-example').onclick=()=>api.apply(clone(demo),true);
 for(const [id,fn] of [['r4-mode',v=>part=v],['r4-side',v=>side=v],['r4-wstage',v=>ws=v],['r4-kind',v=>kind=v],['r4-location',v=>location=v],['r4-half',v=>half=v]])$(id).onchange=e=>{fn(e.target.value);render();};
 $('r4-preview').onclick=preview;$('r4-cancel').onclick=()=>{api.restore();api.lock(false);reset();$('r4-message').textContent='취소 완료 · 확정 형상과 설정을 복원했습니다.';};
 $('r4-apply').onclick=()=>{if(validated!==JSON.stringify(project))return;api.apply(clone(project));};
 $('r4-dictionary').onclick=()=>{const data={format:'cell-r4-field-guide',sourceModel:project.product.id,revision:value().revision,unit:'mm',example:project.demo,fields:toolingDictionary(project.product).map(f=>({...f,companyName:'',sourceDocument:'',tolerance:null,note:'설계 입력. 실측은 공정별 검사 항목에 저장.'}))};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='R4-field-and-naming-guide.json';a.click();URL.revokeObjectURL(a.href);};
 reset();return {refresh:reset,isPending:()=>pending};
}
