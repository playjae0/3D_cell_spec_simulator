"""Tangent, lead-centered tab workface and OCC measurement references."""
import math

import cadquery as cq
from OCP.BRepTools import BRepTools_WireExplorer

from process import ModelError

ANGLE = math.atan(0.5)
TOL = 1e-6


def vector(u, v):
    return cq.Vector(u, v, 0)


def tab_face(bar, product):
    """Return the closed base face and the two analytic inspection edges.

    U is transverse across the lead, with the origin at its actual center.
    V increases outboard from the tool's product X datum. The exterior is V=0.
    """
    side = bar["location"]
    pole = product[side]
    p = bar["tabProfile"]
    length, radius = p["centerLength"], p["transitionR"]
    narrow, wide = p["centerWidth"], p["outerWidth"]
    start, stop, offset = (p[k] for k in ["startU", "endU", "centerOffset"])

    def require(condition, reason):
        if not condition:
            raise ModelError([bar["id"] + ": " + reason])

    require(bar["rotation"] == 0, "리드 기준 작업면의 회전은 0°여야 합니다")
    require(length > 0 and radius > 0 and wide > narrow > 0, "L·R은 양수, 바깥 폭 > 중앙 폭 > 0이어야 합니다")
    require(length / 2 >= max(pole["lead"]["width"] / 2,
                              pole["tab"]["foilWidth"] / 2 + abs(pole["lead"]["offsetY"])) + abs(offset) - TOL,
            "중앙 접점이 금속 리드 또는 탭 폭 안쪽에 있습니다. L을 늘리거나 중심 위치를 조정하세요")
    s, c = math.sin(ANGLE), math.cos(ANGLE)
    rise = wide - narrow - 2 * radius * (1 - c)
    require(rise > TOL, "R이 두 폭의 차이에 비해 커서 접선 구간이 남지 않습니다")
    reach = 2 * radius * s + rise * c / s
    left, right = offset - length / 2, offset + length / 2
    require(start < left - reach - TOL and stop > right + reach + TOL,
            "L과 R을 적용하면 바깥 수평부가 공구 끝을 벗어납니다")

    def mirrored_transition(sign):
        def pt(u, v):
            return vector(right + u if sign > 0 else left - u, v)

        h = radius * s
        half_h = radius * math.sin(ANGLE / 2)
        half_drop = radius * (1 - math.cos(ANGLE / 2))
        drop = radius * (1 - c)
        a, b = pt(0, -narrow), pt(h, -narrow - drop)
        d, e = pt(reach - h, -wide + drop), pt(reach, -wide)
        return [
            cq.Edge.makeThreePointArc(a, pt(half_h, -narrow - half_drop), b),
            cq.Edge.makeLine(b, d),
            cq.Edge.makeThreePointArc(d, pt(reach - half_h, -wide + half_drop), e),
        ]

    center = cq.Edge.makeLine(vector(left, -narrow), vector(right, -narrow))
    left_edges, right_edges = mirrored_transition(-1), mirrored_transition(1)
    inner_start, inner_end = vector(start, -wide), vector(stop, -wide)
    outer_start, outer_end = vector(start, 0), vector(stop, 0)
    edges = [
        cq.Edge.makeLine(inner_start, vector(left - reach, -wide)),
        *left_edges, center, *right_edges,
        cq.Edge.makeLine(vector(right + reach, -wide), inner_end),
        cq.Edge.makeLine(inner_end, outer_end),
        cq.Edge.makeLine(outer_end, outer_start),
        cq.Edge.makeLine(outer_start, inner_start),
    ]
    face = cq.Face.makeFromWires(cq.Wire.assembleEdges(edges))
    require(face.isValid() and face.Area() > TOL, "접선 작업면이 닫히지 않거나 유효하지 않습니다")
    return face, {"center": center, "radius": right_edges[0]}


def continuous_paths(shape):
    """Tessellate consecutive walk-oriented BRep edges for the workface drawing."""
    paths = []
    for wire in shape.Wires():
        explorer = BRepTools_WireExplorer(wire.wrapped)
        points = []
        while explorer.More():
            edge = cq.Edge(explorer.Current())
            start = cq.Vertex(explorer.CurrentVertex()).Center()
            steps = 16 if edge.geomType() != "LINE" else 1
            coords = edge.positions([i / steps for i in range(steps + 1)])
            if (coords[-1] - start).Length < (coords[0] - start).Length:
                coords.reverse()
            points.extend(list(point.toTuple()) for point in coords[:-1])
            explorer.Next()
        if points:
            paths.append([*points, points[0]])
    return paths


