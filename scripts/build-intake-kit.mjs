import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {intakeFromProject,projectFromIntake} from '../src/intake/adapter.js';
import {template,intakeFields,STAGES} from '../src/intake/contract.js';
import {addToolingIntake} from '../src/intake/tooling-fields.js';
import {reviewCsv} from '../src/intake/review-csv.js';
import {validateIntake} from '../src/intake/validate.js';
export function kitData(commit) {
  const p=JSON.parse(fs.readFileSync('examples/pouch-phase1.json','utf8'));
  const identity={modelId:'trial-virtual-cell',modelName:'공개 가상 시험셀 · 실제 제품값 아님',revision:'trial-1'};
  const filled=addToolingIntake(intakeFromProject(p,identity),p.product);
  filled.demo=true;filled.generator={version:'windows-trial-1',baselineCommit:commit};
  filled.requestedStages=['welded',...STAGES.filter(s=>s!=='welded')];
  filled.sources=[{sourceId:'public-trial',documentName:'03_Public_Virtual_Source.txt',revision:commit}];
  const refs=locator=>[{sourceId:'public-trial',locator}];
  filled.coordinateMapping.sourceRefs=refs('좌표계');
  filled.coordinateMapping.note='공개 가상 예시. 사내 실제 문서와 혼용하지 마세요.';
  for(const c of filled.componentInstances)c.sourceRefs=refs('부품 '+c.polarity+'.'+c.instanceId);
  for(const f of filled.parameters){f.sourceRefs=f.value===null?[]:refs(f.parameterId);f.originalValue=typeof f.value==='number'?f.value:null;f.originalUnit=f.unit;f.originalText=f.value==null?null:String(f.value);f.note='공개 가상 예시';}
  for(const m of filled.inspectionItems)m.sourceRefs=refs('검사 '+m.itemId);
  const blank=addToolingIntake(template(),p.product,true);blank.generator=filled.generator;
  // No dimensions are borrowed into missing mandatory fields.
  const fields=intakeFields(filled);
  const source=['공개 가상 셀 문서 — 실제 제품값 아님',`기준 소스: ${commit}`,'좌표계: '+filled.coordinateMapping.targetConvention,...filled.componentInstances.map(c=>'부품 '+c.polarity+'.'+c.instanceId+' | '+c.existenceStatus),'항목 ID | 값 | 단위 | 치수 시작·끝 기준',...filled.parameters.map(v=>{const f=fields.find(f=>f.parameterId===v.parameterId);return [v.parameterId,v.value===null?'미확정(null)':v.value,v.unit,typeof f?.basis==='object'?JSON.stringify(f.basis):f?.basis].join(' | ');}),...filled.inspectionItems.map(v=>'검사 '+v.itemId+' | '+JSON.stringify(v))].join('\n');
  const report=validateIntake(filled,'welded');if(!report.ready)throw Error(JSON.stringify(report.issues.filter(x=>x.blocking)));
  const restored=projectFromIntake(filled,'welded');
  if(JSON.stringify(restored.product.processTooling)!==JSON.stringify(p.product.processTooling)){
    // Property order is irrelevant here; the CAD/preview byte codec is unchanged.
    const canonical=x=>JSON.stringify(x, Object.keys(x||{}).sort());
    for(const f of fields.filter(x=>x.tooling)){
      const read=o=>f.adapterPath.split('.').reduce((a,k)=>a[k],o);
      if(read(restored.product)!==read(p.product))throw Error('공구 왕복 불일치 '+f.parameterId);
    }
  }
  return {filled,blank,fields,source};
}
if(import.meta.url === new URL('file:'+process.argv[1].replaceAll('\\','/')).href || process.argv[1]?.endsWith('build-intake-kit.mjs')) {
  const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const out=process.argv[2]||path.join('build/windows','CellStudio-IntakeKit-'+commit.slice(0,12));
  fs.mkdirSync(out,{recursive:true});const {filled,blank,fields,source}=kitData(commit);
  const write=(name,data)=>fs.writeFileSync(path.join(out,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');
  write('VERSION.json',{sourceCommit:commit,formatVersion:'1.4',createdAt:new Date().toISOString(),publicExampleOnly:true});
  write('01_Blank_Intake.json',blank);write('02_Field_Dictionary.json',{formatVersion:'1.4',parameters:fields});
  write('03_Public_Virtual_Source.txt',source);write('04_Filled_Virtual_Intake.json',filled);write('05_Review.csv',reviewCsv(filled));
  write('06_Copilot_Prompt.txt',fs.readFileSync('docs/intake/internal-copilot-prompt.md','utf8')+'\n\n'+fs.readFileSync('docs/windows/intake-supplement.txt','utf8'));
  write('00_사용안내.txt',fs.readFileSync('docs/windows/user-guide.txt','utf8'));
  write('07_입력필수조건.txt',fs.readFileSync('docs/windows/intake-supplement.txt','utf8'));
  write('intake.schema.json',fs.readFileSync('src/intake/schema.json','utf8'));
  console.log(JSON.stringify({directory:out,commit,parameters:filled.parameters.length,blankIsBlocked:!validateIntake(blank,'welded').ready}));
}
