const clone=x=>structuredClone(x);
export function validateInspectionViews(views = []) {
  if(!Array.isArray(views)||views.length>100)throw Error("검사 보기 프리셋은 100개 이하 목록이어야 합니다");
  const ids=new Set();
  for(const p of views){
    if(!p.id||ids.has(p.id)||typeof p.name!=="string"||typeof p.owner?.modelId!=="string"||typeof p.owner.stage!=="string"||!p.view||!Array.isArray(p.measurementVisibility)||!Array.isArray(p.featureIds)||!Array.isArray(p.partIds))throw Error("검사 보기 프리셋 형식 오류");
    ids.add(p.id);
    const c=p.view.camera, v=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
    if(!c||!v(c.position)||!v(c.target)||!v(c.up)||!Number.isFinite(c.zoom)||c.zoom<=0||!["none","x","y","z"].includes(p.view.section?.axis)||!Number.isFinite(p.view.section.position)||!Array.isArray(p.view.hidden)||!p.view.hidden.every(x=>typeof x==="string"))throw Error("검사 보기 카메라/단면 형식 오류");
    if(!p.featureIds.every(x=>typeof x==="string")||!p.partIds.every(x=>typeof x==="string")||!p.measurementVisibility.every(x=>typeof x.id==="string"&&typeof x.visible==="boolean"))throw Error("검사 보기 참조 형식 오류");
  }
}
export function captureInspectionView(project,data,{name,camera,selectedDatumId="legacy",selectedMeasurementId=null,selectedPartId=null}){
  const measurements=project.measurements.filter(m=>m.stage===project.stage);
  const preset={id:"view."+crypto.randomUUID(),name:name||"검사 보기",owner:{modelId:project.modelIdentity?.modelId||project.product.id,revision:project.modelIdentity?.revision||null,stage:project.stage},
    view:{...clone(project.view),camera:clone(camera)}, selectedDatumId,selectedMeasurementId,selectedPartId,
    measurementVisibility:measurements.map(m=>({id:m.id,visible:m.visible})),
    featureIds:[...new Set(measurements.filter(m=>m.visible||m.id===selectedMeasurementId).flatMap(m=>[m.a.featureId,...(["radius","signed_coordinate"].includes(m.mode)?[]:[m.b.featureId])]))],
    partIds:data.parts.map(p=>p.id)};
  validateInspectionViews([preset]); return preset;
}
export function applyInspectionView(project,data,preset){
  validateInspectionViews([preset]);
  const errors=[];
  if(preset.owner.stage!==project.stage) errors.push("프리셋 공정 "+preset.owner.stage+"와 현재 공정이 다릅니다");
  for(const id of preset.featureIds){const f=data.features[id];if(!f||f.available===false)errors.push(id+": "+(f?.reason||"참조 소실"));}
  for(const id of preset.partIds)if(!data.parts.some(p=>p.id===id))errors.push(id+": 해당 공정/모델에 부품 없음");
  for(const m of preset.measurementVisibility)if(!project.measurements.some(x=>x.id===m.id&&x.stage===project.stage))errors.push(m.id+": 검사 항목 참조 없음");
  if(preset.selectedDatumId!=="legacy"&&!project.inspectionDatums?.some(d=>d.id===preset.selectedDatumId))errors.push("검사 프레임 참조 없음");
  if(errors.length)throw Error(errors.join("\n"));
  const next=clone(project);next.view=clone(preset.view);next.view.selectedDatumId=preset.selectedDatumId;
  for(const m of next.measurements){const entry=preset.measurementVisibility.find(x=>x.id===m.id);if(entry)m.visible=entry.visible;}
  return {project:next,selectedPartId:preset.selectedPartId,selectedMeasurementId:preset.selectedMeasurementId,
    crossModel:preset.owner.modelId!==(project.modelIdentity?.modelId||project.product.id)||preset.owner.revision!==(project.modelIdentity?.revision||null)};
}
