import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))
from server import model_for
from model import ModelError
from prismatic import STAGES


def calculate(changes=None, stage="prism-insert"):
    p = json.loads((ROOT / "examples/prismatic.json").read_text())
    p["product"]["values"].update(changes or {})
    p["stage"] = stage
    return model_for(p)[2]


class PrismaticGeometry(unittest.TestCase):
    def test_independent_acceptance(self):
        cases = json.loads(
            (ROOT / "tests/fixtures/prismatic-acceptance.json").read_text()
        )
        for case in cases:
            with self.subTest(changes=case["change"]):
                m = calculate(case["change"], "prism-weld")
                for key, expected in case["expected_mm"].items():
                    self.assertAlmostEqual(
                        m["features"][key]["value"], expected, places=7, msg=key
                    )
                self.assertEqual(
                    m["approval"]["welded"], case["change"] in ({}, {"S02": 30})
                )
                self.assertEqual(
                    "weld" in [p["id"] for p in m["parts"]], m["approval"]["welded"]
                )
                self.assertEqual(len(m["features"]), 40)

    def test_width_and_datum(self):
        a, b = calculate(), calculate({"S02": 30})
        aa, bb = [{p["id"]: p for p in m["parts"]} for m in (a, b)]
        self.assertEqual(a["datums"], b["datums"])
        for id in ["tab", "collector", "cap", "can"]:
            self.assertEqual(aa[id], bb[id])
        for side, change in [("min", -1), ("max", 1)]:
            self.assertAlmostEqual(
                bb["stack"]["bounds"][side][1] - aa["stack"]["bounds"][side][1], change
            )
        self.assertAlmostEqual(
            calculate({"J01": -0.3})["features"]["A04"]["value"], 1.45
        )

    def test_stage_and_rigid_travel(self):
        self.assertEqual(
            [len(calculate(stage=s)["parts"]) for s in STAGES], [2, 4, 5, 6, 7]
        )
        seat, approach = calculate(), calculate({"A01": 95})
        for a, b in zip(seat["parts"], approach["parts"]):
            for side in ("min", "max"):
                x, y, z = a["bounds"][side]
                self.assertEqual(b["bounds"][side][:2], [x, y])
                self.assertAlmostEqual(
                    b["bounds"][side][2] - z, 0 if a["id"] == "can" else 95
                )
        self.assertFalse(approach["approval"]["seated"])
        self.assertTrue(seat["sections"]["x"]["can"])
        self.assertFalse(calculate({"S02": 32})["approval"]["seated"])
        self.assertFalse(calculate({"J02": 10}, "prism-join")["approval"]["joined"])
        self.assertFalse(calculate({"J01": 22}, "prism-join")["approval"]["joined"])
        self.assertFalse(calculate({"A01": 95}, "prism-weld")["approval"]["welded"])

    def test_input_validation(self):
        for changes in [
            {"I02": 85},
            {"S02": -2},
            {"A01": -1},
            {"computed": 1},
            {"K04": None},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ModelError):
                calculate(changes)
