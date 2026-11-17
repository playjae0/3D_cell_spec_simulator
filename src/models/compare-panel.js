import { Viewer } from "../viewer/viewer.js";
import { rebuild } from "../geometry/client.js";
import { stages } from "../data/project.js";
import { ComparisonSession,calculatedDifferences,partDifferences,inputDifferences,comparisonContext } from "./compare.js";
import { fieldPath } from "../intake/contract.js";
import { bindingFor,forecast } from "../data/bindings.js";
export function mountComparison({getProject,getLibrary,canOpen,notify}){
  const dialog=document.createElement("dialog");dialog.id="comparison-dialog";
  dialog.innerHTML=`<div class="intake-header"><div><h2>공정 · 개정 비교</h2><p>전역 프레임 그대로 · Δ=B−A · 원본 개정/현재 작업/이력에 적용하지 않습니다.</p></div><button id="compare-close">비교 닫기</button></div><div class="compare-sources">${["a","b"].map(s=>`<div><label>${s.toUpperCase()} 모델·개정<select id="compare-${s}"></select></label><label>공정<select id="compare-stage-${s}"></select></label></div>`).join("")}</div><div class="intake-toolbar"><button id="compare-run">독립 CAD 두 개 계산</button><label>계산 기준<select id="compare-basis"><option value="revision">각 개정의 검사 기준</option><option value="global">공통 전역 X/Y/Z 프레임</option></select></label><label>공통 단면<select id="compare-section"><option value="none">끄기</option><option value="x">X 법선 · YZ</option><option value="y">Y 법선 · XZ</option><option value="z">Z 법선 · XY</option></select></label><label>단면 위치 mm<input id="compare-position" type="number" step="any" value="0"></label><button id="compare-front">공통 정면</button><button id="compare-side">공통 측면</button></div><p id="compare-status" role="status"></p><div class="compare-views"><section><h3 id="compare-title-a">A</h3><div id="compare-view-a" class="compare-viewport"></div></section><section><h3 id="compare-title-b">B</h3><div id="compare-view-b" class="compare-viewport"></div></section></div><details open><summary>CAD 계산 치수 · Δ=B−A (mm)</summary><p id="compare-measure-basis"></p><div class="compare-table"><table><thead><tr><th>검사 개소</th><th>A 계산 / 목표 ±공차</th><th>B 계산 / 목표 ±공차</th><th>Δ mm / 비교 상태</th></tr></thead><tbody id="compare-dimensions"></tbody></table></div></details><details><summary>부품 존재 및 CAD 외곽·체적 차이</summary><div id="compare-parts"></div></details><details><summary>입력·검사 정의·출처·표시 변화 (CAD 계산값과 별도)</summary><div id="compare-inputs"></div></details>`;
  document.body.append(dialog);const $=id=>dialog.querySelector("#"+id),session=new ComparisonSession(rebuild);
  let sources=[],snapshot=null,result=null,views=[],syncing=false;
  const say=x=>$("compare-status").textContent=x;
  for(const side of ["a","b"])for(const [id,label] of Object.entries(stages))$("compare-stage-"+side).append(new Option(label,id));
  function syncCamera(c,from){if(syncing||!result)return;syncing=true;for(let i=0;i<views.length;i++){result.projects[i].view.camera=structuredClone(c);if(i!==from)views[i].restore(c);}syncing=false;}
  function invalidate(){session.invalidate();result=null;for(const v of views)v.host.style.visibility="hidden";$("compare-dimensions").replaceChildren();$("compare-parts").replaceChildren();$("compare-inputs").replaceChildren();say("비교 선택 변경 · 독립 CAD 계산이 필요합니다");}
  for(const id of ["compare-a","compare-b","compare-stage-a","compare-stage-b"])$(id).onchange=invalidate;
  function selection(i,m,r){if(!m||!r.valid){views[i].setHighlight(null);return;}const c=comparisonContext(result.projects[i],m,$("compare-basis").value==="global"),f=result.models[i].features;views[i].setHighlight({partId:f[m.a.featureId]?.partId,partIds:[f[m.a.featureId]?.partId,f[m.b?.featureId]?.partId],label:m.name,pending:false,guide:{measurement:c.measurement,features:f,context:c.project,value:r.value,mode:m.mode}});}
  function renderDifferences(){
    if(!result)return;const common=$("compare-basis").value==="global";
    $("compare-measure-basis").textContent=(common?"공통 전역 프레임 (0,0,0), XYZ, 회전 0°":"각 개정의 저장 검사 프레임 · 기준이 다른 항목은 직접 비교 불가")+" · 단면 "+$("compare-section").value+" / "+$("compare-position").value+" mm";
    const host=$("compare-dimensions");host.replaceChildren();
    for(const row of calculatedDifferences(result.projects,result.models,{common})){
      const tr=document.createElement("tr");tr.tabIndex=0;
      const values=row.results.map((r,i)=>{const s=row.items[i]?.spec;return(r.valid?r.value.toFixed(3)+" mm":r.error)+(s?" / "+(s.target??"목표 미입력")+" +"+(s.plus??"—")+" / −"+(s.minus??"—")+" mm":" / 정의 없음");});
      for(const text of [row.name,...values,row.delta===null?row.reason:row.delta.toFixed(3)+" mm"]){const td=document.createElement("td");td.textContent=text;tr.append(td);}
      const show=()=>row.displayItems.forEach((m,i)=>selection(i,m,row.results[i]));tr.onclick=show;tr.onkeydown=e=>{if(e.key==="Enter")show();};host.append(tr);
    }
    $("compare-parts").replaceChildren();for(const r of partDifferences(result.models)){const b=document.createElement("button");b.className="compare-row";b.textContent=r.id+" · A "+r.states[0]+" / B "+r.states[1]+(r.delta?" · Δ 최소 XYZ "+r.delta.min.map(x=>x.toFixed(3)).join(", ")+" mm; 최대 XYZ "+r.delta.max.map(x=>x.toFixed(3)).join(", ")+" mm; 체적 "+r.delta.volume.toFixed(3)+" mm³":"");b.onclick=()=>views.forEach(v=>v.setHighlight({partId:r.id}));$("compare-parts").append(b);}
    $("compare-inputs").replaceChildren();for(const r of inputDifferences(result.projects)){const b=document.createElement("button");b.className="compare-row";b.textContent=r.kind+" · "+r.id+" · "+r.change+" / "+r.categories.join(", ")+"\nA: "+JSON.stringify(r.before)+"\nB: "+JSON.stringify(r.after);b.onclick=()=>{result.projects.forEach((p,i)=>{const path=r.parameterId&&fieldPath(p.product,r.parameterId),binding=path&&bindingFor(p.product,p.stage,path);if(binding)views[i].setHighlight({partId:binding.partId,label:binding.label,path,pending:false,guide:forecast(binding,p.product,p.stage)});else if(r.kind==="inspectionItem"){const m=p.measurements.find(m=>m.id===r.id);if(m){const row=calculatedDifferences(result.projects,result.models,{common}).find(row=>row.items[i]?.id===m.id);if(row)selection(i,m,row.results[i]);}}});};$("compare-inputs").append(b);}
  }
  $("compare-run").onclick=async()=>{
    try{say("독립 CAD 계산 중 · 현재 작업 유지");const a=sources[Number($("compare-a").value)],b=sources[Number($("compare-b").value)];
      const next=await session.run(a.project,b.project,[$("compare-stage-a").value,$("compare-stage-b").value]);if(!next)return;result=next;
      if(!views.length)views=["a","b"].map((s,i)=>new Viewer($("compare-view-"+s),{onSelect:id=>views[i].select(id),onPick:()=>{},onAnchor:()=>{},onCamera:c=>syncCamera(c,i)}));
      syncing=true;result.projects.forEach((p,i)=>{p.view.section={axis:$("compare-section").value,position:Number($("compare-position").value)};views[i].host.style.visibility="visible";views[i].setModel(result.models[i],p);});
      const camera=snapshot.view.camera;if(camera)views.forEach(v=>v.restore(camera));else {views[0].fit();views[1].restore(views[0].getCamera());}syncing=false;
      $("compare-title-a").textContent="A · "+a.label+" · "+stages[result.projects[0].stage];$("compare-title-b").textContent="B · "+b.label+" · "+stages[result.projects[1].stage];renderDifferences();say("비교 완료 · 카메라/단면 동기 · 원본과 미저장 작업은 유지됩니다.");
    }catch(e){invalidate();say("비교 실패 · 원본 유지: "+e.message);}
  };
  function section(){if(!result)return;const value=$("compare-position").value;if(value===""||!Number.isFinite(Number(value)))return say("단면 위치는 유한한 mm 값이어야 합니다");for(let i=0;i<2;i++){result.projects[i].view.section={axis:$("compare-section").value,position:Number(value)};views[i].setModel(result.models[i],result.projects[i]);}renderDifferences();}
  $("compare-section").onchange=section;$("compare-position").onchange=section;$("compare-basis").onchange=renderDifferences;
  $("compare-front").onclick=()=>result&&views[0].view("front");$("compare-side").onclick=()=>result&&views[0].view("side");
  $("compare-close").onclick=()=>{invalidate();dialog.close();};dialog.addEventListener("cancel",invalidate);
  return {open(){if(!canOpen())return notify("현재 CAD 입력을 적용/취소한 뒤 비교하세요");snapshot=structuredClone(getProject());sources=[{label:"현재 미저장 작업 스냅샷",project:snapshot}];for(const m of getLibrary().data.models)for(const r of m.revisions)sources.push({label:m.modelId+" / "+r.revision,project:structuredClone(r.project)});
    for(const side of ["a","b"]){$("compare-"+side).replaceChildren(...sources.map((s,i)=>new Option(s.label,String(i))));$("compare-stage-"+side).value=snapshot.stage;}
    $("compare-section").value=snapshot.view.section.axis;$("compare-position").value=snapshot.view.section.position;invalidate();dialog.showModal();}};
}
