import unittest,sys,json,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cad'))
import cadquery as cq
from model import build,validate,ModelError,serialize
from process import STAGES
ROOT=Path(__file__).resolve().parents[1];P=json.loads((ROOT/'examples/demo.json').read_text())['product']
def parts(m):return {p['id']:p for p in m['parts']}
class ProcessGeometry(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.models={s:build(P,s) for s in STAGES}
 def test_7_states_parts_and_region_ids(self):
  expected={'stacked':(False,False,False,False),'gathered':(False,False,False,False),'preweld':(False,True,False,False),'welded':(True,True,True,False),'assembly':(True,True,True,True)}
  for stage,(lead,pre,main,tape) in expected.items():
   ids=parts(self.models[stage]);self.assertIn('positive.tab',ids)
   for key,present in [('lead',lead),('preweld.pre-1',pre),('joint.main',main),('tape.yellow',tape)]:self.assertEqual('positive.'+key in ids,present,(stage,key))
   self.assertTrue(all(p['shape'].isValid() for p in ids.values()))
  for stage in ['packaged','finished']:self.assertIn('pouch.upper.pocket',parts(self.models[stage]))
 def test_constant_foil_width_in_actual_cad_sections_with_y_eccentricity(self):
  p=copy.deepcopy(P);p['positive']['tab']['foilWidth']=35;p['positive']['tab']['gatherY']=2.0;m=build(p,'gathered');tab=parts(m)['positive.tab']['shape']
  # Independent BRep slicing, including between loft sample stations.
  for x in [-120,-121.25,-123.7,-127.4,-130,-135]:
   section=cq.Workplane('YZ',origin=(x,0,0)).add(tab).section().val()
   self.assertAlmostEqual(section.BoundingBox().ylen,35,places=4)
  fs=m['features'];self.assertEqual(fs['positive.tab.root']['point'][1],-1);self.assertEqual(fs['positive.tab.gather']['point'][1],2)
 def test_positive_changes_leave_all_negative_parts_and_features(self):
  p=copy.deepcopy(P);p['positive']['tab']['foilWidth']=34;p['positive']['tab']['rootLength']+=1;after=build(p,'assembly');base=self.models['assembly'];a=parts(after)
  for b in base['parts']:
   if b['id'].startswith('negative.'):self.assertAlmostEqual(a[b['id']]['shape'].Volume(),b['shape'].Volume(),places=6)
  for k,v in base['features'].items():
   if k.startswith('negative.'):self.assertEqual(after['features'][k],v)
 def test_downstream_edits_do_not_change_upstream_geometry(self):
  p=copy.deepcopy(P);p['positive']['tab']['gatherZ']=.5;p['positive']['tab']['axialShortening']=.5;p['positive']['tab']['edgeR']=.12;p['positive']['lead']['width']+=3;p['positive']['joints'][0]['width']-=1;p['positive']['tapes'][0]['length']-=1
  raw=build(p,'stacked');self.assertEqual(serialize(raw)['parts'],serialize(self.models['stacked'])['parts'])
  p=copy.deepcopy(P);p['positive']['preweldLead']['included']=True;base=build(p,'preweld');p['positive']['lead']['width']+=3;p['positive']['joints'][0]['length']+=.1;p['positive']['tapes'][0]['thickness']+=.01
  after=build(p,'preweld');self.assertEqual(serialize(base)['parts'],serialize(after)['parts'])
 def test_upstream_stock_length_feeds_later_tip_without_changing_root(self):
  p=copy.deepcopy(P);p['positive']['tab']['rootLength']+=1;after=build(p,'assembly');a=after['features'];b=self.models['assembly']['features']
  self.assertEqual(a['positive.tab.root'],b['positive.tab.root']);self.assertAlmostEqual(a['positive.tab.tipCenter']['point'][0]-b['positive.tab.tipCenter']['point'][0],-1)
 def test_absent_stage_reference_and_deleted_reference_are_distinct(self):
  m=self.models['stacked'];self.assertFalse(m['features']['positive.joint.main.start']['available']);self.assertFalse(m['features']['positive.tab.gather']['available']);self.assertTrue(self.models['welded']['features']['positive.joint.main.start']['available'])
  p=copy.deepcopy(P);p['positive']['joints']=[];self.assertNotIn('positive.joint.main.start',build(p,'assembly')['features'])
 def test_invalid_future_geometry_does_not_block_s0(self):
  p=copy.deepcopy(P);p['positive']['lead']['width']=-2;p['pouch']['upperDepth']=.1;validate(p,'stacked')
  with self.assertRaises(ModelError):validate(p,'welded')
 def test_preweld_is_management_face_and_optional_lead_is_explicit(self):
  p=copy.deepcopy(P);p['positive']['preweldLead']['included']=True;m=build(p,'preweld');ids=parts(m);self.assertIn('positive.lead',ids);self.assertNotIn('negative.lead',ids);self.assertNotIn('positive.joint.main',ids);self.assertEqual(ids['positive.preweld.pre-1']['role'],'region');self.assertEqual(len(ids['positive.preweld.pre-1']['shape'].Solids()),0)
 def test_invalid_preweld_geometry_rejected_without_clamping(self):
  p=copy.deepcopy(P);p['positive']['prewelds'][0]['width']=500;snapshot=copy.deepcopy(p)
  with self.assertRaises(ModelError):validate(p,'preweld')
  self.assertEqual(p,snapshot)
 def test_region_display_uses_same_global_xy_as_reference_on_both_poles(self):
  for stage in ['preweld','welded','assembly']:
   model=self.models[stage];serialized={p['id']:p for p in serialize(model)['parts']}
   for part in model['parts']:
    if part['role']!='region':continue
    original=part['shape'].BoundingBox();display=part['displayShape'].BoundingBox()
    for key in ['xmin','xmax','ymin','ymax']:
     self.assertAlmostEqual(getattr(original,key),getattr(display,key),places=6,msg=part['id'])
    mesh=serialized[part['id']]['mesh']['positions']
    self.assertAlmostEqual(min(mesh[0::3]),original.xmin,places=5)
    self.assertAlmostEqual(max(mesh[1::3]),original.ymax,places=5)
    self.assertGreater(display.zmin,original.zmin)
if __name__=='__main__':unittest.main(verbosity=2)
