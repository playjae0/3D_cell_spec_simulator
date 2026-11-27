import json
import sys
import unittest
from pathlib import Path

import cadquery as cq

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))
from prismatic import build


class PatentCapGeometry(unittest.TestCase):
    def test_conductive_path_and_feedthrough(self):
        product = json.loads((ROOT / "examples/prismatic-patent.json").read_text())["product"]
        model = build(product, "prism-join")
        parts = {p["id"]: p["shape"] for p in model["parts"]}
        collector, terminal = parts["collector"], parts["terminal-b"]
        for solid in [collector, terminal, parts["cap-insulator"]]:
            self.assertTrue(solid.isValid())
            self.assertEqual(len(solid.Solids()), 1)
        for a, b in [(parts["tab"], collector), (collector, terminal)]:
            self.assertAlmostEqual(a.distance(b), 0)
            self.assertAlmostEqual(a.intersect(b).Volume(), 0)
            # Removing the internal interface leaves one solid only for area contact.
            self.assertEqual(len(a.fuse(b).clean().Solids()), 1)
        self.assertAlmostEqual(terminal.distance(parts["cap"]), 0.6)
        for solid in [collector, terminal, parts["cap"]]:
            self.assertAlmostEqual(parts["cap-insulator"].intersect(solid).Volume(), 0)
        # Across 42a: pin material in the bore, collector material outside it.
        for x, in_pin in [(56, True), (57.4, True), (58, False)]:
            point = cq.Vector(x, 0, -2)
            self.assertEqual(terminal.isInside(point), in_pin)
            self.assertEqual(collector.isInside(point), not in_pin)
