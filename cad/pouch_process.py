"""Explicit pouch workflow. Exact OCC solids are separate from semantic refs/meshes.

Supported: two separate sheets, independent vertical-wall cups, rectangular
keep-boundaries, rounded tool faces, optional tool exclusion, parallel long-edge
laminate bends. No patent embodiment or unknown real dimension is implied.
"""

from copy import deepcopy
import math, hashlib, json
import cadquery as cq
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Lin, gp_Pnt, gp_Dir
from process import ModelError, STAGE_CONTRACT
from proof_pocket import pocket, roundwire
from pouch_material import profile, at, solid as bent_solid, mapped_point, mapped_normal
from geometry_metrics import exact_bounds

HALVES = ("upper", "lower")
EDGES = ("xMinus", "xPlus", "yMinus", "yPlus")
PREFIX = "pouchProcess."


def finite(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def validate(q, stage):
    errors = []
    cap = STAGE_CONTRACT[stage]

    def check(ok, msg):
        if not ok:
            errors.append(PREFIX + msg)

    if not isinstance(q, dict):
        raise ModelError(
            [PREFIX + "상세 입력 미확정 · 기존 파우치 값을 자동 변환하지 않습니다"]
        )
    check(q.get("version") == 1, "version: 1 필요")
    check(
        q.get("type") == "double_cup", "type: 현재 double_cup만 지원. 단일 컵은 미지원"
    )
    check(
        q.get("construction") == "separate_sheets",
        "construction: separate_sheets만 지원. 한 장 연결 외장은 미지원",
    )
    check(
        q.get("sidewall") == "vertical",
        "sidewall: vertical만 지원. 경사/바닥 치수 과구속 금지",
    )
    for key in ["seamGap"] + (["neutralFraction"] if cap["fold"] else []):
        check(finite(q.get(key)), key + ": 유한한 수 필요")
    if errors:
        raise ModelError(errors)
    check(q["seamGap"] >= 0, "seamGap: 공칭 상하 내면 간격은 음수 불가")
    if cap["fold"]:
        check(0 <= q["neutralFraction"] <= 1, "neutralFraction: 기준층 비율 0..1")
    for half in HALVES:
        h = q.get("sheets", {}).get(half, {})
        for key in [
            "openingLength",
            "openingWidth",
            "depth",
            "floorR",
            "rimR",
            "planR",
            "filmThickness",
        ]:
            check(
                finite(h.get(key)) and h[key] > 0,
                f"sheets.{half}.{key}: 양의 치수 필요",
            )
        for group in ["blank"] + (["cut"] if cap["cut"] else []):
            for edge in EDGES:
                check(
                    finite(h.get(group, {}).get(edge)),
                    f"sheets.{half}.{group}.{edge}: 절대 재료 좌표 필요",
                )
        if errors:
            continue
        l, w, d, rf, rt, R, t = [
            h[k]
            for k in [
                "openingLength",
                "openingWidth",
                "depth",
                "floorR",
                "rimR",
                "planR",
                "filmThickness",
            ]
        ]
        check(d > rf + rt, f"sheets.{half}.depth: 깊이는 바닥 R+림 R보다 커야 합니다")
        check(
            rt > t and R > rf + rt and R < min(l, w) / 2,
            f"sheets.{half}: 림 R>필름 두께, 평면 R>바닥 R+림 R 및 개구 절반 미만 필요",
        )
        for group in ["blank"] + (["cut"] if cap["cut"] else []):
            b = h[group]
            check(
                b["xMinus"] < -l / 2
                and b["xPlus"] > l / 2
                and b["yMinus"] < -w / 2
                and b["yPlus"] > w / 2,
                f"sheets.{half}.{group}: 성형 개구 바깥의 유효 외곽 필요",
            )
            if group == "cut":
                check(
                    all(
                        (
                            b[e] >= h["blank"][e]
                            if e.endswith("Minus")
                            else b[e] <= h["blank"][e]
                        )
                        for e in EDGES
                    ),
                    f"sheets.{half}.cut: 절단선은 원재료 외곽 안이어야 합니다",
                )
    if cap["assembly"]:
        for k in ["x", "y", "z", "rx", "ry", "rz"]:
            check(
                finite(q.get("assemblyPose", {}).get(k)),
                f"assemblyPose.{k}: 수납 강체 배치 입력 필요",
            )
    if cap["seal"]:
        for half in HALVES:
            for edge in EDGES:
                key = half + "_" + edge
                f = q.get("toolFaces", {}).get(key, {})
                check(
                    type(f.get("enabled")) is bool,
                    f"toolFaces.{key}.enabled: 존재/부재 입력 필요",
                )
                if f.get("enabled") is not True:
                    continue
                check(
                    f.get("half") == half and f.get("edge") == edge,
                    f"toolFaces.{key}: 안정 ID와 상하/변 불일치",
                )
                for k in ["start", "width", "length", "offset", "cornerR"]:
                    check(finite(f.get(k)), f"toolFaces.{key}.{k}: 유한한 수 필요")
                if errors:
                    continue
                check(
                    f["start"] >= 0
                    and f["width"] > 0
                    and f["length"] > 0
                    and 0 <= f["cornerR"] < min(f["width"], f["length"]) / 2,
                    f"toolFaces.{key}: 작업면 범위/R 오류",
                )
                check(
                    type(f.get("reliefEnabled")) is bool,
                    f"toolFaces.{key}.reliefEnabled: 명시적 설정 필요",
                )
                if f.get("reliefEnabled"):
                    for k in ["reliefLength", "reliefWidth", "reliefOffset"]:
                        check(finite(f.get(k)), f"toolFaces.{key}.{k}: 값 필요")
                    if not errors:
                        check(
                            0 < f["reliefLength"] < f["length"]
                            and 0 < f["reliefWidth"] < f["width"]
                            and abs(f["reliefOffset"]) + f["reliefLength"] / 2
                            < f["length"] / 2,
                            f"toolFaces.{key}: 작업면 홈이 윤곽 밖입니다",
                        )
    if cap["fold"]:
        for key, f in q.get("folds", {}).items():
            check(
                type(f.get("enabled")) is bool, f"folds.{key}.enabled: 명시적 설정 필요"
            )
            if not f.get("enabled"):
                continue
            check(
                f.get("edge") in ["yMinus", "yPlus"],
                f"folds.{key}: 긴 변의 평행 접힘만 지원. 교차/단변 접힘 미지원",
            )
            for k in ["order", "line", "angle", "innerR"]:
                check(finite(f.get(k)), f"folds.{key}.{k}: 값 필요")
            if errors:
                continue
            check(
                f["order"] > 0 and f["order"] == int(f["order"]),
                f"folds.{key}.order: 양의 정수 필요",
            )
            check(
                f["line"] > max(q["sheets"][h]["openingWidth"] / 2 for h in HALVES),
                f"folds.{key}.line: 성형 포켓 안쪽 접힘 미지원",
            )
    if errors:
        raise ModelError(errors)


def box_bounds(b, z0, z1):
    return cq.Solid.makeBox(
        b["xPlus"] - b["xMinus"],
        b["yPlus"] - b["yMinus"],
        z1 - z0,
        cq.Vector(b["xMinus"], b["yMinus"], z0),
    )


def vector(p, pose, translation=True):
    x, y, z = p
    for axis, key in enumerate(["rx", "ry", "rz"]):
        a = math.radians(pose[key])
        c, s = math.cos(a), math.sin(a)
        if axis == 0:
            y, z = y * c - z * s, y * s + z * c
        if axis == 1:
            x, z = x * c + z * s, -x * s + z * c
        if axis == 2:
            x, y = x * c - y * s, x * s + y * c
    return [x + pose["x"], y + pose["y"], z + pose["z"]] if translation else [x, y, z]


def placed(shape, pose):
    for axis, key in zip([(1, 0, 0), (0, 1, 0), (0, 0, 1)], ["rx", "ry", "rz"]):
        if pose[key]:
            shape = shape.rotate((0, 0, 0), axis, pose[key])
    return shape.translate((pose["x"], pose["y"], pose["z"]))


def transform_model(model, pose):
    for part in model["parts"]:
        part["shape"] = placed(part["shape"], pose)
        if "displayShape" in part:
            part["displayShape"] = placed(part["displayShape"], pose)
    for f in model["features"].values():
        if not f.get("available", True):
            continue
        for k in ["point", "center"]:
            if f.get(k) is not None:
                f[k] = vector(f[k], pose)
        if f.get("normal"):
            f["normal"] = vector(f["normal"], pose, False)
        for k in ["arc", "segment"]:
            if k in f:
                f[k] = [vector(p, pose) for p in f[k]]
        if f.get("patch"):
            for k in ["u", "v"]:
                f["patch"][k] = vector(f["patch"][k], pose, False)
    for path in model["paths"]:
        path["points"] = [vector(p, pose) for p in path["points"]]


def fold_shape(shape, profiles, z0, z1):
    result = shape
    for edge, prof in profiles.items():
        if not prof["ops"]:
            continue
        line = prof["ops"][0][1]["line"]
        sign = 1 if edge == "yPlus" else -1
        b = shape.BoundingBox()
        smax = b.ymax if sign == 1 else -b.ymin
        if smax <= line + 1e-7:
            continue
        mask = cq.Solid.makeBox(
            b.xlen + 2,
            smax - line + 1,
            z1 - z0 + 2,
            cq.Vector(b.xmin - 1, line if sign == 1 else -smax - 1, z0 - 1),
        )
        band = shape.intersect(mask)
        if not band.Solids() or band.Volume() < 1e-9:
            continue
        bb = band.BoundingBox()
        s0 = max(line, bb.ymin if sign == 1 else -bb.ymax)
        s1 = bb.ymax if sign == 1 else -bb.ymin
        # A rounded/relieved region intersecting a bend needs trimmed curved
        # surface mapping. Never silently replace it by its bounding rectangle.
        if abs(band.Volume() - bb.xlen * (s1 - s0) * (z1 - z0)) > max(
            1e-6, band.Volume() * 1e-6
        ):
            raise ModelError(
                [
                    "폴딩 곡률 구간을 가로지르는 둥근/홈 작업면은 현재 미지원. 해당 작업면 코너 R=0·홈 끄기 또는 접힘선 이동 필요"
                ]
            )
        bent = bent_solid(prof, bb.xmin, bb.xmax, s0, s1, z0, z1, sign)
        result = result.cut(mask).fuse(bent).clean()
    if not result.isValid():
        raise ModelError(["폴딩: 자기 교차 또는 유효하지 않은 곡률/평면 연결"])
    return result


def tool_bounds(q, f):
    h = q["sheets"][f["half"]]
    edge = f["edge"]
    sign = 1 if edge.endswith("Plus") else -1
    base = h["openingLength"] / 2 if edge.startswith("x") else h["openingWidth"] / 2
    v0 = base + f["start"]
    v1 = v0 + f["width"]
    u0 = f["offset"] - f["length"] / 2
    u1 = f["offset"] + f["length"] / 2
    lo, hi = sorted([sign * v0, sign * v1])
    return {
        "xMinus": lo if edge[0] == "x" else u0,
        "xPlus": hi if edge[0] == "x" else u1,
        "yMinus": u0 if edge[0] == "x" else lo,
        "yPlus": u1 if edge[0] == "x" else hi,
    }


def tool_solid(b, f, z0, z1):
    l = b["xPlus"] - b["xMinus"]
    w = b["yPlus"] - b["yMinus"]
    x = (b["xPlus"] + b["xMinus"]) / 2
    y = (b["yPlus"] + b["yMinus"]) / 2
    if f["cornerR"]:
        sh = cq.Solid.extrudeLinear(
            roundwire(l, w, f["cornerR"], z0), [], cq.Vector(0, 0, z1 - z0)
        ).translate((x, y, 0))
    else:
        sh = box_bounds(b, z0, z1)
    if f["reliefEnabled"]:
        alongx = f["edge"].startswith("y")
        rl, rw = f["reliefLength"], f["reliefWidth"]
        offset = f["reliefOffset"]
        hole = cq.Solid.makeBox(
            rl if alongx else rw,
            rw if alongx else rl,
            z1 - z0 + 2,
            cq.Vector(
                x + (offset if alongx else 0) - (rl if alongx else rw) / 2,
                y + (0 if alongx else offset) - (rw if alongx else rl) / 2,
                z0 - 1,
            ),
        )
        sh = sh.cut(hole)
    return sh


def ray_surface(shape, p, d):
    inter = IntCurvesFace_ShapeIntersector()
    inter.Load(shape.wrapped, 1e-7)
    inter.Perform(gp_Lin(gp_Pnt(*p), gp_Dir(*d)), 1e-6, 10000.0)
    if not inter.IsDone() or not inter.NbPnt():
        return None
    n = min(range(1, inter.NbPnt() + 1), key=lambda i: inter.WParameter(i))
    v = inter.Pnt(n)
    return [v.X(), v.Y(), v.Z()]


def line_intervals(shape, origin, direction):
    """Exact tool BRep intersections on its mid-plane, including relief holes."""
    inter = IntCurvesFace_ShapeIntersector()
    inter.Load(shape.wrapped, 1e-7)
    inter.Perform(gp_Lin(gp_Pnt(*origin), gp_Dir(*direction)), -10000.0, 10000.0)
    if not inter.IsDone():
        return []
    values = sorted(inter.WParameter(i) for i in range(1, inter.NbPnt() + 1))
    unique = []
    for v in values:
        if not unique or abs(v - unique[-1]) > 1e-6:
            unique.append(v)
    if len(unique) % 2:
        return []  # Tangency/ambiguous line is not an overlap.
    return list(zip(unique[::2], unique[1::2]))


def build_process(source, stage, assembly_builder):
    cap = STAGE_CONTRACT[stage]
    q = deepcopy(source.get("pouchProcess"))
    validate(q, stage)
    if cap["assembly"]:
        m = assembly_builder(source, "assembly")
        transform_model(m, q["assemblyPose"])
        parts = m["parts"]
        features = m["features"]
        paths = m["paths"]
        diagnostics = m["diagnostics"]
        features["assembly.origin"] = features.pop("datum.origin")
        features["assembly.origin"]["partId"] = "stack"
    else:
        parts = []
        features = {}
        paths = []
        diagnostics = []
    features["datum.origin"] = {
        "partId": "datum",
        "kind": "point",
        "point": [0, 0, 0],
        "name": "파우치 조립 좌표 원점",
        "available": True,
    }
    metrics = []
    profiles = {}
    flat_sheets = {}
    sheet_ranges = {}
    shells = {}
    tool_masks = {}
    if cap["fold"]:
        for edge in ["yMinus", "yPlus"]:
            limit = max(abs(q["sheets"][h]["cut"][edge]) for h in HALVES)
            profiles[edge] = profile(q, edge, limit)
            shortest = min(abs(q["sheets"][h]["cut"][edge]) for h in HALVES)
            if any(
                seg[5] and seg[1] > shortest + 1e-7 for seg in profiles[edge]["pieces"]
            ):
                raise ModelError(
                    [
                        "pouchProcess.folds: 상하 시트 모두에 완전한 곡률 구간을 만들 재료가 필요합니다"
                    ]
                )

    def point(fid, part, p, kind="point", **kw):
        features[fid] = {
            "partId": part,
            "name": fid,
            "kind": kind,
            "point": list(p),
            "available": True,
            **kw,
        }

    def dim(path, part, a, b, mode="distance", **kw):
        stem = "pouch.input." + path
        point(stem + ".a", part, a, **kw)
        point(stem + ".b", part, b, **kw)
        metrics.append(
            {
                "id": stem,
                "name": path,
                "a": stem + ".a",
                "b": stem + ".b",
                "mode": mode,
                "parameterId": PREFIX + path,
                "kind": "input",
            }
        )

    def calc(key, part, a, b, name, **kw):
        stem = "pouch.result." + key
        point(stem + ".a", part, a)
        point(stem + ".b", part, b)
        metrics.append(
            {
                "id": stem,
                "name": name,
                "a": stem + ".a",
                "b": stem + ".b",
                "mode": "distance",
                "kind": "calculated",
                **kw,
            }
        )

    def material_feature(fid, part, p, half, **kw):
        h = q["sheets"][half]
        b = h["cut"] if cap["cut"] else h["blank"]
        inside = (
            b["xMinus"] - 1e-6 <= p[0] <= b["xPlus"] + 1e-6
            and b["yMinus"] - 1e-6 <= p[1] <= b["yPlus"] + 1e-6
        )
        if not inside:
            features[fid] = {
                "partId": part,
                "name": fid,
                "kind": "unavailable",
                "available": False,
                "reasonCode": "material_removed",
                "reason": "절단으로 원래 재료 참조가 소실됨 · 재선택 필요",
            }
            return
        pp = mapped_point(profiles, p)
        point(fid, part, pp, materialPoint=p, materialHalf=half, **kw)

    for half, sign in [("upper", 1), ("lower", -1)]:
        h = q["sheets"][half]
        L, W, d, rf, rt, R, t = [
            h[k]
            for k in [
                "openingLength",
                "openingWidth",
                "depth",
                "floorR",
                "rimR",
                "planR",
                "filmThickness",
            ]
        ]
        z = sign * q["seamGap"] / 2
        z0, z1 = sorted([z, z + sign * t])
        sheet_ranges[half] = (z0, z1)
        shell = pocket(L, W, d, rf, rt, R, t)
        if sign < 0:
            shell = shell.mirror("XY")
        shell = shell.translate((0, 0, z))
        shells[half] = shell
        part = "pouch." + half + ".pocket"
        parts.append(
            {
                "id": part,
                "name": half + " 성형 포켓 · 내면 기준",
                "shape": shell,
                "color": "#bacad0",
                "role": "shell",
                "meta": {
                    "half": half,
                    "filmThickness": t,
                    "datum": "pouch",
                    "assumption": "균일 공칭 필름, 수직 벽",
                },
            }
        )
        hole = cq.Solid.extrudeLinear(
            roundwire(L, W, R, z0 - 1), [], cq.Vector(0, 0, t + 2)
        )
        blank = box_bounds(h["blank"], z0, z1).cut(hole).clean()
        flat_sheets[half] = blank
        retained = (
            blank.intersect(box_bounds(h["cut"], z0 - 1, z1 + 1)).clean()
            if cap["cut"]
            else blank
        )
        flat_sheets[half + "Retained"] = retained
        sh = fold_shape(retained, profiles, z0, z1) if profiles else retained
        partf = "pouch." + half + ".flange"
        parts.append(
            {
                "id": partf,
                "name": half + " 재료 외곽 · " + stage,
                "shape": sh,
                "color": "#aebfc4",
                "role": "shell",
                "meta": {
                    "half": half,
                    "removedVolume": blank.Volume() - retained.Volume(),
                    "neutralFraction": q.get("neutralFraction"),
                    "referenceLength": "지정 기준층의 재료 전개 길이 보존",
                    "filmThickness": t,
                },
            }
        )
        for key, a, b in [
            ("openingLength", [-L / 2, 0, z], [L / 2, 0, z]),
            ("openingWidth", [0, -W / 2, z], [0, W / 2, z]),
            ("depth", [0, 0, z], [0, 0, z + sign * d]),
            ("filmThickness", [0, 0, z + sign * d], [0, 0, z + sign * (d + t)]),
        ]:
            dim("sheets." + half + "." + key, part, a, b)
        for key, val, c, a in [
            (
                "floorR",
                rf,
                [0, W / 2 - rt - rf, z + sign * (d - rf)],
                [0, W / 2 - rt - rf, z + sign * d],
            ),
            ("rimR", rt, [0, W / 2, z + sign * rt], [0, W / 2, z]),
            ("planR", R, [L / 2 - R, W / 2 - R, z], [L / 2 - R, W / 2, z]),
        ]:
            fid = "pouch.input.sheets." + half + "." + key + ".a"
            point(fid, part, a, "radius", center=c, value=val)
            metrics.append(
                {
                    "id": fid[:-2],
                    "name": half + " " + key,
                    "a": fid,
                    "b": fid,
                    "mode": "radius",
                    "parameterId": PREFIX + "sheets." + half + "." + key,
                    "kind": "input",
                }
            )
        floor_u = L / 2 - rf - rt
        floor_v = W / 2 - rf - rt
        for label, zz, nn in [
            ("innerFloor", z + sign * d, -sign),
            ("outerFloor", z + sign * (d + t), sign),
        ]:
            point(
                "pouch." + half + "." + label,
                part,
                [0, 0, zz],
                "face",
                normal=[0, 0, nn],
                patch={
                    "u": [floor_u, 0, 0],
                    "v": [0, floor_v, 0],
                    "halfSize": [floor_u, floor_v],
                    "cornerR": R - rf - rt,
                },
            )
        for group in ["blank", "cut"]:
            for edge in EDGES:
                v = h[group].get(edge)
                if not finite(v):
                    continue
                a = [0, 0, z]
                b = [v, 0, z] if edge[0] == "x" else [0, v, z]
                stem = "pouch.input.sheets." + half + "." + group + "." + edge
                material_feature(stem + ".a", partf, a, half)
                material_feature(stem + ".b", partf, b, half, kind="edge")
                metrics.append(
                    {
                        "id": stem,
                        "name": half + " " + group + " " + edge,
                        "a": stem + ".a",
                        "b": stem + ".b",
                        "mode": "distance",
                        "parameterId": PREFIX
                        + "sheets."
                        + half
                        + "."
                        + group
                        + "."
                        + edge,
                        "kind": "input",
                    }
                )
        # Stable patch in material coordinates spans a long straight flange.
        for edge in ["yMinus", "yPlus"]:
            signy = 1 if edge == "yPlus" else -1
            b = h["blank"]
            u = (b["xPlus"] - b["xMinus"]) / 2
            outer = abs(b[edge])
            v = (outer - W / 2) / 2
            center = [(b["xPlus"] + b["xMinus"]) / 2, signy * (W / 2 + v), z + sign * t]
            patch = {
                "u": [u, 0, 0],
                "v": [0, signy * v, 0],
                "halfSize": [u, v],
                "material": {
                    "origin": center,
                    "bounds": h["cut"] if cap["cut"] else h["blank"],
                    "profiles": profiles,
                },
            }
            retained_point = [
                center[0],
                signy
                * min(
                    abs(center[1]), abs((h["cut"] if cap["cut"] else h["blank"])[edge])
                ),
                center[2],
            ]
            point(
                "pouch." + half + ".material." + edge,
                partf,
                mapped_point(profiles, retained_point),
                "face",
                normal=mapped_normal(profiles, retained_point, [0, 0, sign]),
                patch=patch,
            )
    if cap["seal"]:
        for key, f in q["toolFaces"].items():
            if not f["enabled"]:
                continue
            half = f["half"]
            edge = f["edge"]
            b = tool_bounds(q, f)
            z0, z1 = sheet_ranges[half]
            z = z1 if half == "upper" else z0
            mask = tool_solid(b, f, z0, z1)
            tool_masks[key] = mask
            if mask.cut(flat_sheets[half]).Volume() > 1e-6:
                raise ModelError(
                    [
                        PREFIX
                        + "toolFaces."
                        + key
                        + ": 작업면이 성형부/원재료 외곽을 침범합니다"
                    ]
                )
            part = "tool." + key
            displayz = 6 if half == "upper" else -6
            parts.append(
                {
                    "id": part,
                    "name": key + " 실링바 작업면 (설비 본체 아님)",
                    "shape": mask.translate((0, 0, displayz)),
                    "color": "#aa78c9",
                    "role": "region",
                    "meta": {
                        "toolFaceId": key,
                        "edge": edge,
                        "half": half,
                        "uvn": {
                            "u": [0, 1, 0] if edge[0] == "x" else [1, 0, 0],
                            "v": (
                                [1 if edge.endswith("Plus") else -1, 0, 0]
                                if edge[0] == "x"
                                else [0, 1 if edge.endswith("Plus") else -1, 0]
                            ),
                            "n": [0, 0, -1 if half == "upper" else 1],
                        },
                        "area": mask.Volume() / (z1 - z0),
                    },
                }
            )
            region = mask.intersect(flat_sheets[half + "Retained"]).clean()
            rid = "seal." + key
            removed = mask.Volume() - region.Volume()
            if removed > 1e-6:
                diagnostics.append(
                    {
                        "level": "error",
                        "message": key + ": 절단선이 실링 공칭 영역을 침범함",
                        "code": "seal_cut",
                        "removedSealVolume": removed,
                    }
                )
            if region.Volume() > 1e-8:
                parts.append(
                    {
                        "id": rid,
                        "name": key + " 제품 공칭 실링 영역",
                        "shape": (
                            fold_shape(region, profiles, z0, z1) if profiles else region
                        ),
                        "color": "#24b8a9" if half == "upper" else "#559bdb",
                        "role": "region",
                        "meta": {
                            "toolFaceId": key,
                            "materialHalf": half,
                            "originalArea": mask.Volume() / (z1 - z0),
                            "remainingArea": region.Volume() / (z1 - z0),
                            "thermalPrediction": False,
                        },
                    }
                )
            cx = (b["xMinus"] + b["xPlus"]) / 2
            cy = (b["yMinus"] + b["yPlus"]) / 2
            sign = 1 if edge.endswith("Plus") else -1
            base = (
                q["sheets"][half]["openingLength" if edge[0] == "x" else "openingWidth"]
                / 2
            )

            def uv(u, v):
                return [sign * v, u, z] if edge[0] == "x" else [u, sign * v, z]

            pairs = {
                "start": (uv(f["offset"], base), uv(f["offset"], base + f["start"])),
                "width": (
                    uv(f["offset"], base + f["start"]),
                    uv(f["offset"], base + f["start"] + f["width"]),
                ),
                "length": (
                    uv(
                        f["offset"] - f["length"] / 2,
                        base + f["start"] + f["width"] / 2,
                    ),
                    uv(
                        f["offset"] + f["length"] / 2,
                        base + f["start"] + f["width"] / 2,
                    ),
                ),
                "offset": (
                    uv(0, base + f["start"] + f["width"] / 2),
                    uv(f["offset"], base + f["start"] + f["width"] / 2),
                ),
            }
            for name, (a, bp) in pairs.items():
                stem = "pouch.input.toolFaces." + key + "." + name
                for suffix, v in [("a", a), ("b", bp)]:
                    material_feature(stem + "." + suffix, rid, v, half)
                metrics.append(
                    {
                        "id": stem,
                        "name": key + " " + name,
                        "a": stem + ".a",
                        "b": stem + ".b",
                        "mode": "distance",
                        "parameterId": PREFIX + "toolFaces." + key + "." + name,
                        "kind": "input",
                    }
                )
            # Material-width is distinct from its folded endpoint chord.
            (
                diagnostics.append(
                    {
                        "level": "info",
                        "message": key
                        + f": 공칭 실링 작업 폭 {f['width']:g} mm (재료 좌표). 폴딩 뒤 두 끝점 거리는 현 길이이며 전개 길이와 다릅니다.",
                    }
                )
                if profiles
                else None
            )
            cut = q["sheets"][half]["cut"] if cap["cut"] else q["sheets"][half]["blank"]
            for frac in [-0.4, 0, 0.4]:
                u = f["offset"] + frac * f["length"]
                a = uv(u, base + f["start"] + f["width"])
                bp = uv(u, abs(cut[edge]))
                stem = "pouch.result.remaining." + key + "." + str(frac)
                material_feature(stem + ".a", rid, a, half)
                material_feature(stem + ".b", "pouch." + half + ".flange", bp, half)
                metrics.append(
                    {
                        "id": stem,
                        "name": key + f" 잔여 폭 U={u:g}",
                        "a": stem + ".a",
                        "b": stem + ".b",
                        "mode": "distance",
                        "kind": "calculated",
                        "materialValue": abs(cut[edge])
                        - (base + f["start"] + f["width"]),
                    }
                )
        for edge in EDGES:
            a = tool_masks.get("upper_" + edge)
            b = tool_masks.get("lower_" + edge)
            if a is None or b is None:
                continue
            z0, z1 = sheet_ranges["upper"]
            # Project work footprints onto identical material plane before intersection.
            maska = tool_solid(
                tool_bounds(q, q["toolFaces"]["upper_" + edge]),
                q["toolFaces"]["upper_" + edge],
                0,
                1,
            )
            maskb = tool_solid(
                tool_bounds(q, q["toolFaces"]["lower_" + edge]),
                q["toolFaces"]["lower_" + edge],
                0,
                1,
            )
            common = maska.intersect(maskb)
            area = common.Volume()
            if area > 1e-8:
                shape = common.translate((0, 0, z0))
                for half in HALVES:
                    shape = shape.intersect(
                        box_bounds(
                            (
                                q["sheets"][half]["cut"]
                                if cap["cut"]
                                else q["sheets"][half]["blank"]
                            ),
                            z0,
                            z1,
                        )
                    )
                if shape.Volume() > 1e-8:
                    parts.append(
                        {
                            "id": "seal.common." + edge,
                            "name": edge + " 상하 공통 실링 영역",
                            "shape": (
                                fold_shape(shape, profiles, z0, z1)
                                if profiles
                                else shape
                            ),
                            "color": "#e4b84d",
                            "role": "region",
                            "meta": {
                                "area": shape.Volume() / (z1 - z0),
                                "originalArea": area,
                                "toolFaceIds": ["upper_" + edge, "lower_" + edge],
                                "thermalPrediction": False,
                            },
                        }
                    )
            diagnostics.append(
                {
                    "level": "info",
                    "message": edge + f" 상하 작업면 공통 면적 {area:.3f} mm²",
                    "commonArea": area,
                    "edge": edge,
                }
            )
    dim(
        "seamGap",
        "pouch.upper.flange",
        [0, q["sheets"]["upper"]["openingWidth"] / 2 + 0.1, -q["seamGap"] / 2],
        [0, q["sheets"]["upper"]["openingWidth"] / 2 + 0.1, q["seamGap"] / 2],
    )
    if cap["assembly"]:
        pose = q["assemblyPose"]
        stack = next(x["shape"] for x in parts if x["id"] == "stack")
        s = source["stack"]
        for k in ["x", "y", "z"]:
            a = [0.0, 0.0, 0.0]
            b = [pose["x"], pose["y"], pose["z"]]
            a = b.copy()
            a["xyz".index(k)] = 0
            dim("assemblyPose." + k, "stack", a, b)
        # Rays begin on the actual assembly face; intersect BRep surfaces, not boxes.
        samples = [
            ("upper", [0, 0, s["thickness"] / 2], [0, 0, 1]),
            ("lower", [0, 0, -s["thickness"] / 2], [0, 0, -1]),
            ("yPlus", [0, s["width"] / 2, 0], [0, 1, 0]),
            ("yMinus", [0, -s["width"] / 2, 0], [0, -1, 0]),
            ("xPlus", [s["length"] / 2, 0, 0], [1, 0, 0]),
            ("xMinus", [-s["length"] / 2, 0, 0], [-1, 0, 0]),
        ]
        for sx in [-1, 1]:
            for sy in [-1, 1]:
                rr = s["cornerR"]
                samples.append(
                    (
                        f"corner{sx}_{sy}",
                        [
                            sx * (s["length"] / 2 - rr + rr / math.sqrt(2)),
                            sy * (s["width"] / 2 - rr + rr / math.sqrt(2)),
                            0,
                        ],
                        [sx / math.sqrt(2), sy / math.sqrt(2), 0],
                    )
                )
        compound = cq.Compound.makeCompound(list(shells.values()))
        for name, a, direction in samples:
            a = vector(a, pose)
            direction = vector(direction, pose, False)
            bp = ray_surface(compound, a, direction)
            if bp:
                calc(
                    "clearance." + name,
                    "stack",
                    a,
                    bp,
                    "수납 " + name + " 표면 방향 간극",
                    basis="실제 BRep 표면 광선 교차",
                )
            else:
                diagnostics.append(
                    {
                        "level": "warning",
                        "message": name
                        + ": 지정 방향 포켓 표면 교차 없음 · 위치/개구 확인",
                    }
                )
        for part in [p for p in parts if p["role"] not in ["region", "shell"]]:
            for half in HALVES:
                wall = shells[half].fuse(
                    next(
                        p["shape"]
                        for p in parts
                        if p["id"] == "pouch." + half + ".flange"
                    )
                )
                dist = part["shape"].distance(wall)
                if dist < 1e-6:
                    volume = part["shape"].intersect(wall).Volume()
                    if volume > 1e-7:
                        diagnostics.append(
                            {
                                "level": "error",
                                "message": part["id"]
                                + " / "
                                + half
                                + f" 외장 간섭 {volume:.6g} mm³ · 자동 축소 안 함",
                                "code": "interference",
                                "volume": volume,
                            }
                        )
        for side in ["positive", "negative"]:
            lead = next((p for p in parts if p["id"] == side + ".lead"), None)
            film = next((p for p in parts if p["id"] == side + ".leadFilm"), None)
            if not lead or not film:
                continue
            for half in HALVES:
                e = "xPlus" if source[side]["end"] == 1 else "xMinus"
                key = half + "_" + e
                mask = tool_masks.get(key)
                if mask is None:
                    continue
                extrema = BRepExtrema_DistShapeShape(
                    film["shape"].wrapped, mask.wrapped
                )
                extrema.Perform()
                if extrema.NbSolution():
                    a = extrema.PointOnShape1(1)
                    b = extrema.PointOnShape2(1)
                    calc(
                        "leadFilm." + side + "." + half,
                        side + ".leadFilm",
                        [a.X(), a.Y(), a.Z()],
                        [b.X(), b.Y(), b.Z()],
                        side + " 실런트↔" + half + " 실링 영역 최소 거리",
                    )
                # Compare actual tool boundaries on the film's projected centerline.
                # This is nominal XY coverage, independent of vertical contact/flow.
                fa = features[side + ".leadFilm.start"]["point"]
                fb = features[side + ".leadFilm.end"]["point"]
                length = math.hypot(fb[0] - fa[0], fb[1] - fa[1])
                if length < 1e-7:
                    continue
                direction = [(fb[0] - fa[0]) / length, (fb[1] - fa[1]) / length, 0]
                origin = [fa[0], fa[1], sum(sheet_ranges[half]) / 2]

                def on_line(t):
                    return [origin[i] + t * direction[i] for i in range(3)]

                intervals = line_intervals(mask, origin, direction)
                if not intervals:
                    diagnostics.append(
                        {
                            "level": "warning",
                            "message": side
                            + " / "
                            + key
                            + ": 실런트 중심 XY 투영선이 작업면을 통과하지 않음",
                        }
                    )
                for i, (lo, hi) in enumerate(intervals):
                    start = max(0, lo)
                    end = min(length, hi)
                    if end < start:
                        end = start
                    calc(
                        "leadCoverage." + side + "." + key + "." + str(i),
                        side + ".leadFilm",
                        on_line(start),
                        on_line(end),
                        side + " / " + key + f" 실런트 XY 중심선 겹침 {i+1}",
                        basis="작업면 BRep 교차 · XY 투영. 실제 접촉/융착 아님",
                    )
                    for name, t, u in [("inner", 0, lo), ("outer", length, hi)]:
                        calc(
                            "leadBoundary."
                            + side
                            + "."
                            + key
                            + "."
                            + name
                            + "."
                            + str(i),
                            side + ".leadFilm",
                            on_line(t),
                            on_line(u),
                            side
                            + " / "
                            + key
                            + " 실런트 "
                            + name
                            + " 끝↔실링 경계 XY 거리",
                            signedMaterialGap=t - u,
                        )

    if cap["fold"]:
        for edge, prof in profiles.items():
            sign = 1 if edge == "yPlus" else -1
            if prof["ops"]:
                end = min(abs(q["sheets"][half]["cut"][edge]) for half in HALVES)
                lo = mapped_point(profiles, [0, sign * end, sheet_ranges["lower"][0]])
                hi = mapped_point(profiles, [0, sign * end, sheet_ranges["upper"][1]])
                calc(
                    "foldEnvelope." + edge + ".thickness",
                    "pouch.upper.flange",
                    lo,
                    hi,
                    edge + " 접힌 끝 상하 포락 두께 · 공칭 gap 포함",
                )
                calc(
                    "foldEnvelope." + edge + ".height",
                    "pouch.upper.flange",
                    [hi[0], hi[1], 0],
                    hi,
                    edge + " 접힌 끝 Z 높이",
                )
            for key, f in prof["ops"]:
                if abs(f["angle"]) < 1e-9:
                    continue
                seg = next(seg for seg in prof["pieces"] if seg[5] == key)
                y, z, theta = at(prof, f["line"], prof["neutral"])
                k = seg[4]
                rad = f["innerR"]
                surface_half = "upper" if k > 0 else "lower"
                zsurf = sheet_ranges[surface_half][1 if k > 0 else 0]
                start = mapped_point(profiles, [0, sign * f["line"], zsurf])
                center = [0, sign * (y - math.sin(theta) / k), z + math.cos(theta) / k]
                arc = [
                    mapped_point(
                        profiles,
                        [0, sign * (seg[0] + (seg[1] - seg[0]) * i / 24), zsurf],
                    )
                    for i in range(25)
                ]
                point(
                    "pouch.input.folds." + key + ".innerR.a",
                    "pouch." + surface_half + ".flange",
                    start,
                    "radius",
                    center=center,
                    value=rad,
                    arc=arc,
                )
                metrics.append(
                    {
                        "id": "pouch.input.folds." + key + ".innerR",
                        "name": key + " 내측 R",
                        "a": "pouch.input.folds." + key + ".innerR.a",
                        "b": "pouch.input.folds." + key + ".innerR.a",
                        "mode": "radius",
                        "parameterId": PREFIX + "folds." + key + ".innerR",
                        "kind": "input",
                    }
                )
                dim(
                    "folds." + key + ".line",
                    "pouch.upper.flange",
                    [0, 0, prof["neutral"]],
                    mapped_point(profiles, [0, sign * f["line"], prof["neutral"]]),
                )
                paths.append(
                    {
                        "partId": "pouch.upper.flange",
                        "color": "#ffab42",
                        "points": [
                            mapped_point(
                                profiles, [x, sign * f["line"], prof["neutral"]]
                            )
                            for x in [
                                q["sheets"]["upper"]["cut"]["xMinus"],
                                q["sheets"]["upper"]["cut"]["xPlus"],
                            ]
                        ],
                    }
                )
        # Folded sheets must not self-intersect the cup or each other.
        for half in HALVES:
            flange = next(
                p["shape"] for p in parts if p["id"] == "pouch." + half + ".flange"
            )
            if flange.intersect(shells[half]).Volume() > 1e-6:
                raise ModelError(
                    ["pouchProcess.folds: 접힌 재료가 성형 포켓을 침범합니다"]
                )
        upper = next(p["shape"] for p in parts if p["id"] == "pouch.upper.flange")
        lower = next(p["shape"] for p in parts if p["id"] == "pouch.lower.flange")
        if upper.intersect(lower).Volume() > 1e-6:
            raise ModelError(["pouchProcess.folds: 상하 접힌 재료가 서로 교차합니다"])
    if not cap["assembly"]:
        for part, suffixes in [
            (
                "stack",
                [
                    "length.minus",
                    "length.plus",
                    "width.minus",
                    "width.plus",
                    "thickness.minus",
                    "thickness.plus",
                    "cornerR",
                ],
            )
        ] + [
            (side + "." + part, keys)
            for side in ["positive", "negative"]
            for part, keys in [
                (
                    "tab",
                    [
                        "root",
                        "rootWidthMinus",
                        "rootWidthPlus",
                        "gather",
                        "tipCenter",
                        "top",
                        "bottom",
                        "gatherWidthMinus",
                        "gatherWidthPlus",
                    ],
                ),
                (
                    "lead",
                    [
                        "start",
                        "end",
                        "widthMinus",
                        "widthPlus",
                        "center",
                        "top",
                        "bottom",
                    ],
                ),
                ("leadFilm", ["start", "end", "widthMinus", "widthPlus"]),
            ]
        ]:
            for suffix in suffixes:
                features[part + "." + suffix] = {
                    "partId": part,
                    "name": part + "." + suffix,
                    "kind": "unavailable",
                    "available": False,
                    "reasonCode": "stage_absent",
                    "reason": "성형 외장 반제품에는 조립체가 없음 · 수납에서 합류",
                }
    physical = [p["shape"] for p in parts if p["role"] != "region"]
    bounds = exact_bounds(cq.Compound.makeCompound(physical))
    for axis, lo, hi in [
        ("x", bounds.xmin, bounds.xmax),
        ("y", bounds.ymin, bounds.ymax),
        ("z", bounds.zmin, bounds.zmax),
    ]:
        a = [0.0, 0.0, 0.0]
        b = a.copy()
        a["xyz".index(axis)] = lo
        b["xyz".index(axis)] = hi
        calc("envelope." + axis, "datum", a, b, "전체 외곽 " + axis.upper() + " 투영")
    for part in parts:
        if not part["shape"].isValid():
            raise ModelError([part["id"] + ": CAD 유효성 실패"])
        # Surface-sensitive deterministic signature, not just volume/bounding box.
        signature = sorted(
            (
                f.geomType(),
                round(f.Area(), 7),
                *[round(v, 7) for v in f.Center().toTuple()],
            )
            for f in part["shape"].Faces()
        )
        part.setdefault("meta", {})["surfaceSignature"] = hashlib.sha256(
            json.dumps(signature).encode()
        ).hexdigest()
    for f in features.values():
        f.setdefault("available", True)
    diagnostics.insert(
        0,
        {
            "level": "warning",
            "message": "가상/사내 입력 기반 공칭 모델. 분리 두 장·수직 벽; 실링 영역은 작업면 투영입니다. 상하 필름 압착·리드 주변 수지 유동·열융착·물성은 예측하지 않습니다.",
        },
    )
    return {
        "stage": stage,
        "parts": parts,
        "features": features,
        "paths": paths,
        "diagnostics": diagnostics,
        "processMetrics": metrics,
        "materialProfiles": profiles,
        "processCapabilities": cap,
    }
