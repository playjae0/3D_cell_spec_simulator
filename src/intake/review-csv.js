import {intakeFields} from './contract.js';
const cell = v => {
  let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
  if(typeof v==='string' && /^[=+@\-\t\r]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
};
// Always derive from the current JSON. CSV is a review view, not an import format.
export function reviewCsv(intake) {
  const fields=new Map(intakeFields(intake).map(f=>[f.parameterId,f]));
  const sourceText = refs => (refs||[]).map(r=>{
    const s=intake.sources.find(x=>x.sourceId===r.sourceId);
    return [r.sourceId,s?.documentName,s?.revision,r.locator].filter(Boolean).join(' / ');
  }).join(' | ');
  const rows=[['modelId','revision','itemId','kind','partId','polarity','stages','value','unit','originalValue','originalUnit','basis/start-end','source/document/location','reviewStatus','status']];
  for(const p of intake.parameters){const f=fields.get(p.parameterId)||{};rows.push([intake.model.modelId,intake.model.revision,p.parameterId,'design',f.partId,f.polarity,(f.activeStages||[]).join('|'),p.value,p.unit,p.originalValue??p.originalText,p.originalUnit,f.basis,sourceText(p.sourceRefs),p.reviewStatus,p.status]);}
  for(const p of intake.inspectionItems||[])rows.push([intake.model.modelId,intake.model.revision,p.itemId,'inspection','','',p.stage,{target:p.target,minus:p.minus,plus:p.plus},p.unit,'','',p.definition,sourceText(p.sourceRefs),'see JSON','']);
  for(const d of intake.inspectionDatums||[])rows.push([intake.model.modelId,intake.model.revision,d.id,'datum','','','','','','','',d,'','see JSON','']);
  return '\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
