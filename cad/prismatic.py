"""Right-angle demonstration solids; all coordinates and measurements are in mm."""

import math

import cadquery as cq

from geometry_metrics import exact_bounds
from process import ModelError

STAGES = ("prism-stack", "prism-join", "prism-insulate", "prism-insert", "prism-weld")
GROUPS = {"S": 7, "K": 7, "J": 2, "I": 2, "C": 5, "A": 1, "W": 1}
EPS = 1e-7
PARTS = {
    "stack": ("적층 스택", "#596d86"),
    "tab": ("탭 접촉대", "#cd8243"),
    "cap": ("캡 몸체", "#a7b6bd"),
    "collector": ("집전체 접촉면", "#f4b95b"),
    "insulation": ("5면 절연층", "#79bbad"),
    "can": ("중공 캔", "#93aab9"),
    "weld": ("둘레 용접 표시", "#d39436"),
}


def inputs(product):
    values = product.get("values", {})
    groups = {}
    for letter, count in GROUPS.items():
        group = []
        for n in range(1, count + 1):
            key = f"{letter}{n:02}"
            value = values.get(key)
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ModelError([f"{key} · 유한한 mm 값이 필요합니다"])
            if key not in ("J01", "K04"):
                allow_zero = key in ("I02", "J02", "A01", "S05", "K05")
                if value < 0 or (not allow_zero and value == 0):
                    raise ModelError([f"{key} · 허용 범위 밖의 치수입니다"])
            group.append(value)
        groups[letter] = group
    if len(values) != sum(GROUPS.values()):
        raise ModelError(["독립 입력 25개만 허용합니다. 계산값은 CAD에서 구합니다."])
    return groups


def box(x0, x1, y0, y1, z0, z1):
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, (x0, y0, z0))


def rectangle(points):
    return cq.Face.makeFromWires(
        cq.Wire.makePolygon([cq.Vector(*p) for p in points], close=True)
    )


