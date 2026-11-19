// Existing source keys remain authoritative. Visibility never rewrites a value.
export function placementField(path) {
  const key=path.split('.').at(-1);
  if(path.startsWith('processTooling.')) {
    if(path.includes('.tools.'))return ['x','y','rotation'].includes(key);
    if(path.includes('.laser.'))return ['x','y','rotation'].includes(key);
    if(path.includes('.gathering.'))return ['topDatumZ','bottomZ'].includes(key);
    if(path.includes('.sealBars.'))return !path.includes('.tabProfile.')&&!path.includes('.vertices.')&&!path.includes('.relief.')&&!path.includes('.extra.')&&['u','v','rotation'].includes(key);
    // Cup-to-cup geometry is intrinsic to the film. Insertion pose is in pouchProcess.
    return false;
  }
  return /\.(rootY|rootZ|gatherY|gatherZ|offsetY|start|contactSide|face|x|y|z|rotationZ)$/.test(path);
}
export function componentParts(model, selection) {
  const {part,side,ws,kind}=selection;
  return model.parts.filter(p=>part==='ultrasonic'?p.id===`tool.${side}.${ws}.${kind}.teeth`:
    part==='pouch'?p.id.startsWith('pouch.'):
    part==='lead'?p.id===side+'.lead'||p.id===side+'.leadFilm':
    part==='tapes'?p.id.startsWith(side+'.tape.'):
    part==='gathering'||part==='tab'?p.id===side+'.tab':
    part==='laser'?p.id===side+'.lead'||p.id.startsWith(side+'.laser.'):false);
}
export function componentModel(model,selection) {
  const parts=componentParts(model,selection), ids=new Set(parts.map(p=>p.id));
  return {...model,parts,paths:model.paths.filter(p=>ids.has(p.partId)),features:Object.fromEntries(Object.entries(model.features).filter(([,f])=>ids.has(f.partId)))};
}
export function dimensions(model) {
  return model.parts.flatMap(p=>Object.entries(p.meta?.dimensions||{}).map(([key,d])=>({key,...d,partId:p.id})));
}
export const dimensionNames={pitchU:'U 피치',pitchV:'V 피치',height:'치높이',length:'작업면 길이',width:'작업면 폭',knurlLength:'너링 길이',knurlWidth:'너링 폭'};
