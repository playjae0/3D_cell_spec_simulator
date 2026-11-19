import unittest,json,sys,copy,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cad'))
from model import build,serialize
from process import ModelError
from tool_teeth import generate
from geometry_metrics import exact_bounds
P=json.loads((Path(__file__).resolve().parents[1]/'examples/pouch-phase1.json').read_text())['product']
def teeth(m,kind='horn',side='positive'):
 return next(p for p in m['parts'] if p['id']==f'tool.{side}.welded.{kind}.teeth')
class ComponentGeometry(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.base=build(P,'welded')
 def test_pitch_changes_actual_centers_not_mate_or_datum(self):
  p=copy.deepcopy(P);p['processTooling']['poles']['positive']['tools']['welded']['horn']['pitchU']=1
  m=build(p,'welded');a=teeth(self.base);b=teeth(m)
  def steps(x):return sorted(set(round(c[0],8) for c in x['meta']['centers']))
  self.assertAlmostEqual(steps(a)[1]-steps(a)[0],.8);self.assertAlmostEqual(steps(b)[1]-steps(b)[0],1)
  self.assertEqual(a['meta']['datum'],b['meta']['datum']);self.assertNotEqual(a['meta']['toothCount'],b['meta']['toothCount'])
  for kind,side in [('anvil','positive'),('horn','negative'),('anvil','negative')]:self.assertEqual(teeth(m,kind,side)['meta'],teeth(self.base,kind,side)['meta'])
 def test_anvil_height_keeps_tip_plane_root_moves(self):
  p=copy.deepcopy(P);p['processTooling']['poles']['positive']['tools']['welded']['anvil']['height']=.3
  m=build(p,'welded');a=teeth(self.base,'anvil');b=teeth(m,'anvil');da=a['meta']['datum'];db=b['meta']['datum']
  self.assertEqual(da['origin'],db['origin']);self.assertEqual(da['tipZ'],db['tipZ']);self.assertAlmostEqual(db['rootZ']-da['rootZ'],-.15)
  self.assertAlmostEqual(exact_bounds(b['shape']).zmin-exact_bounds(a['shape']).zmin,-.15)
  self.assertEqual(teeth(self.base)['meta'],teeth(m)['meta'])
 def test_invalid_pitch_and_empty_relief_rejected(self):
  p=copy.deepcopy(P);f=p['processTooling']['poles']['positive']['tools']['welded']['horn'];f['pitchU']=0
  with self.assertRaises(ModelError):build(p,'welded')
  f['pitchU']=20
  with self.assertRaisesRegex(ModelError,'완전한 치형'):build(p,'welded')
 def test_ridge_and_rotated_boundary_are_valid_solids(self):
  f=copy.deepcopy(P['processTooling']['poles']['positive']['tools']['welded']['horn']);f.update(tooth='ridge',direction=15)
  shape,centers=generate(f,'horn');self.assertTrue(shape.isValid());self.assertTrue(len(centers)>2)
  for solid in shape.Solids():
   b=exact_bounds(solid);self.assertLessEqual(b.xmax,f['knurlLength']/2+1e-8);self.assertGreaterEqual(b.xmin,-f['knurlLength']/2-1e-8)
 def test_seal_center_and_exterior_sections_use_exact_boundary(self):
  m=build(P,'tab_sealed');ss=m['toolingResults']['seals']['positive_upper']['crossSections'];d={s['id']:s for s in ss}
  self.assertAlmostEqual(d['central']['width'],3);self.assertAlmostEqual(d['outside-left']['width'],5);self.assertAlmostEqual(d['outside-right']['width'],5)
  p=copy.deepcopy(P);p['processTooling']['sealBars']['positive_upper']['relief'].update(enabled=True,u=0,depth=.35)
  n=build(p,'tab_sealed')['toolingResults']['seals']['positive_upper']['crossSections'];self.assertAlmostEqual(n[0]['recessDepth'],.35);self.assertEqual(n[1]['recessDepth'],0)
 def test_r4_nonzero_legacy_placement_is_explicitly_rejected(self):
  p=copy.deepcopy(P);p['pouchProcess']['assemblyPose']['x']=1
  with self.assertRaisesRegex(ModelError,'비영 조립 배치'):build(p,'package_folded')
 def test_legacy_lead_film_relative_position_and_width(self):
  a=build(P,'assembly');p=copy.deepcopy(P);relative=p['positive']['leadFilm']['start']-p['positive']['lead']['start'];p['positive']['lead']['start']+=.2;p['positive']['leadFilm']['start']=p['positive']['lead']['start']+relative;p['positive']['lead']['width']+=1
  b=build(json.loads(json.dumps(p)),'assembly')
  def bounds(m,id):return exact_bounds(next(x['shape'] for x in m['parts'] if x['id']==id))
  for id in ['positive.lead','positive.leadFilm']:self.assertAlmostEqual(bounds(b,id).xmin-bounds(a,id).xmin,-.2)
  self.assertAlmostEqual(bounds(b,'positive.leadFilm').ylen-bounds(a,'positive.leadFilm').ylen,1)
  self.assertAlmostEqual(bounds(b,'negative.leadFilm').ylen,bounds(a,'negative.leadFilm').ylen)
