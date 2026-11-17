"""Round-trip the newly added early states through STEP (same CAD kernel)."""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'cad'))
import cadquery as cq
from model import build

product = json.loads((ROOT / 'examples/demo.json').read_text())['product']
report = []
with tempfile.TemporaryDirectory() as tmp:
    for stage in ['stacked', 'gathered', 'preweld', 'welded']:
        model = build(product, stage)
        original = cq.Compound.makeCompound([
            p['shape'] for p in model['parts'] if p['role'] != 'region'
        ])
        path = Path(tmp) / (stage + '.step')
        cq.exporters.export(original, str(path))
        restored = cq.importers.importStep(str(path)).val()
        error = max(abs(getattr(original.BoundingBox(), k) -
                        getattr(restored.BoundingBox(), k))
                    for k in ['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'])
        volume_error = abs(original.Volume() - restored.Volume())
        assert restored.isValid() and len(original.Solids()) == len(restored.Solids())
        assert error < 1e-5 and volume_error < 1e-3
        assert '.MILLI.' in path.read_text()
        report.append(dict(stage=stage, unit='mm', solids=len(restored.Solids()),
                           maxBBoxErrorMm=error, volumeErrorMm3=volume_error))
output = ROOT / 'docs/validation-v1.2/early-step-roundtrip.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
