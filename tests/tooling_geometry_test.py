import unittest,json,sys,copy,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cad'))
from model import build,serialize
from process import ModelError
from geometry_metrics import exact_bounds
from process_tooling import outline,slab
import cadquery as cq
DEMO=json.loads((Path(__file__).resolve().parents[1]/'examples/process-tooling-r4.json').read_text())['product']
def part(m,id):return next(x['shape'] for x in m['parts'] if x['id']==id)
class ToolingGeometry(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.pre=build(DEMO,'preweld');cls.seal=build(DEMO,'tab_sealed')
 def test_depth_keeps_width_root_bottom_opposite_and_propagates(self):
  p=copy.deepcopy(DEMO);p['processTooling']['poles']['positive']['gathering']['depth']+=.1
  m=build(p,'preweld');a=self.pre['toolingResults']['poles']['positive'];b=m['toolingResults']['poles']['positive']
  self.assertAlmostEqual(b['entryZ']-a['entryZ'],-.05);self.assertAlmostEqual(b['residualThickness'],.5);self.assertAlmostEqual(b['topSlope'],-.3)
  for k in ['bottomZ','bottomSlope','entryX','foilWidth','rootZ','rootSpread']:self.assertEqual(a[k],b[k])
  self.assertEqual(m['toolingResults']['poles']['negative'],self.pre['toolingResults']['poles']['negative'])
  self.assertNotAlmostEqual(part(m,'positive.tab').Volume(),part(self.pre,'positive.tab').Volume())
  self.assertAlmostEqual(part(m,'negative.tab').Volume(),part(self.pre,'negative.tab').Volume())
  end=build(p,'assembly');self.assertAlmostEqual(end['toolingResults']['poles']['positive']['residualThickness'],.5)
 def test_horn_half_pitch_moves_only_its_exact_nominal_contact(self):
  p=copy.deepcopy(DEMO);f=p['processTooling']['poles']['positive']['tools']['preweld']['horn'];f['x']+=f['pitchU']/2;m=build(p,'preweld')
  a=self.pre['toolingResults']['plans'];b=m['toolingResults']['plans'];self.assertAlmostEqual(b['positive']['tools']['horn']['center'][0]-a['positive']['tools']['horn']['center'][0],.4)
  self.assertEqual(a['positive']['tools']['anvil'],b['positive']['tools']['anvil']);self.assertEqual(a['negative'],b['negative'])
  self.assertAlmostEqual(part(m,'positive.contact.horn').Center().x-part(self.pre,'positive.contact.horn').Center().x,-.4)
  self.assertAlmostEqual(part(m,'tool.positive.preweld.horn').Center().z,.3);self.assertAlmostEqual(part(m,'tool.positive.preweld.anvil').Center().z,-.3)
 def test_laser_perimeter_and_stable_ids(self):
  p=copy.deepcopy(DEMO);c=p['processTooling']['poles']['positive'];c['method']='laser';c['laser']['spots'][0]['dx']=-1.7;m=build(p,'welded');spots=m['toolingResults']['plans']['positive']['spots'];self.assertEqual(len(spots),6);self.assertTrue(spots[0]['outside']);self.assertGreater(spots[0]['x'],p['positive']['lead']['start'])
  c['laser']['spots'].pop(0);n=build(p,'welded');self.assertEqual([s['id'] for s in n['toolingResults']['plans']['positive']['spots']],[s['id'] for s in spots[1:]])
  c['laser']['spots'].append({'id':'added','row':0,'column':0,'dx':0,'dy':0});self.assertEqual(len(build(p,'welded')['toolingResults']['plans']['positive']['spots']),6)
 def test_arc_union_width_and_unchanged_outer_negative_lead(self):
  p=copy.deepcopy(DEMO)
  for half in ['upper','lower']:p['processTooling']['sealBars']['positive_'+half]['vertices'][1]['arc']=-2
  m=build(p,'tab_sealed');a=self.seal['toolingResults']['seals'];b=m['toolingResults']['seals']
  self.assertGreater(b['positive']['sections'][0]['width'],a['positive']['sections'][0]['width']+.8)
  self.assertAlmostEqual(a['positive']['sections'][1]['width'],b['positive']['sections'][1]['width'])
  self.assertGreater(b['positive']['productArea'],a['positive']['productArea']);self.assertEqual(a['negative'],b['negative'])
  self.assertAlmostEqual(exact_bounds(part(m,'seal.positive')).xmin,exact_bounds(part(self.seal,'seal.positive')).xmin)
  self.assertAlmostEqual(part(m,'positive.lead').Volume(),part(self.seal,'positive.lead').Volume())
  for half in ['upper','lower']:p['processTooling']['sealBars']['positive_'+half]['extra']['enabled']=True
  n=build(p,'tab_sealed');self.assertGreater(n['toolingResults']['seals']['positive_upper']['projectionArea'],b['positive_upper']['baseArea'])
 def test_one_film_open_cups_close_gas_and_trim(self):
  p=copy.deepcopy(DEMO);opened=build(p,'assembly_loaded_open')
  a=part(opened,'pouch.lower.pocket');b=part(opened,'pouch.upper.pocket');bridge=part(opened,'pouch.bridge')
  self.assertAlmostEqual(exact_bounds(a).zmax,exact_bounds(b).zmax)
  self.assertGreater(exact_bounds(a).ymin,exact_bounds(b).ymax)
  for half in ['upper','lower']:self.assertLess(part(opened,'pouch.'+half+'.flange').distance(bridge),1e-6)
  p['pouchProcess']['sheets']['upper']['depth']+=.4;p['pouchProcess']['sheets']['upper']['floorR']+=.2;p['processTooling']['packaging']['cups']['upper']['x']=1
  changed=build(p,'assembly_loaded_open');self.assertNotAlmostEqual(part(changed,'pouch.upper.pocket').Volume(),b.Volume());self.assertAlmostEqual(part(changed,'pouch.lower.pocket').Volume(),a.Volume());self.assertAlmostEqual(exact_bounds(part(changed,'pouch.upper.pocket')).xmin-exact_bounds(b).xmin,1)
  for stage,expected in [('package_closed',[]),('tab_sealed',['positive','negative']),('gas_sealed',['positive','negative','gas']),('final_sealed',['positive','negative','gas','final']),('package_trimmed',['positive','negative','final'])]:
   m=build(DEMO,stage);self.assertEqual([x['id'][5:] for x in m['parts'] if x['id'].startswith('seal.')],expected)
  trim=build(DEMO,'package_trimmed');p=copy.deepcopy(DEMO);p['processTooling']['packaging']['cutY']=52;n=build(p,'package_trimmed');self.assertEqual(n['toolingResults']['packaging']['remainingFlange']-trim['toolingResults']['packaging']['remainingFlange'],2)
  self.assertGreater(part(n,'pouch.lower.flange').Volume(),part(trim,'pouch.lower.flange').Volume());self.assertEqual(p['processTooling']['sealBars'],DEMO['processTooling']['sealBars'])
  folded=build(DEMO,'package_folded');self.assertAlmostEqual(sum(part(folded,'pouch.'+h+'.flange').Volume() for h in ['lower','upper']),sum(part(trim,'pouch.'+h+'.flange').Volume() for h in ['lower','upper']),places=3)
 def test_recess_section_removes_only_its_position_from_contact(self):
  p=copy.deepcopy(DEMO);f=p['processTooling']['sealBars']['positive_upper']['relief'];f['enabled']=True;f['u']=-15.5
  m=build(p,'tab_sealed');a=self.seal['toolingResults']['seals'];b=m['toolingResults']['seals']
  self.assertEqual(b['positive']['sections'][1]['width'],0);self.assertEqual(a['negative'],b['negative'])
  self.assertGreater(a['positive']['productArea'],b['positive']['productArea'])
 def test_unclosed_gas_seal_is_rejected(self):
  p=copy.deepcopy(DEMO)
  for half in ['upper','lower']:p['processTooling']['sealBars']['positive_'+half]['u']=17.5
  with self.assertRaisesRegex(ModelError,'브리지'):build(p,'gas_sealed')
 def test_invalid_depth_rejects_without_mutation(self):
  p=copy.deepcopy(DEMO);p['processTooling']['poles']['positive']['gathering']['depth']=10;s=copy.deepcopy(p)
  with self.assertRaises(ModelError):build(p,'preweld')
  self.assertEqual(p,s)
if __name__=='__main__':unittest.main()
