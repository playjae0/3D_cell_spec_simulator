"""Executable A/B/C proofs, using actual BRep sections and contact distances."""
import sys, json, copy, unittest, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cad'))
import cadquery as cq
from model import build, build_pole, tape_shape, validate, ModelError
from proof_pocket import pocket
ROOT=Path(__file__).resolve().parents[1]
P=json.loads((ROOT/'examples/demo.json').read_text())['product']

class ProofTests(unittest.TestCase):
    def test_A_asymmetric_central_gathering(self):
        p=copy.deepcopy(P);before=build(p); p['positive']['lead']['width']+=4;p['positive']['tab']['gatherZ']=.5
        after=build(p)
        for k,v in before['features'].items():
            if k.startswith('negative.'): self.assertEqual(v,after['features'][k])
        self.assertEqual(after['features']['positive.tab.gather']['point'][2],.5)
        tab=next(x['shape'] for x in after['parts'] if x['id']=='positive.tab')
        self.assertTrue(tab.isValid());self.assertEqual(len(tab.Solids()),1)
        self.assertAlmostEqual(after['features']['positive.tab.top']['point'][2]-after['features']['positive.tab.bottom']['point'][2],p['positive']['tab']['thickness'])
    def test_B_tape_top_and_wrapped_contact(self):
        for path in ['top','top_edges']:
            for dz,width in [(0,32),(.7,36)]:
                p=copy.deepcopy(P);pole=p['positive'];pole['tab']['width']=width;pole['tab']['gatherZ']=dz;pole['tab']['gatherDistance']+=3;pole['tapes'][0]['path']=path
                parts,_,_=build_pole('positive',pole,p['stack']);tab=parts[0]['shape'];tape=next(x['shape'] for x in parts if x['id']=='positive.tape.yellow')
                self.assertTrue(tape.isValid());self.assertLess(tab.distance(tape),1e-7)
                self.assertLess(tab.intersect(tape).Volume(),1e-6)
                self.assertGreater(tape.Volume(),0)
    def test_C_independent_pocket_radii_and_step_roundtrip(self):
        for depth,rf,rt in [(4.3,1.2,.85),(5.2,1.2,.85),(4.3,1.6,.85),(4.3,1.2,1.1)]:
            shape=pocket(90,45,depth,rf,rt,7,.15)
            self.assertTrue(shape.isValid());self.assertEqual(len(shape.Solids()),1)
            self.assertAlmostEqual(shape.BoundingBox().zlen,depth+.15,places=5)
            radii=[e.radius() for e in shape.Edges() if e.geomType()=='CIRCLE']
            self.assertTrue(any(abs(r-rf)<1e-6 for r in radii));self.assertTrue(any(abs(r-rt)<1e-6 for r in radii))
            # Closed thin film; not a filled pocket block.
            self.assertLess(shape.Volume(),90*45*.3)
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'pocket.step';cq.exporters.export(shape,str(path));loaded=cq.importers.importStep(str(path)).val()
            self.assertTrue(loaded.isValid());self.assertAlmostEqual(loaded.Volume(),shape.Volume(),places=5)
            for k in ['xlen','ylen','zlen']: self.assertAlmostEqual(getattr(loaded.BoundingBox(),k),getattr(shape.BoundingBox(),k),places=5)
            self.assertIn('.MILLI.',path.read_text())

if __name__=='__main__': unittest.main(verbosity=2)
