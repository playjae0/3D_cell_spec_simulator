"""Print the CAD evidence numbers for the representative Phase 1 design."""
import copy
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cad"))

from model import build


def profile(model, side):
    seal = model["toolingResults"]["seals"][side]
    return {
        "L": seal["tabDimensions"]["center"]["length"],
        "R": seal["tabDimensions"]["radius"]["radius"],
        "widths": seal["profileWidths"],
        "area": seal["productArea"],
    }


def describe(source, stage):
    model = build(source, stage)
    results = model["toolingResults"]
    ids = {part["id"]: part for part in model["parts"]}
    volume = {side: ids[side+".lead"]["shape"].Volume()
              for side in ("positive", "negative")}
    return {
        "positive": profile(model, "positive"),
        "negative": profile(model, "negative"),
        "packaging": results["packaging"],
        "gasSealPresent": "seal.gas" in ids,
        "leadVolume": volume,
    }


def main():
    source = json.loads((ROOT / "examples/pouch-phase1.json").read_text())["product"]
    evidence = {}
    for label, key, value in [
        ("baseline", None, None),
        ("L42", "centerLength", 42),
        ("R5", "transitionR", 5),
        ("cut52", "cutY", 52),
    ]:
        product = copy.deepcopy(source)
        q = product["processTooling"]
        if key == "cutY":
            q["packaging"][key] = value
        elif key:
            for half in ("upper", "lower"):
                q["sealBars"]["positive_"+half]["tabProfile"][key] = value
        stages = {
            "baseline": ["tab_sealed", "final_sealed", "package_trimmed", "package_folded"],
            "cut52": ["final_sealed", "package_trimmed", "package_folded"],
        }.get(label, ["tab_sealed", "package_folded"])
        evidence[label] = {stage: describe(product, stage) for stage in stages}
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