def on_boundary(region, reference):
    """Locate an exact OCC edge by testing the complete reference against it."""
    for edge in region.Edges():
        if edge.geomType() != reference.geomType() or abs(edge.Length() - reference.Length()) > TOL:
            continue
        samples = reference.positions([0, .25, .5, .75, 1])
        if all(edge.distance(cq.Vertex.makeVertex(*p.toTuple())) < TOL for p in samples):
            return edge
    return None


def edge_info(edge):
    if edge.geomType() == "CIRCLE":
        return {"radius": edge.radius(), "center": list(edge.arcCenter().toTuple()),
                "arc": [list(p.toTuple()) for p in edge.positions([i / 16 for i in range(17)])]}
    return {"length": edge.Length(), "ends": [list(p.toTuple()) for p in edge.positions([0, 1])]}


def report_profile(model, product, side, step, region, tab_edges, reports, profiles, surface_z):
    from pouch_material import mapped_point
    from pouch_process import line_intervals
    from process_tooling import feature, metric, seal_transform, slab
    from proof_pocket import roundwire

    report = reports["seals"][side]
    pole = product[side]
    cy = pole["tab"]["gatherY"] + pole["lead"]["offsetY"]
    definition = product["processTooling"]["sealBars"]
    part = "seal." + side
    report["limitingBars"] = [
        half for half, other in [("upper", "lower"), ("lower", "upper")]
        if reports["seals"][side + "_" + other]["projectionArea"] >
        report["overlapArea"] + TOL
    ]
    # Use the exact retained BRep edges. An unmatched edge is not inferred from tool inputs.
    measured = {}
    for half in ("upper", "lower"):
        key = side + "_" + half
        for name, edge in tab_edges.get(key, {}).items():
            actual = on_boundary(region, seal_transform(edge, definition[key], product))
            if actual is not None and name not in measured:
                measured[name] = {**edge_info(actual), "bar": half}
    report["tabDimensions"] = measured
    if step < 3:
        return

    def material(point):
        return mapped_point(profiles, [point[0], point[1], surface_z])

    stem = "phase1.seal." + side
    if "center" in measured:
        a, b = measured["center"]["ends"]
        metric(model, stem + ".L", part, material(a), material(b), side + " 중앙 접점 L")
    if "radius" in measured:
        arc = measured["radius"]["arc"]
        ref = stem + ".R"
        feature(model, ref, part, material(arc[len(arc)//2]), kind="radius",
                value=measured["radius"]["radius"], center=material(measured["radius"]["center"]),
                arc=[material(point) for point in arc])
        model.setdefault("processMetrics", []).append({
            "id": ref, "name": side + " 전이 R", "a": ref, "mode": "radius", "kind": "calculated",
        })

    # Product-width measurements beyond the tab at a consistent lead-relative station.
    report["profileWidths"] = {}
    if region.Area() > TOL:
        solid = slab(region)
        for name, y in [("left", cy-35), ("center", cy), ("right", cy+35)]:
            spans = line_intervals(solid, [0,y,.05], [1,0,0])
            report["profileWidths"][name] = sum(b-a for a,b in spans)
            if spans:
                a, b = max(spans, key=lambda span: span[1]-span[0])
                metric(model, stem + "." + name, part, material([a,y,0]), material([b,y,0]),
                       side + " 실링 폭 " + name)

    # Display context comes from the corresponding CAD geometry, in the same XY frame.
    context = {}
    for item in model["parts"]:
        if item["id"] in (side+".lead", side+".leadFilm"):
            box = item["shape"].BoundingBox()
            context[item["id"]] = [box.xmin, box.ymin, box.xmax, box.ymax]
    upper = product["pouchProcess"]["sheets"]["upper"]
    datum = product["processTooling"]["packaging"]["cups"]["upper"]
    opening = roundwire(upper["openingLength"], upper["openingWidth"], upper["planR"])
    report["cupOpening"] = continuous_paths(opening.translate((datum["x"], datum["y"], 0)))
    report["planContext"] = context
