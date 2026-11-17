import sys,json,copy,unittest,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'cad'))
import cadquery as cq
from model import build,serialize,validate,ModelError
P=json.loads((ROOT/'examples/demo.json').read_text())['product']
class Regression(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.models={stage:build(P,stage) for stage in ['assembly','packaged','finished']}
    def test_three_states_keep_internal_part_identity(self):
        base=self.models['assembly']['features'];
        for stage in ['packaged','finished']:
            for k,v in base.items(): self.assertEqual(v,self.models[stage]['features'][k])
            self.assertTrue(all(p['shape'].isValid() for p in self.models[stage]['parts']))
    def test_separate_seal_and_trim_dimensions(self):
        f=self.models['packaged']['features'];q=P['pouch']
        self.assertAlmostEqual(f['pouch.sealOuter.y.plus']['point'][1]-f['pouch.sealInner.y.plus']['point'][1],q['sealWidth'])
        self.assertAlmostEqual(f['pouch.trim.y.plus']['point'][1]-f['pouch.sealOuter.y.plus']['point'][1],q['trimMargin'])
        self.assertNotEqual(self.models['finished']['features']['pouch.trim.y.plus']['point'],f['pouch.trim.y.plus']['point'])
    def test_invalid_conditions_rejected_without_mutation(self):
        for change in [lambda p:p['pouch'].update(upperDepth=1),lambda p:p['positive']['joints'][0].update(width=90),lambda p:p['negative']['tapes'][0].update(start=100),lambda p:p['positive']['tab'].update(rootSpread=50),lambda p:p['stack'].update(width=-5),lambda p:p['pouch'].update(upperFloorR=30)]:
            p=copy.deepcopy(P);change(p);snapshot=copy.deepcopy(p)
            with self.assertRaises(ModelError):validate(p)
            self.assertEqual(p,snapshot)
    def test_deleted_tape_feature_is_absent(self):
        p=copy.deepcopy(P);p['positive']['tapes']=[];m=build(p)
        self.assertNotIn('positive.tape.yellow.face',m['features']);self.assertIn('negative.tape.yellow.face',m['features'])
    def test_lead_contact_side_and_tape_host_face_are_explicit(self):
        p=copy.deepcopy(P);p['positive']['lead']['contactSide']='above'
        with self.assertRaisesRegex(ModelError,'테이프가 리드 접촉면'):validate(p)
        p['positive']['tapes'][0]['face']='bottom';m=build(p)
        parts={x['id']:x['shape'] for x in m['parts']}
        self.assertLess(parts['positive.tape.yellow'].distance(parts['positive.tab']),1e-7)
        self.assertLess(parts['positive.tape.yellow'].intersect(parts['positive.lead']).Volume(),1e-6)
    def test_named_planar_face_centers_are_on_cad_faces(self):
        m=self.models['assembly'];parts={p['id']:p['shape'] for p in m['parts']}
        for key,feature in m['features'].items():
            if feature['kind']=='face' and 'normal' in feature:
                vertex=cq.Vertex.makeVertex(*feature['point']);self.assertLess(parts[feature['partId']].distance(vertex),1e-6,key)
    def test_pouch_film_and_wrapped_tape_refs_are_on_surfaces(self):
        m=self.models['packaged'];parts={p['id']:p['shape'] for p in m['parts']}
        for side in ['upper','lower']:
            a=m['features'][f'pouch.{side}.innerFloor'];b=m['features'][f'pouch.{side}.outerFloor']
            self.assertAlmostEqual(abs(a['point'][2]-b['point'][2]),P['pouch']['filmThickness'])
            for f in [a,b]:self.assertLess(parts[f['partId']].distance(cq.Vertex.makeVertex(*f['point'])),1e-6)
        p=copy.deepcopy(P);p['positive']['tapes'][0]['path']='top_edges';m=build(p);parts={x['id']:x['shape'] for x in m['parts']}
        for suffix in ['widthMinus','widthPlus']:
            f=m['features']['positive.tape.yellow.'+suffix]
            self.assertLess(parts[f['partId']].distance(cq.Vertex.makeVertex(*f['point'])),1e-6)
    def test_mesh_resolution_does_not_change_measurements(self):
        m=self.models['packaged'];fine=serialize(m,.04);coarse=serialize(m,.5)
        self.assertEqual(fine['features'],coarse['features']);self.assertEqual(fine['features']['pouch.upper.floorR']['value'],1.2)
    def test_full_step_roundtrip_each_state(self):
        report=[]
        with tempfile.TemporaryDirectory() as tmp:
            for stage,m in self.models.items():
                compound=cq.Compound.makeCompound([p['shape'] for p in m['parts'] if p['role']!='region']);path=Path(tmp)/(stage+'.step');cq.exporters.export(compound,str(path));loaded=cq.importers.importStep(str(path)).val()
                self.assertTrue(loaded.isValid());self.assertEqual(len(loaded.Solids()),len(compound.Solids()));self.assertAlmostEqual(loaded.Volume(),compound.Volume(),places=4)
                errors=[abs(getattr(loaded.BoundingBox(),k)-getattr(compound.BoundingBox(),k)) for k in ['xlen','ylen','zlen']];self.assertLess(max(errors),1e-5);self.assertIn('.MILLI.',path.read_text())
                report.append({'stage':stage,'unit':'mm','solids':len(loaded.Solids()),'maxBBoxErrorMm':max(errors),'volumeErrorMm3':abs(loaded.Volume()-compound.Volume())})
        (ROOT/'docs/validation/step-roundtrip.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':unittest.main(verbosity=2)
