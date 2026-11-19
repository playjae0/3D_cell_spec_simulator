import { fieldsFor, references } from '../data/bindings.js';
import { evaluate } from '../annotations/measure.js';
import { dimensions, placementField, dimensionNames } from './contract.js';

// Read actual CAD references. Never infer geometry from the displayed bounding box.
export function componentDimensions(model, product, selection) {
 const result=dimensions(model).map(d=>({...d,label:(d.field.startsWith('pouchProcess.sheets.')?(d.field.includes('.upper.')?'상부 ':'하부 '):'')+(dimensionNames[d.key]||d.label||d.key)}));
 const ids=new Set(model.parts.map(p=>p.id));
 for(const b of fieldsFor(product,model.stage)){
  if(!ids.has(b.partId)||!b.available||placementField(b.path)||result.some(d=>d.field===b.path))continue;
  if(model.stage==='foil_trimmed'&&b.key==='gatheredLength')continue;
  const ref=references(b,product,model.stage);if(!ref)continue;
  const m={...ref,stage:model.stage},v=evaluate(m,model.features);
  if(!v.valid)continue;
  result.push({key:b.key,label:b.label,basis:b.basis,field:b.path,partId:b.partId,a:ref.a.featureId,b:ref.b?.featureId,mode:ref.mode,value:v.value});
 }
 return result;
}
