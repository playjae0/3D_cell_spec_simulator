"""Reproducible engineering figures from actual OCC surfaces and sections (mm)."""

import sys, json, copy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))
import cadquery as cq
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from model import build

OUT = ROOT / "docs/validation-pouch-v1.5"
OUT.mkdir(exist_ok=True)
P = json.loads((ROOT / "examples/pouch-process.json").read_text())["product"]
models = {s: build(P, s) for s in ["loaded", "trimmed", "folded"]}
colors = {"pouch.upper": "#176d8f", "pouch.lower": "#287c51", "seal.": "#c68b13"}


def color(p):
    return next((v for k, v in colors.items() if p["id"].startswith(k)), p["color"])


def section(
    ax, model, axis, position, axes, include=lambda p: not p["id"].startswith("tool.")
):
    normal = [0, 0, 0]
    normal[axis] = 1
    origin = [0, 0, 0]
    origin[axis] = position
    plane = cq.Face.makePlane(2000, 2000, cq.Vector(*origin), cq.Vector(*normal))
    for p in model["parts"]:
        if not include(p):
            continue
        for edge in p["shape"].intersect(plane).Edges():
            points = np.array(
                [edge.positionAt(t).toTuple() for t in np.linspace(0, 1, 65)]
            )
            ax.plot(points[:, axes[0]], points[:, axes[1]], color=color(p), lw=1)
    ax.set_aspect("equal")
    ax.grid(alpha=0.15)
    ax.set_xlabel("XYZ"[axes[0]] + " / mm")
    ax.set_ylabel("XYZ"[axes[1]] + " / mm")


fig, axes = plt.subplots(3, 1, figsize=(12, 8), layout="constrained")
triangles = []
for p in models["folded"]["parts"]:
    if p["role"] == "region":
        continue
    vertices, faces = p["shape"].tessellate(0.08, 0.2)
    vertices = np.array([v.toTuple() for v in vertices])
    for face in vertices[np.array(faces)]:
        triangles.append((face[:, 2].mean(), face[:, :2], color(p)))
triangles.sort(key=lambda t: t[0])
axes[0].add_collection(
    PolyCollection(
        [t[1] for t in triangles],
        facecolors=[t[2] for t in triangles],
        edgecolors="none",
    )
)
axes[0].autoscale()
axes[0].set_aspect("equal")
axes[0].set_title("Folded / front XY projection of CAD solids")
axes[0].set_ylabel("Y / mm")
section(axes[1], models["folded"], 1, 0, (0, 2))
axes[1].set_title("Folded / side XZ section at Y=0")
axes[1].set_ylim(-7, 10)
section(axes[2], models["folded"], 0, 0, (1, 2))
axes[2].set_title(
    "Folded / exact end section at X=0: blue upper / green lower / amber nominal seal"
)
fig.suptitle(
    "VIRTUAL VALUES / exact CAD sections, nominal films; no thermal or plastic prediction"
)
fig.savefig(OUT / "cad-front-side-section.png", dpi=160)
plt.close(fig)

fig, axes = plt.subplots(2, 2, figsize=(12, 7), layout="constrained")
for ax, stage in zip(axes[0], ["trimmed", "folded"]):
    section(ax, models[stage], 0, 0, (1, 2))
    ax.set_xlim(36, 54)
    ax.set_ylim(-5, 9)
    ax.set_title(stage + " / long-edge material and seal section")
section(axes[1, 0], models["loaded"], 1, -0.5, (0, 2))
axes[1, 0].set_xlim(-163, -143)
axes[1, 0].set_ylim(-1.5, 2)
axes[1, 0].set_title("Lead passage / Y=-0.5: nominal interference remains visible")
changed = copy.deepcopy(P)
changed["pouchProcess"]["sheets"]["upper"]["floorR"] += 0.4
before = build(P, "pouch_formed")
after = build(changed, "pouch_formed")
for model, col in [(before, "#176d8f"), (after, "#c34b3c")]:
    item = next(p for p in model["parts"] if p["id"] == "pouch.upper.pocket")
    item = {**item, "id": "R-compare", "color": col}
    section(axes[1, 1], {"parts": [item]}, 0, 0, (1, 2))
axes[1, 1].set_xlim(36, 40)
axes[1, 1].set_ylim(0, 5)
axes[1, 1].set_title("Floor R 1.2 blue / 1.6 red; unchanged envelope")
fig.suptitle("Exact BRep cut curves / virtual dimensions in mm")
fig.savefig(OUT / "cad-section-details.png", dpi=160)
plt.close(fig)
print("Wrote", OUT / "cad-front-side-section.png", OUT / "cad-section-details.png")
