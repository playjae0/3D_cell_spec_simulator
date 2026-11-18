import unittest, json, sys, copy, tempfile, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))
import cadquery as cq
from model import build, serialize, ModelError
from pouch_process import vector
from geometry_metrics import exact_bounds
from pouch_material import profile, at, mapped_point

P = json.loads((ROOT / "examples/pouch-process.json").read_text())["product"]


def parts(m):
    return {p["id"]: p for p in m["parts"]}


def metric(m, key):
    x = next(x for x in m["processMetrics"] if x["id"].endswith(key))
    a = m["features"][x["a"]]["point"]
    b = m["features"][x["b"]]["point"]
    return math.dist(a, b)


class PouchGeometry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.models = {
            s: build(P, s)
            for s in ["pouch_formed", "loaded", "sealed", "trimmed", "folded"]
        }

    def test_pouch_formed_independent_of_unknown_assembly_and_legacy_unchanged(self):
        p = copy.deepcopy(P)
        p["stack"] = {}
        p["positive"] = {}
        p["negative"] = {}
        p["pouchProcess"]["neutralFraction"] = None
        p["pouchProcess"]["assemblyPose"] = {
            k: None for k in ["x", "y", "z", "rx", "ry", "rz"]
        }
        m = build(p, "pouch_formed")
        self.assertEqual(len(m["parts"]), 4)
        self.assertNotIn("stack", parts(m))
        legacy = copy.deepcopy(P)
        legacy.pop("pouchProcess")
        a = build(legacy, "assembly")
        b = build(P, "assembly")
        self.assertEqual(a["features"], b["features"])
        self.assertEqual(
            [p["shape"].Volume() for p in a["parts"]],
            [p["shape"].Volume() for p in b["parts"]],
        )

    def test_independent_upper_depth_and_actual_inner_outer_faces(self):
        p = copy.deepcopy(P)
        before = copy.deepcopy(p)
        p["pouchProcess"]["sheets"]["upper"]["depth"] += 0.7
        m = build(p, "pouch_formed")
        a = parts(self.models["pouch_formed"])
        b = parts(m)
        self.assertEqual(
            a["pouch.lower.pocket"]["meta"]["surfaceSignature"],
            b["pouch.lower.pocket"]["meta"]["surfaceSignature"],
        )
        self.assertNotEqual(
            a["pouch.upper.pocket"]["meta"]["surfaceSignature"],
            b["pouch.upper.pocket"]["meta"]["surfaceSignature"],
        )
        self.assertAlmostEqual(
            m["features"]["pouch.upper.innerFloor"]["point"][2]
            - self.models["pouch_formed"]["features"]["pouch.upper.innerFloor"][
                "point"
            ][2],
            0.7,
        )
        for half in ["upper", "lower"]:
            for key in ["innerFloor", "outerFloor"]:
                f = m["features"]["pouch." + half + "." + key]
                self.assertLess(
                    b[f["partId"]]["shape"].distance(cq.Vertex.makeVertex(*f["point"])),
                    1e-6,
                )
        self.assertEqual(
            before["pouchProcess"]["sheets"]["lower"],
            p["pouchProcess"]["sheets"]["lower"],
        )

    def test_radius_changes_local_surface_with_same_bounds_and_surface_probe(self):
        p = copy.deepcopy(P)
        p["pouchProcess"]["sheets"]["upper"]["floorR"] += 0.4
        m = build(p, "pouch_formed")
        a = parts(self.models["pouch_formed"])["pouch.upper.pocket"]
        b = parts(m)["pouch.upper.pocket"]
        for k in ["xmin", "xmax", "ymin", "ymax", "zmin", "zmax"]:
            self.assertAlmostEqual(
                getattr(a["shape"].BoundingBox(), k),
                getattr(b["shape"].BoundingBox(), k),
                places=5,
            )
        self.assertNotEqual(
            a["meta"]["surfaceSignature"], b["meta"]["surfaceSignature"]
        )
        self.assertGreater(
            a["shape"].cut(b["shape"]).Volume() + b["shape"].cut(a["shape"]).Volume(),
            0.01,
        )

    def test_rigid_y_offset_changes_surface_clearances_but_not_own_dimensions(self):
        p = copy.deepcopy(P)
        p["pouchProcess"]["assemblyPose"]["y"] = 0.6
        m = build(p, "loaded")
        a = self.models["loaded"]
        ap = parts(a)
        bp = parts(m)
        self.assertAlmostEqual(
            metric(a, "clearance.yPlus") - metric(m, "clearance.yPlus"), 0.6, places=5
        )
        self.assertAlmostEqual(
            metric(m, "clearance.yMinus") - metric(a, "clearance.yMinus"), 0.6, places=5
        )
        for id in ["stack", "positive.tab", "negative.tab", "positive.lead"]:
            self.assertAlmostEqual(
                ap[id]["shape"].Volume(), bp[id]["shape"].Volume(), places=5
            )
        self.assertEqual(
            ap["pouch.upper.pocket"]["meta"]["surfaceSignature"],
            bp["pouch.upper.pocket"]["meta"]["surfaceSignature"],
        )

    def test_rigid_3d_transform_carries_cad_normals_patches_and_paths(self):
        p = copy.deepcopy(P)
        pose = p["pouchProcess"]["assemblyPose"]
        pose.update(x=0.2, y=0.1, z=0.2, rx=1, ry=0.4, rz=2)
        m = build(p, "loaded")
        base = self.models["loaded"]
        key = "stack.thickness.plus"
        f = m["features"][key]
        expected = vector(base["features"][key]["point"], pose)
        self.assertLess(math.dist(f["point"], expected), 1e-9)
        self.assertLess(
            parts(m)["stack"]["shape"].distance(cq.Vertex.makeVertex(*f["point"])), 1e-6
        )
        self.assertLess(math.dist(f["normal"], vector([0, 0, 1], pose, False)), 1e-9)
        self.assertLess(
            math.dist(
                f["patch"]["u"],
                vector(base["features"][key]["patch"]["u"], pose, False),
            ),
            1e-9,
        )

    def test_tool_independence_common_area_and_explicit_relief(self):
        p = copy.deepcopy(P)
        f = p["pouchProcess"]["toolFaces"]["upper_xMinus"]
        f["width"] += 0.5
        f["start"] += 0.2
        f["reliefEnabled"] = True
        m = build(p, "sealed")
        a = parts(self.models["sealed"])
        b = parts(m)
        self.assertEqual(
            a["seal.upper_xPlus"]["meta"]["surfaceSignature"],
            b["seal.upper_xPlus"]["meta"]["surfaceSignature"],
        )
        self.assertNotEqual(
            a["seal.upper_xMinus"]["meta"]["surfaceSignature"],
            b["seal.upper_xMinus"]["meta"]["surfaceSignature"],
        )
        common = b["seal.common.xMinus"]["meta"]["area"]
        self.assertGreater(common, 0)
        self.assertLess(common, b["tool.upper_xMinus"]["meta"]["area"])
        self.assertEqual(
            a["pouch.upper.flange"]["shape"].Volume(),
            b["pouch.upper.flange"]["shape"].Volume(),
        )

    def test_cut_removes_cad_and_invalidates_original_reference(self):
        a = self.models["sealed"]
        b = self.models["trimmed"]
        self.assertLess(
            parts(b)["pouch.upper.flange"]["shape"].Volume(),
            parts(a)["pouch.upper.flange"]["shape"].Volume(),
        )
        self.assertEqual(
            parts(a)["seal.upper_yPlus"]["meta"]["originalArea"],
            parts(b)["seal.upper_yPlus"]["meta"]["originalArea"],
        )
        f = b["features"]["pouch.input.sheets.upper.blank.yPlus.b"]
        self.assertFalse(f["available"])
        self.assertEqual(f["reasonCode"], "material_removed")
        p = copy.deepcopy(P)
        p["pouchProcess"]["sheets"]["upper"]["cut"]["yPlus"] = (
            P["pouchProcess"]["sheets"]["upper"]["openingWidth"] / 2 + 5
        )
        m = build(p, "trimmed")
        self.assertTrue(any(d.get("code") == "seal_cut" for d in m["diagnostics"]))

    def test_folding_moves_seal_and_keeps_reference_layer_length(self):
        a = self.models["trimmed"]
        b = self.models["folded"]
        key = "pouch.input.toolFaces.upper_yPlus.width.b"
        self.assertNotEqual(a["features"][key]["point"], b["features"][key]["point"])
        f = b["features"][key]
        self.assertLess(
            parts(b)["pouch.upper.flange"]["shape"].distance(
                cq.Vertex.makeVertex(*f["point"])
            ),
            1e-5,
        )
        q = P["pouchProcess"]
        prof = b["materialProfiles"]["yPlus"]
        n = prof["neutral"]
        length = 0
        for seg in prof["pieces"]:
            start, end = seg[:2]
            points = [
                at(prof, start + (end - start) * i / 400, n)[:2] for i in range(401)
            ]
            length += sum(math.dist(x, y) for x, y in zip(points, points[1:]))
        self.assertAlmostEqual(length, prof["limit"], places=4)
        self.assertEqual(q, P["pouchProcess"])
        self.assertLess(metric(b, "envelope.y"), metric(a, "envelope.y"))

    def test_multiple_folds_and_order_errors_no_silent_clamping(self):
        p = copy.deepcopy(P)
        f = p["pouchProcess"]["folds"]
        f["yPlus2"]["enabled"] = True
        m = build(p, "folded")
        self.assertEqual(len(m["materialProfiles"]["yPlus"]["ops"]), 2)
        f["yPlus1"]["order"] = 2
        f["yPlus2"]["order"] = 1
        with self.assertRaisesRegex(ModelError, "순서|겹칩니다"):
            build(p, "folded")
        for modify in [
            lambda q: q["sheets"]["upper"].update(depth=0.1),
            lambda q: q.update(type="single_cup"),
            lambda q: q["folds"]["yPlus1"].update(innerR=100),
            lambda q: q["sheets"]["upper"]["cut"].update(yPlus=10),
        ]:
            p = copy.deepcopy(P)
            modify(p["pouchProcess"])
            snapshot = copy.deepcopy(p)
            with self.assertRaises(ModelError):
                build(p, "folded")
            self.assertEqual(p, snapshot)

    def test_independent_cut_ends_and_zero_angle_and_actual_fold_radius(self):
        p = copy.deepcopy(P)
        p["pouchProcess"]["sheets"]["upper"]["cut"]["yPlus"] += 0.5
        p["pouchProcess"]["folds"]["yMinus1"]["angle"] = 0
        m = build(p, "folded")
        for half in ["upper", "lower"]:
            f = m["features"]["pouch.input.sheets." + half + ".cut.yPlus.b"]
            self.assertTrue(f["available"])
            self.assertLess(
                parts(m)[f["partId"]]["shape"].distance(
                    cq.Vertex.makeVertex(*f["point"])
                ),
                1e-6,
            )
        f = m["features"]["pouch.input.folds.yPlus1.innerR.a"]
        self.assertAlmostEqual(
            math.dist(f["center"], f["point"]),
            p["pouchProcess"]["folds"]["yPlus1"]["innerR"],
            places=7,
        )
        self.assertLess(
            parts(m)[f["partId"]]["shape"].distance(cq.Vertex.makeVertex(*f["point"])),
            1e-6,
        )

    def test_actual_tool_centerline_overlap_changes_independently(self):
        p = copy.deepcopy(P)
        m = self.models["sealed"]
        key = "leadCoverage.positive.upper_xMinus.0"
        before = metric(m, key)
        self.assertGreater(before, 0)
        p["pouchProcess"]["toolFaces"]["upper_xMinus"]["width"] -= 2
        n = build(p, "sealed")
        self.assertLess(metric(n, key), before)
        self.assertAlmostEqual(
            metric(n, "leadCoverage.negative.upper_xPlus.0"),
            metric(m, "leadCoverage.negative.upper_xPlus.0"),
        )

    def test_step_reopen_and_mesh_independent_measurements(self):
        m = self.models["folded"]
        a = serialize(m, 0.25)
        b = serialize(m, 0.08)
        self.assertEqual(a["features"], b["features"])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "pouch-mm.step"
            shape = cq.Compound.makeCompound(
                [p["shape"] for p in m["parts"] if p["role"] != "region"]
            )
            cq.exporters.export(shape, str(path))
            loaded = cq.importers.importStep(str(path)).val()
            self.assertTrue(loaded.isValid())
            self.assertEqual(len(shape.Solids()), len(loaded.Solids()))
            self.assertAlmostEqual(shape.Volume(), loaded.Volume(), places=4)
            self.assertIn(".MILLI.", path.read_text())
            for key in ["xlen", "ylen", "zlen"]:
                self.assertAlmostEqual(
                    getattr(exact_bounds(shape), key),
                    getattr(exact_bounds(loaded), key),
                    places=4,
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
