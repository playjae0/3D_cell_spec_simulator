import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))
from server import model_for
from model import ModelError
from prismatic import STAGES, HARDWARE


def calculate(changes=None, stage="prism-insert"):
    p = json.loads((ROOT / "examples/prismatic.json").read_text())
    p["product"]["values"].update({d["id"]: d["default"] for d in HARDWARE})
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
                self.assertEqual(len(m["features"]), 51)

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
            [len(calculate(stage=s)["parts"]) for s in STAGES], [4, 11, 12, 13, 14]
        )
        seat, approach = calculate(), calculate({"A01": 95})
        for a, b in zip(seat["parts"], approach["parts"]):
            for side in ("min", "max"):
                x, y, z = a["bounds"][side]
                self.assertAlmostEqual(b["bounds"][side][0], x, places=7)
                self.assertAlmostEqual(b["bounds"][side][1], y, places=7)
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

    def test_terminal_rise_through_all_descendants(self):
        for stage in STAGES[1:]:
            with self.subTest(stage=stage):
                a, b = calculate(stage=stage), calculate({"T05": 5}, stage)
                aa, bb = ({part["id"]: part for part in m["parts"]} for m in (a, b))
                self.assertEqual(
                    {key for key in aa if aa[key] != bb[key]}, {"terminal-a"}
                )
                self.assertEqual(
                    aa["terminal-a"]["bounds"]["min"], bb["terminal-a"]["bounds"]["min"]
                )
                self.assertAlmostEqual(
                    bb["terminal-a"]["bounds"]["max"][2]
                    - aa["terminal-a"]["bounds"]["max"][2],
                    1,
                )
                self.assertEqual(a["approval"], b["approval"])
                self.assertEqual(a["datums"], b["datums"])
                for key in ("K03", "T10", "A06", "A07", "J04", "J05"):
                    self.assertEqual(a["features"][key], b["features"][key])
                self.assertEqual(
                    (a["features"]["T05"]["value"], b["features"]["T05"]["value"]),
                    (4, 5),
                )

    def test_physical_collector_and_moving_endpoints(self):
        thick = calculate({"K08": 2.5})
        self.assertAlmostEqual(thick["features"]["A07"]["value"], 2)
        self.assertFalse(thick["approval"]["seated"])
        self.assertTrue(
            any("집전체 +X -0.50" in d["message"] for d in thick["diagnostics"])
        )
        for stroke in (0, 45, 95):
            m = calculate({"A01": stroke})
            self.assertAlmostEqual(m["currentBottomGap"]["value"], 1.75 + stroke)
            self.assertAlmostEqual(m["features"]["A06"]["value"], 1.75)
            by_id = {p["id"]: p for p in m["parts"]}
            self.assertEqual(
                m["currentBottomGap"]["end"][2], by_id["insulation"]["bounds"]["min"][2]
            )
            self.assertEqual(
                m["features"]["A01"]["end"][2], by_id["cap"]["bounds"]["min"][2]
            )
            self.assertEqual(
                m["features"]["A01"]["start"][2], by_id["can"]["bounds"]["max"][2]
            )

    def test_legacy_geometry(self):
        project = json.loads((ROOT / "examples/prismatic.json").read_text())
        project["stage"] = "prism-join"
        self.assertEqual(model_for(project)[2], calculate(stage="prism-join"))
