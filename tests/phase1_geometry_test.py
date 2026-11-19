import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))

import cadquery as cq
from model import build, ModelError
from tab_seal import tab_face


SOURCE = json.loads((ROOT / "examples/pouch-phase1.json").read_text())["product"]
STAGES = ("tab_sealed", "final_sealed", "package_trimmed", "package_folded")


def part(model, id):
    return next(p["shape"] for p in model["parts"] if p["id"] == id)


def package(model):
    return model["toolingResults"]["packaging"]


def seal(model, side="positive"):
    return model["toolingResults"]["seals"][side]


def profile_summary(model, side):
    report = seal(model, side)
    dims = report["tabDimensions"]
    return {
        "L": dims["center"]["length"], "R": dims["radius"]["radius"],
        **report["profileWidths"], "area": report["productArea"],
    }


def edit(key, value, halves=("upper", "lower")):
    source = copy.deepcopy(SOURCE)
    for half in halves:
        source["processTooling"]["sealBars"]["positive_" + half]["tabProfile"][key] = value
    return source


class Phase1Geometry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = {stage: build(SOURCE, stage) for stage in STAGES}

    def assert_point_on(self, shape, point):
        self.assertLess(shape.distance(cq.Vertex.makeVertex(*point)), 1e-6)

    def test_tangent_fillets_and_two_constant_widths(self):
        bar = SOURCE["processTooling"]["sealBars"]["positive_upper"]
        face, refs = tab_face(bar, SOURCE)
        arcs = [e for e in face.outerWire().Edges() if e.geomType() == "CIRCLE"]
        self.assertEqual(len(arcs), 4)
        for edge in arcs:
            self.assertAlmostEqual(edge.radius(), 3)
            for f in (0, 1):
                point = edge.positionAt(f)
                joined = [e for e in face.Edges() if e.geomType() == "LINE"
                          and any((e.positionAt(t) - point).Length < 1e-7 for t in (0, 1))]
                self.assertEqual(len(joined), 1)
                self.assertAlmostEqual(abs(joined[0].tangentAt().dot(edge.tangentAt(f))), 1)
        self.assertAlmostEqual(refs["center"].Length(), 38)

    def test_each_edit_reaches_the_folded_product(self):
        before = self.baseline["package_folded"]
        base = profile_summary(before, "positive")
        for key, value, expected in [
            ("centerLength", 42, {"L": 42, "R": 3}),
            ("transitionR", 5, {"L": 38, "R": 5}),
        ]:
            source = edit(key, value)
            for stage in ("tab_sealed", "package_folded"):
                with self.subTest(key=key, stage=stage):
                    new = build(source, stage)
                    dims = profile_summary(new, "positive")
                    original = profile_summary(self.baseline[stage], "positive")
                    self.assertAlmostEqual(dims["L"], expected["L"])
                    self.assertAlmostEqual(dims["R"], expected["R"])
                    self.assertGreater(abs(dims["area"] - original["area"]), .1)
                    for position in ("left", "center", "right"):
                        self.assertAlmostEqual(dims[position], base[position])
                    self.assertEqual(profile_summary(new, "negative"), profile_summary(self.baseline[stage], "negative"))
                    for key in ("L.a", "L.b", "R"):
                        point = new["features"]["phase1.seal.positive." + key]["point"]
                        self.assert_point_on(part(new, "seal.positive"), point)

    def test_one_bar_limits_contact_and_invalid_dimensions_are_rejected(self):
        new = build(edit("centerLength", 42, ("upper",)), "tab_sealed")
        self.assertIn("upper", seal(new)["limitingBars"])
        for key, value, reason in [
            ("centerLength", 15, "금속 리드"),
            ("centerLength", 90, "공구 끝"),
            ("transitionR", 15, "접선 구간"),
        ]:
            with self.assertRaisesRegex(ModelError, reason):
                build(edit(key, value), "tab_sealed")

    def test_cut_retains_film_reference_and_fold_moves_the_seals(self):
        edited = copy.deepcopy(SOURCE)
        edited["processTooling"]["packaging"]["cutY"] = 52
        previous = self.baseline["final_sealed"]
        unchanged = build(edited, "final_sealed")
        for id in ("pouch.lower.flange", "pouch.upper.flange", "positive.lead", "negative.lead", "seal.gas"):
            self.assertAlmostEqual(part(previous, id).Volume(), part(unchanged, id).Volume())
            self.assertAlmostEqual(part(previous, id).BoundingBox().ymax, part(unchanged, id).BoundingBox().ymax)
        self.assertAlmostEqual(package(previous)["gasAllowance"], 40.5)
        for source, y, flat, folded in [
            (SOURCE, 50, self.baseline["package_trimmed"], self.baseline["package_folded"]),
            (edited, 52, build(edited, "package_trimmed"), build(edited, "package_folded")),
        ]:
            self.assertNotIn("seal.gas", [p["id"] for p in folded["parts"]])
            self.assertAlmostEqual(package(flat)["remainingFlange"], y - 39.5)
            self.assertEqual(package(flat)["filmEdgeY"], y)
            tip = package(folded)["foldTip"]
            self.assertLess(tip[1], y)
            self.assertGreater(tip[2], package(flat)["foldTip"][2])
            self.assert_point_on(part(folded, "pouch.upper.flange"), tip)
            for side in ("positive", "negative"):
                for half in ("upper", "lower"):
                    self.assertAlmostEqual(part(flat, "pouch."+half+".flange").BoundingBox().ymax, y)
                seal_shape = part(folded, "seal."+side)
                self.assertLess(seal_shape.distance(part(folded,"pouch.upper.flange")), 1e-6)
                x = SOURCE[side]["end"] * 154
                self.assert_point_on(seal_shape, [x, tip[1], tip[2]])
                for m in (flat, folded):
                    self.assertAlmostEqual(part(m, side+".lead").Volume(), part(previous, side+".lead").Volume())
