import unittest, json, copy, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'cad'))
from model import build, serialize
P=json.loads((ROOT/'examples/demo.json').read_text())['product']
class IntegratedGeometry(unittest.TestCase):
 def test_s3_sealant_independent_of_tape_stage_and_opposite_pole(self):
  p=copy.deepcopy(P);before=copy.deepcopy(p);a=build(p,'welded');ids={x['id'] for x in a['parts']}
  self.assertIn('positive.leadFilm',ids);self.assertNotIn('positive.tape.yellow',ids);self.assertEqual(p,before)
  p['positive']['leadFilm']['length']-=1;b=build(p,'welded');parts=lambda m:{x['id']:x for x in m['parts']}
  self.assertLess(parts(b)['positive.leadFilm']['shape'].Volume(),parts(a)['positive.leadFilm']['shape'].Volume())
  self.assertEqual(b['features']['negative.leadFilm.end'],a['features']['negative.leadFilm.end'])
  p['positive']['tapes']=[];c=build(p,'assembly');self.assertEqual(parts(c)['positive.leadFilm']['shape'].Volume(),parts(b)['positive.leadFilm']['shape'].Volume())
 def test_sealant_absence_and_s2_do_not_mutate_input(self):
  p=copy.deepcopy(P);p['positive']['preweldLead']['included']=True;p['negative']['leadFilm']['enabled']=False;before=copy.deepcopy(p)
  self.assertNotIn('positive.leadFilm',{x['id'] for x in build(p,'preweld')['parts']})
  self.assertNotIn('negative.leadFilm',{x['id'] for x in build(p,'welded')['parts']});self.assertEqual(p,before)
 def test_legacy_s3_missing_sealant_is_unconfirmed_not_zero_or_absent(self):
  p=copy.deepcopy(P);p['positive']['leadFilm']={k:None for k in p['positive']['leadFilm']};before=copy.deepcopy(p);m=build(p,'welded')
  self.assertNotIn('positive.leadFilm',{x['id'] for x in m['parts']});self.assertTrue(any('미확정' in d['message'] for d in m['diagnostics']));self.assertEqual(p,before)