def build(product, stage):
    g = inputs(product)
    l, w, h, q, sa, sh, sw = g["S"]
    kl, kw, kt, px, ka, kh, bw = g["K"]
    dy, dz = g["J"]
    t, setback = g["I"]
    length, width, depth, wall, floor = g["C"]
    (travel,) = g["A"]
    (band,) = g["W"]
    if setback >= h or sa + sh > h or sw > w:
        raise ModelError(["I02 < S03, S05 + S06 ≤ S03, S07 ≤ S02 조건을 확인하세요"])
    if band >= min(length, width):
        raise ModelError(["W01 · 표시 폭이 캔 개구보다 커질 수 없습니다"])
    index = STAGES.index(stage)
    # Only the joined assembly has K/S mates; N_A is fixed throughout insertion.
    dx = px - l / 2 - q
    u = travel if index >= 3 else 0
    x, y, z = (dx, dy, u - dz) if index else (0, 0, 0)
    xl, xr, yl, yr = x - l / 2, x + l / 2, y - w / 2, y + w / 2
    bottom = z - h
    stack = box(xl, xr, yl, yr, bottom, z)
    tab = box(xr, xr + q, y - sw / 2, y + sw / 2, z - sa - sh, z - sa)
    cap = box(-kl / 2, kl / 2, -kw / 2, kw / 2, u, u + kt)
    # Only the specified visible contact plane is known. No hidden return path.
    cb, ct = u - ka - kh, u - ka
    collector = rectangle(
        [(px, -bw / 2, cb), (px, bw / 2, cb), (px, bw / 2, ct), (px, -bw / 2, ct)]
    )
    outside = box(xl - t, xr + t, yl - t, yr + t, bottom - t, z - setback)
    insulation = outside.cut(stack)
    nx, ny = length / 2, width / 2
    ox, oy = nx + wall, ny + wall
    outer = box(-ox, ox, -oy, oy, -depth - floor, 0)
    cavity = box(-nx, nx, -ny, ny, -depth, 0)
    can = outer.cut(cavity)
    sb, tb, kb, jb = [exact_bounds(s) for s in (stack, tab, cap, collector)]
    ib, nb, ob = [exact_bounds(s) for s in (insulation, cavity, can)]
    measurements = {}

    def line(key, axis, start, end, at, sign=1):
        a, b = list(at), list(at)
        a[axis], b[axis] = start, end
        measurements[key] = dict(start=a, end=b, value=sign * (end - start), axis=axis)

    line("S01", 0, sb.xmin, sb.xmax, (0, yl, z))
    line("S02", 1, sb.ymin, sb.ymax, (x, 0, z))
    line("S03", 2, sb.zmin, sb.zmax, (xl, yl, 0))
    line("S04", 0, sb.xmax, tb.xmax, (0, y, tb.zmax))
    line("S05", 2, sb.zmax, tb.zmax, (xr, y, 0), -1)
    line("S06", 2, tb.zmax, tb.zmin, (tb.xmax, y, 0), -1)
    line("S07", 1, tb.ymin, tb.ymax, (tb.xmax, 0, tb.zmax))
    line("K01", 0, kb.xmin, kb.xmax, (0, -kw / 2, kb.zmax))
    line("K02", 1, kb.ymin, kb.ymax, (0, 0, kb.zmax))
    line("K03", 2, kb.zmin, kb.zmax, (kb.xmin, kb.ymin, 0))
    line("K04", 0, 0, jb.xmax, (0, 0, u))
    line("K05", 2, kb.zmin, jb.zmax, (px, 0, 0), -1)
    line("K06", 2, jb.zmax, jb.zmin, (px, 0, 0), -1)
    line("K07", 1, jb.ymin, jb.ymax, (px, 0, ct))
    line("J01", 1, 0, y, (0, 0, z))
    line("J02", 2, kb.zmin, sb.zmax, (0, y, 0), -1)
    line("J03", 0, 0, x, (0, y, z))
    high, low = min(jb.zmax, tb.zmax), max(jb.zmin, tb.zmin)
    left, right = max(jb.ymin, tb.ymin), min(jb.ymax, tb.ymax)
    line("J04", 2, high, min(high, low), (px, y, 0), -1)
    line("J05", 1, left, max(left, right), (px, 0, high))
    line("I01", 1, sb.ymax, ib.ymax, (x, 0, bottom + h / 2))
    line("I02", 2, sb.zmax, ib.zmax, (xl, yl, 0), -1)
    line("I03", 0, ib.xmin, ib.xmax, (0, yl, bottom))
    line("I04", 1, ib.ymin, ib.ymax, (x, 0, bottom))
    line("I05", 2, ib.zmin, sb.zmax, (x, y, 0))
    line("C01", 0, nb.xmin, nb.xmax, (0, 0, 0))
    line("C02", 1, nb.ymin, nb.ymax, (0, 0, 0))
    line("C03", 2, nb.zmax, nb.zmin, (0, 0, 0), -1)
    line("C04", 1, nb.ymax, ob.ymax, (0, 0, 0))
    line("C05", 2, nb.zmin, ob.zmin, (0, 0, 0), -1)
    line("A01", 2, nb.zmax, kb.zmin, (0, 0, 0))
    # XY gaps are projected onto the design section. Bottom clearance is at u=0.
    section_z = (max(nb.zmin, ib.zmin - u) + min(0, ib.zmax - u)) / 2
    line("A02", 0, nb.xmin, ib.xmin, (0, y, section_z))
    line("A03", 0, ib.xmax, nb.xmax, (0, y, section_z))
    line("A04", 1, nb.ymin, ib.ymin, (x, 0, section_z))
    line("A05", 1, ib.ymax, nb.ymax, (x, 0, section_z))
    line("A06", 2, nb.zmin, ib.zmin - u, (x, y, 0))
    line("A07", 0, jb.xmax, nb.xmax, (0, 0, ct))
    line("A08", 0, ob.xmax, kb.xmax, (0, 0, 0))
    line("A09", 1, ob.ymax, kb.ymax, (0, 0, 0))
    line("W01", 1, oy - band / 2, oy + band / 2, (0, 0, 0))
    rim = rectangle([(-ox, -oy, 0), (ox, -oy, 0), (ox, oy, 0), (-ox, oy, 0)])
    perimeter = [[-ox, -oy, 0], [ox, -oy, 0], [ox, oy, 0], [-ox, oy, 0], [-ox, -oy, 0]]
    measurements["W02"] = dict(
        value=rim.outerWire().Length(),
        path=perimeter,
        start=perimeter[0],
        end=perimeter[-1],
        axis=0,
    )
    val = lambda key: measurements[key]["value"]
    joint = min(val("J04"), val("J05")) > EPS
    messages = []
    if index >= 1 and not joint:
        messages.append("접합 불성립 · 탭과 집전체 접촉대의 겹침이 없습니다.")
    clashes = [
        (key, direction)
        for key, direction in [
            ("A02", "−X"),
            ("A03", "+X"),
            ("A04", "−Y"),
            ("A05", "+Y"),
            ("A06", "바닥"),
            ("A07", "접속면 +X"),
        ]
        if val(key) < -EPS
    ]
    # Envelope sweep is exact for this straight extrusion/translation. Check the
    # contact proxies independently in Y/Z as their extent can exceed the body.
    extra = []
    for label, bounds in [("탭", tb), ("집전체 접촉면", jb)]:
        for direction, gap in [
            ("-Y", bounds.ymin + ny),
            ("+Y", ny - bounds.ymax),
            ("−X", bounds.xmin + nx),
            ("+X", nx - bounds.xmax),
            ("바닥", bounds.zmin - u + depth),
        ]:
            if gap < -EPS:
                extra.append(f"{label} {direction} {gap:.2f} mm")
    if index >= 3:
        messages += [
            f"삽입 간섭 · {direction} {val(key):.2f} mm ({key})"
            for key, direction in clashes
        ]
        messages += ["삽입 경로 간섭 · " + reason for reason in extra]
    seated = index >= 3 and joint and not clashes and not extra and u <= EPS
    aligned = max(abs(val("A08")), abs(val("A09"))) <= EPS
    welded = index == 4 and seated and aligned
    if index >= 3 and not aligned:
        messages.append("캡–캔 외주 단차 · 용접 완료 차단 (허용 수치오차 0.0000001 mm)")
    if index == 4 and u > EPS:
        messages.append("안착 필요 · 삽입 행정 A01이 0 mm일 때 용접 표시가 가능합니다.")
    shapes = [("stack", stack), ("tab", tab)]
    if index >= 1:
        shapes += [("cap", cap), ("collector", collector)]
    if index >= 2:
        shapes.append(("insulation", insulation))
    if index >= 3:
        shapes.append(("can", can))
    if welded:
        # Display face only; not an exported weld bead or penetration solid.
        def wire(offset):
            a, b = ox + offset, oy + offset
            return rectangle(
                [(-a, -b, 0), (a, -b, 0), (a, b, 0), (-a, b, 0)]
            ).outerWire()

        shapes.append(
            ("weld", cq.Face.makeFromWires(wire(band / 2), [wire(-band / 2)]))
        )
    parts = [
        dict(
            id=i,
            name=PARTS[i][0],
            color=PARTS[i][1],
            shape=s,
            role="region" if i in ("weld", "collector") else "solid",
        )
        for i, s in shapes
    ]
    # Intersect the actual CAD topology with the three inspection planes; emit
    # straight section edges (every solid in this proxy is planar).
    sections = {}
    for axis, origin, normal in [
        ("x", (x, 0, 0), (1, 0, 0)),
        ("y", (0, y, 0), (0, 1, 0)),
        ("z", (0, 0, section_z), (0, 0, 1)),
    ]:
        plane = cq.Face.makePlane(basePnt=origin, dir=normal)
        sections[axis] = {
            i: [
                [e.startPoint().toTuple(), e.endPoint().toTuple()]
                for e in solid.intersect(plane).Edges()
            ]
            for i, solid in shapes
        }
    return dict(
        stage=stage,
        parts=parts,
        sections=sections,
        features=measurements,
        diagnostics=[dict(level="warning", message=m) for m in messages],
        approval=dict(joined=index >= 1 and joint, seated=seated, welded=welded),
        datums=dict(S=[x, y, z], K=[0, 0, u], N=[0, 0, 0]),
        sectionZ=section_z,
    )
