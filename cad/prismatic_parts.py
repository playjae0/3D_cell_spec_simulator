"""Illustrative prismatic hardware. All parts use the parent's assembly datums (mm)."""

import cadquery as cq

from process import ModelError


def box(x0, x1, y0, y1, z0, z1):
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, (x0, y0, z0))


def stack_parts(xr, y, z, length, width, height, reach, drop, tip_height, tip_width):
    """Seven representative packets. Only the outer envelope and free end are dimensioned."""
    x0, yl = xr - length, y - width / 2
    root_x = xr - min(length * 0.13, 14)
    root_end = root_x + (xr - root_x) * 0.27
    free_x = xr + reach * 0.58
    top, base = z - drop, z - drop - tip_height
    root_bottom = max(z - height, base - min(height * 0.14, tip_height * 2.4))
    pocket = box(root_x, xr + reach, yl - 1, yl + width + 1, root_bottom, z + 1)
    packets, roots, bundle = [], [], []
    count = 7
    pitch = width / count
    for i in range(count):
        # Shallow steps at exposed edges, with a continuous material envelope below.
        relief = min(0.28, height * 0.002, length * 0.002) if i % 2 else 0
        packets.append(
            box(
                x0 + relief,
                xr,
                yl + i * pitch,
                yl + (i + 1) * pitch,
                z - height,
                z - relief,
            ).cut(pocket)
        )
        f = (i + 0.5) / count - 0.5
        root_y, end_y = y + f * width, y + f * tip_width
        root_thick, end_thick = pitch * 0.46, tip_width / count * 0.79
        roots.append(
            box(
                root_x,
                root_end,
                root_y - root_thick / 2,
                root_y + root_thick / 2,
                root_bottom,
                top,
            )
        )

        def profile(s, blend):
            cy = root_y + (end_y - root_y) * blend
            half = (root_thick + (end_thick - root_thick) * blend) / 2
            lo = root_bottom + (base - root_bottom) * blend
            xx = root_end + (free_x - root_end) * s
            return cq.Wire.makePolygon(
                [
                    (xx, cy - half, lo),
                    (xx, cy + half, lo),
                    (xx, cy + half, top),
                    (xx, cy - half, top),
                ],
                close=True,
            )

        stations = [(0, 0), (0.25, 0.15625), (0.75, 0.84375), (1, 1)]
        bundle.append(
            cq.Solid.makeLoft([profile(s, b) for s, b in stations], ruled=True)
        )
    tip = box(free_x, xr + reach, y - tip_width / 2, y + tip_width / 2, base, top)
    return {
        "stack": cq.Compound.makeCompound(packets),
        "foil-root": cq.Compound.makeCompound(roots),
        "foil-gather": cq.Compound.makeCompound(bundle),
        "tab": tip,
    }


def terminal(x, y, length, width, height, base):
    # A small blind top recess and a stepped base reproduce the visible silhouette.
    pedestal = min(height * 0.22, 0.65)
    body = (
        cq.Workplane("XY")
        .workplane(offset=base)
        .center(x, y)
        .rect(length, width)
        .extrude(pedestal)
        .faces(">Z")
        .workplane(centerOption="CenterOfMass")
        .rect(length * 0.92, width * 0.83)
        .extrude(height - pedestal)
        .val()
    )
    recess = cq.Solid.makeCylinder(
        min(width * 0.17, length * 0.17),
        (height - pedestal) * 0.38,
        (x, y, base + height),
        (0, 0, -1),
    )
    return body.cut(recess)


def cap_parts(
    length, width, thickness, base, px, pad_bottom, pad_width, gauge, terminals
):
    topside = base + thickness
    plate = box(-length / 2, length / 2, -width / 2, width / 2, base, topside)
    contour_l, contour_w = length * 0.16, min(width * 0.17, length * 0.07)
    contour = (
        cq.Workplane("XY")
        .workplane(offset=topside)
        .slot2D(contour_l, contour_w)
        .slot2D(contour_l - contour_w * 0.28, contour_w * 0.72)
        .extrude(min(0.38, thickness * 0.2))
        .val()
    )
    # A single landing and downstand on the observed end. No hidden return conductor.
    collector = box(px, px + gauge, -pad_width / 2, pad_width / 2, pad_bottom, base)
    if px + gauge < -length / 2 or px > length / 2 or pad_width > width:
        raise ModelError(["K04/K07/K08 · 집전체가 캡 하면과 만나지 않습니다"])
    shapes = {"cap": plate, "cap-outline": contour, "collector": collector}
    occupied = [(-contour_l / 2, contour_l / 2, -contour_w / 2, contour_w / 2)]
    for name, (x, y, l, w, h) in terminals.items():
        bounds = (x - l / 2, x + l / 2, y - w / 2, y + w / 2)
        a, b, c, d = bounds
        if a < -length / 2 or b > length / 2 or c < -width / 2 or d > width / 2:
            raise ModelError([f"{name} · 터미널 외곽이 캡 플레이트를 벗어납니다"])
        if any(a < bb and b > aa and c < dd and d > cc for aa, bb, cc, dd in occupied):
            raise ModelError([f"{name} · 터미널과 기존 상면 윤곽이 겹칩니다"])
        occupied.append(bounds)
        shapes[name] = terminal(x, y, l, w, h, topside)
    return shapes
