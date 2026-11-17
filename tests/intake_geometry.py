import unittest,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'cad'))
from model import build,ModelError
class IntakeGeometry(unittest.TestCase):
 def test_sparse_s0_has_no_future_numbers_and_builds(self):
  p=json.loads((ROOT/'examples/intake/virtual-s0-project.json').read_text())['product']
  self.assertIsNone(p['positive']['lead']['length']);self.assertIsNone(p['pouch']['openingWidth']);self.assertIsNone(p['positive']['tab']['gatherDistance'])
  m=build(p,'stacked');self.assertEqual({s['id'] for s in m['parts']},{'stack','positive.tab','negative.tab'})
  self.assertAlmostEqual(m['features']['positive.tab.root']['point'][1],-1)
  self.assertIsNone(p['positive']['lead']['length'])
 def test_sparse_impossible_root_geometry_is_rejected(self):
  p=json.loads((ROOT/'examples/intake/virtual-s0-project.json').read_text())['product'];p['positive']['tab']['foilWidth']=10000
  with self.assertRaises(ModelError):build(p,'stacked')
 def test_stage_adapter_never_needs_future_cad_numbers(self):
  import subprocess
  code="""import fs from 'node:fs';import {dictionaryFor,requiredField,STAGES} from './src/intake/contract.js';import {projectFromIntake} from './src/intake/adapter.js';const all=[];for(const stage of ['gathered','preweld','assembly','packaged','finished']){const i=JSON.parse(fs.readFileSync('examples/intake/virtual-complete.json'));const fields=new Map(dictionaryFor(i.componentInstances).map(f=>[f.parameterId,f]));for(const p of i.parameters)if(!requiredField(fields.get(p.parameterId),i,stage)){p.value=null;p.status='missing';p.reviewStatus='pending';p.conversion=null;}all.push(projectFromIntake(i,stage));}console.log(JSON.stringify(all));"""
  projects=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT))
  for project in projects:
   with self.subTest(stage=project['stage']):
    m=build(project['product'],project['stage']);self.assertGreaterEqual(len(m['parts']),3)
    if project['stage']=='packaged':self.assertIsNone(project['product']['pouch']['foldR'])
    if project['stage']=='finished':self.assertIsNone(project['product']['pouch']['packagingExtraYMinus'])
