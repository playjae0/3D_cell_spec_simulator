"""Nominal material mapping: circular bends + straight panels, exact OCC sections.

s is developed distance in the sheet's +/−Y direction. Bend IDs and tangent
starts stay in material coordinates. Only parallel, inner-to-outer bends are
supported. The explicitly selected laminate middle reference layer preserves
arc length; no elastic/plastic strain or springback prediction is implied.
"""

import math
import cadquery as cq
from process import ModelError


def profile(q, edge, limit):
    layers = q["sheets"]
    gap = q["seamGap"]
    zlo = -gap / 2 - layers["lower"]["filmThickness"]
    zhi = gap / 2 + layers["upper"]["filmThickness"]
    neutral = zlo + (zhi - zlo) * q["neutralFraction"]
    ops = [(k, v) for k, v in q["folds"].items() if v["enabled"] and v["edge"] == edge]
    ops.sort(key=lambda kv: kv[1]["order"])
    last = 0.0
    pos = (0.0, neutral)
    theta = 0.0
    pieces = []
    orders = set()
    for key, f in ops:
        if f["order"] in orders:
            raise ModelError(["pouchProcess.folds." + key + ".order: 접힘 순서 중복"])
        orders.add(f["order"])
        start = f["line"]
        delta = math.radians(f["angle"])
        if start < last - 1e-7:
            raise ModelError(
                [
                    "pouchProcess.folds."
                    + key
                    + ".line: 순서가 재료의 안쪽→바깥쪽이 아니거나 이전 곡률 구간과 겹칩니다"
                ]
            )
        if abs(delta) < 1e-9:
            continue
        if abs(f["angle"]) > 180:
            raise ModelError(
                ["pouchProcess.folds." + key + ".angle: 단일 접힘은 −180..180°"]
            )
        radius = f["innerR"] + ((zhi - neutral) if delta > 0 else (neutral - zlo))
        if f["innerR"] <= 0:
            raise ModelError(
                ["pouchProcess.folds." + key + ".innerR: 양의 내측 반경 필요"]
            )
        span = radius * abs(delta)
        if start + span > limit + 1e-7:
            raise ModelError(
                [
                    "pouchProcess.folds."
                    + key
                    + ": 절곡 호 길이가 남길 재료 범위를 넘습니다"
                ]
            )
        if start > last:
            pieces.append((last, start, pos, theta, 0.0, None))
            pos = (
                pos[0] + (start - last) * math.cos(theta),
                pos[1] + (start - last) * math.sin(theta),
            )
        k = (1 if delta > 0 else -1) / radius
        pieces.append((start, start + span, pos, theta, k, key))
        pos = (
            pos[0] + (math.sin(theta + delta) - math.sin(theta)) / k,
            pos[1] + (-math.cos(theta + delta) + math.cos(theta)) / k,
        )
        theta += delta
        last = start + span
        if abs(theta) > math.pi + 1e-8:
            raise ModelError(
                ["pouchProcess.folds." + key + ": 누적 절곡 각도는 ±180° 이내만 지원"]
            )
    if last < limit:
        pieces.append((last, limit, pos, theta, 0.0, None))
    return {
        "pieces": pieces,
        "neutral": neutral,
        "edge": edge,
        "limit": limit,
        "ops": ops,
    }


def at(prof, s, z):
    pieces = prof["pieces"]
    seg = next((p for p in pieces if p[0] - 1e-7 <= s <= p[1] + 1e-7), None)
    if seg is None:
        raise ModelError(["재료 좌표가 폴딩 프로필 밖입니다"])
    a, b, (y0, z0), theta, k, _ = seg
    u = s - a
    angle = theta + k * u
    if k:
        y = y0 + (math.sin(angle) - math.sin(theta)) / k
        zz = z0 + (-math.cos(angle) + math.cos(theta)) / k
    else:
        y = y0 + u * math.cos(theta)
        zz = z0 + u * math.sin(theta)
    off = z - prof["neutral"]
    return y - off * math.sin(angle), zz + off * math.cos(angle), angle


def solid(prof, x0, x1, s0, s1, z0, z1, sign=1):
    cuts = sorted(
        set([s0, s1] + [v for p in prof["pieces"] for v in p[:2] if s0 < v < s1])
    )

    def p(s, z):
        y, zz, _ = at(prof, s, z)
        return (sign * y, zz)

    w = cq.Workplane("YZ", origin=(x0, 0, 0)).moveTo(*p(s0, z0))

    def trace(w, ss, z):
        for a, b in zip(ss, ss[1:]):
            mid = (a + b) / 2
            seg = next(t for t in prof["pieces"] if t[0] - 1e-8 <= mid <= t[1] + 1e-8)
            w = w.threePointArc(p(mid, z), p(b, z)) if seg[4] else w.lineTo(*p(b, z))
        return w

    w = trace(w, cuts, z0).lineTo(*p(s1, z1))
    w = trace(w, list(reversed(cuts)), z1).close()
    return w.extrude(x1 - x0).val()


def mapped_point(profiles, point):
    x, y, z = point
    edge = "yPlus" if y >= 0 else "yMinus"
    prof = profiles.get(edge)
    if not prof:
        return list(point)
    if abs(y) > prof["limit"] + 1e-7:
        return None
    yy, zz, _ = at(prof, abs(y), z)
    return [x, (1 if y >= 0 else -1) * yy, zz]


def mapped_normal(profiles, point, n):
    edge = "yPlus" if point[1] >= 0 else "yMinus"
    p = profiles.get(edge)
    if not p:
        return list(n)
    sign = 1 if point[1] >= 0 else -1
    angle = at(p, abs(point[1]), point[2])[2]
    x, y, z = n
    return [
        x,
        y * math.cos(angle) - sign * z * math.sin(angle),
        sign * y * math.sin(angle) + z * math.cos(angle),
    ]
