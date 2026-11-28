"""Fixed demonstration terminal. All lengths are virtual and in mm."""

from itertools import combinations
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import cadquery as cq

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))
import prismatic


def build(**changes):
    product = json.loads((ROOT / "examples/prismatic-demo-b.json").read_text())[
        "product"
    ]
    product["values"].update(changes)
    return prismatic.build(product, "prism-insert")


def solids(model):
    return {p["id"]: p["shape"] for p in model["parts"] if p["role"] == "solid"}


class DemoB(unittest.TestCase):
    def test_fixed_terminal_and_witnesses(self):
        original = solids(build())["terminal-b"]
        for thickness, travel in [(2, 0), (3, 0), (3, 45)]:
            m = build(K03=thickness, A01=travel)
            parts, f = solids(m), m["features"]["T10"]
            self.assertAlmostEqual(f["value"], 6 - thickness)
            self.assertEqual(f["dimensionLine"][0][:2], f["dimensionLine"][1][:2])
            self.assertLess(
                f["dimensionLine"][0][1], prismatic.exact_bounds(parts["cap"]).ymin
            )
            terminal = parts["terminal-b"].translate((0, 0, -travel))
            self.assertAlmostEqual(terminal.Volume(), original.Volume())
            self.assertAlmostEqual(original.cut(terminal).Volume(), 0)
            for key, endpoint in [("cap", "start"), ("terminal-b", "end")]:
                top = max(
                    (
                        face
                        for face in parts[key].Faces()
                        if face.geomType() == "PLANE" and face.normalAt().z > 0.999999
                    ),
                    key=lambda face: face.Center().z,
                )
                point = cq.Vertex.makeVertex(*f[endpoint])
                self.assertAlmostEqual(top.distance(point), 0)
                self.assertGreater(
                    min(edge.distance(point) for edge in top.Edges()), 0.1
                )
            print("K03, travel, measured T10, witnesses:", thickness, travel, f)

    def test_nominal_seat_and_interference(self):
        for k in (2, 3):
            m = build(K03=k)
            self.assertTrue(m["approval"]["seated"])
            for (a, s), (b, t) in combinations(solids(m).items(), 2):
                self.assertLess(s.intersect(t).Volume(), 1e-7, (a, b))
        m = build(K08=2.5)
        parts = solids(m)
        self.assertAlmostEqual(parts["terminal-b"].Volume(), solids(build())["terminal-b"].Volume())
        self.assertAlmostEqual(m["features"]["A07"]["value"], 2)
        self.assertGreater(parts["collector"].intersect(parts["can"]).Volume(), 0)
        self.assertFalse(m["approval"]["seated"])

    def test_separated_contact(self):
        generate = prismatic.stack_parts

        def separated(*args):
            parts = generate(*args)
            parts["tab"] = parts["tab"].translate((-0.25, 0, 0))
            return parts

        with patch.object(prismatic, "stack_parts", separated):
            m = build()
        self.assertGreater(
            min(m["features"][key]["value"] for key in ("J04", "J05")), 0
        )
        self.assertFalse(m["approval"]["joined"])
        self.assertFalse({"contact", "joint"} & {p["id"] for p in m["parts"]})
