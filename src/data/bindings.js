// One table joins editable DOFs, semantic references, highlighted geometry and docs.
// No triangle index is ever a persistent reference.
import { dictionaries } from "./fields.js";
export const stageOrder = [
  "stacked",
  "gathered",
  "preweld",
  "welded",
  "assembly",
  "packaged",
  "finished",
];
export const get = (o, path) => path.split(".").reduce((a, k) => a?.[k], o);
export function readField(p, path) {
  if (path.endsWith(".tab.gatheredLength")) {
    const t = p[path.split(".")[0]].tab;
    return [t.rootLength, t.gatherDistance, t.axialShortening].every(
      Number.isFinite,
    )
      ? t.rootLength - t.gatherDistance - t.axialShortening
      : null;
  }
  return get(p, path);
}
export function writeField(p, path, value) {
  if (path.endsWith(".tab.gatheredLength")) {
    const t = p[path.split(".")[0]].tab;
    t.axialShortening = t.rootLength - t.gatherDistance - value;
    return;
  }
  const ks = path.split("."),
    key = ks.pop();
  get(p, ks.join("."))[key] = value;
}
const rootKeys = ["foilWidth", "rootLength", "rootSpread", "rootY", "rootZ"];
export function fieldsFor(p, stage) {
  const result = [];
  for (const side of ["stack", "positive", "negative", "pouch"]) {
    if (side === "stack" || side === "pouch") {
      for (const f of dictionaries[side])
        result.push(descriptor(p, stage, side + "." + f.key, f));
      continue;
    }
    for (const section of [
      "tab",
      "prewelds",
      "preweldLead",
      "lead",
      "joints",
      "tapes",
      "leadFilm",
    ]) {
      const items = Array.isArray(p[side][section])
        ? p[side][section].map((x, i) => [x, i])
        : [[p[side][section], null]];
      for (const [item, i] of items)
        for (const f of dictionaries[section])
          result.push(
            descriptor(
              p,
              stage,
              side + "." + section + (i === null ? "" : "." + i) + "." + f.key,
              f,
              item,
            ),
          );
    }
  }
  return result;
}
function descriptor(p, stage, path, f, item) {
  const [side, section] = path.split("."),
    k = f.key,
    rank = stageOrder.indexOf(stage);
  let min = 0,
    partId = side,
    upstream = "조립체 A/B/C",
    effect = "연결된 포일·리드·영역·테이프·수납 검증";
  if (side === "pouch") {
    min = ["foldR", "foldAngle"].includes(k) ? 6 : 5;
    partId =
      "pouch." +
      (k.startsWith("lower") ? "lower" : "upper") +
      "." +
      (k.startsWith("seal")
        ? "seal"
        : k.startsWith("trim") || k.startsWith("fold")
          ? "margin"
          : "pocket");
    upstream = "성형 경계 / A";
    effect = "파우치·실링·외곽·접힘";
  } else if (side !== "stack") {
    min =
      section === "tab"
        ? rootKeys.includes(k)
          ? 0
          : 1
        : ["prewelds", "preweldLead"].includes(section)
          ? 2
          : section === "lead" || section === "joints"
            ? 3
            : 4;
    partId =
      side +
      "." +
      ({
        preweldLead: "lead",
        prewelds: "preweld",
        joints: "joint",
        tapes: "tape",
      }[section] || section) +
      (item?.id ? "." + item.id : "");
    upstream =
      section === "tab"
        ? "조립체 끝면 / A / B"
        : section === "lead" || section === "preweldLead"
          ? "집속 완료 단면·집속 중심"
          : section === "joints"
            ? "탭–리드 실제 교집합"
            : section === "prewelds"
              ? "집속 포일 평탄부"
              : "탭 부착 면 / 집속 완료 단면";
    effect =
      section === "tab"
        ? "후속 집속·리드·용접·테이프"
        : section.includes("Lead") || section === "lead"
          ? "해당 단계 리드·겹침·용접"
          : section === "joints" || section === "prewelds"
            ? "해당 관리 영역·연결 주석"
            : "해당 테이프/필름·연결 주석";
  }
  const max = section === "preweldLead" ? 2 : Infinity;
  return {
    ...f,
    path,
    side,
    section: side === "stack" || side === "pouch" ? side : section,
    partId,
    min,
    max,
    available: rank >= min && rank <= max,
    value: readField(p, path),
    upstream,
    effect,
    fixed: f.basis,
    itemId: item?.id,
  };
}
export function bindingFor(p, stage, path) {
  return fieldsFor(p, stage).find((x) => x.path === path);
}
export function references(b, p, stage) {
  const [side, section] = b.path.split("."),
    k = b.key,
    pre = side + ".",
    t = p[side]?.tab;
  let refs = null,
    mode = "distance",
    a,
    bp,
    arc;
  const pair = (aa, bb, m) => {
    refs = [aa, bb];
    mode = m;
  };
  if (side === "stack") {
    if (k === "cornerR") {
      refs = ["stack.cornerR", null];
      mode = "radius";
    } else
      pair(
        "stack." + k + ".minus",
        "stack." + k + ".plus",
        { length: "x", width: "y", thickness: "thickness" }[k],
      );
  } else if (side === "pouch") {
    if (k === "openingLength" || k === "openingWidth") {
      const ax = k === "openingLength" ? "x" : "y";
      pair(
        "pouch.forming." + ax + ".minus",
        "pouch.forming." + ax + ".plus",
        ax,
      );
    } else if (k === "planR") {
      refs = ["pouch.upper.planR", null];
      mode = "radius";
    } else if (/(FloorR|RimR)$/.test(k)) {
      refs = [
        "pouch." +
          (k.startsWith("lower") ? "lower" : "upper") +
          "." +
          (k.endsWith("FloorR") ? "floorR" : "rimR"),
        null,
      ];
      mode = "radius";
    } else if (k.endsWith("Depth"))
      pair(
        "datum.origin",
        "pouch." + (k.startsWith("lower") ? "lower" : "upper") + ".depth",
        "z",
      );
    else if (k === "filmThickness")
      pair("pouch.upper.innerFloor", "pouch.upper.outerFloor", "thickness");
    else if (k === "sealGap")
      pair("pouch.forming.y.plus", "pouch.sealInner.y.plus", "y");
    else if (k === "sealWidth")
      pair("pouch.sealInner.y.plus", "pouch.sealOuter.y.plus", "y");
    else if (
      k === "trimMargin" &&
      stage === "packaged" &&
      p.pouch.packagingExtraYPlus === 0
    )
      pair("pouch.sealOuter.y.plus", "pouch.trim.y.plus", "y");
  } else if (section === "tab") {
    const m = {
      foilWidth: ["rootWidthMinus", "rootWidthPlus", "y"],
      rootSpread: ["rootBottom", "rootTop", "z"],
      rootY: ["rootYBase", "root", "y"],
      rootZ: ["rootZBase", "root", "z"],
      rootLength: ["root", "stockEnd", "x"],
      gatherDistance: ["root", "gather", "x"],
      gatherY: ["gatherYBase", "gather", "y"],
      gatherZ: ["gatherZBase", "gather", "z"],
      gatheredLength: ["gather", "tipCenter", "x"],
      thickness: ["bottom", "top", "thickness"],
    };
    if (m[k]) pair(pre + "tab." + m[k][0], pre + "tab." + m[k][1], m[k][2]);
    if (k === "edgeR") {
      refs = [pre + "tab.edgeR", null];
      mode = "radius";
    }
  } else if (section === "lead" || section === "preweldLead") {
    const m = {
      start: [pre + "tab.gather", pre + "lead.start", "x"],
      length: [pre + "lead.start", pre + "lead.end", "x"],
      width: [pre + "lead.widthMinus", pre + "lead.widthPlus", "y"],
      thickness: [pre + "lead.bottom", pre + "lead.top", "thickness"],
      offsetY: [pre + "lead.yBase", pre + "lead.center", "y"],
    };
    if (m[k]) pair(...m[k]);
  } else if (section === "leadFilm") {
    const id = pre + "leadFilm.";
    const m = {
      start: [pre + "tab.gather", id + "start", "x"],
      length: [id + "start", id + "end", "x"],
      overhang: [id + "leadSide", id + "outerSide", "y"],
      thickness: [id + "innerFace", id + "outerFace", "thickness"],
    };
    if (m[k]) pair(...m[k]);
  } else if (["joints", "prewelds", "tapes"].includes(section)) {
    const id = b.partId + ".";
    const m = {
      start: [pre + "tab.gather", id + "start", "x"],
      length: [id + "start", id + "end", "x"],
      width: [id + "widthMinus", id + "widthPlus", "y"],
      offsetY: [id + "yBase", id + "face", "y"],
      thickness: [id + "innerFace", id + "outerFace", "thickness"],
    };
    if (m[k]) pair(...m[k]);
  }
  return refs
    ? { a: { featureId: refs[0] }, b: { featureId: refs[1] }, mode }
    : null;
}
// Predicted endpoints are analytic design guides, never committed CAD geometry.
export function forecast(b, p, stage) {
  const [side, section] = b.path.split("."),
    k = b.key;
  let A,
    B,
    arc,
    mode = "distance",
    value = readField(p, b.path),
    normal = [0, 0, 1];
  const q = p.pouch,
    s = p.stack;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (side === "stack") {
    const ax = { length: 0, width: 1, thickness: 2 }[k];
    if (ax !== undefined) {
      A = [0, 0, 0];
      B = [0, 0, 0];
      A[ax] = -value / 2;
      B[ax] = value / 2;
      mode = ["x", "y", "thickness"][ax];
    } else {
      const c = [s.length / 2 - value, s.width / 2 - value, s.thickness / 2];
      A = c;
      B = [c[0] + value, c[1], c[2]];
      mode = "radius";
      arc = Array.from({ length: 17 }, (_, i) => [
        c[0] + value * Math.cos((i * Math.PI) / 32),
        c[1] + value * Math.sin((i * Math.PI) / 32),
        c[2],
      ]);
    }
  } else if (side === "pouch") {
    const lower = k.startsWith("lower"),
      sign = lower ? -1 : 1,
      d = q[lower ? "lowerDepth" : "upperDepth"],
      rf = q[lower ? "lowerFloorR" : "upperFloorR"],
      rt = q[lower ? "lowerRimR" : "upperRimR"];
    if (k === "openingLength") {
      A = [-q.openingLength / 2, 0, 0];
      B = [q.openingLength / 2, 0, 0];
      mode = "x";
    }
    if (k === "openingWidth") {
      A = [0, -q.openingWidth / 2, 0];
      B = [0, q.openingWidth / 2, 0];
      mode = "y";
    }
    if (k.endsWith("Depth")) {
      A = [0, 0, 0];
      B = [0, 0, sign * d];
      mode = "z";
    }
    if (k === "filmThickness") {
      A = [0, 0, q.upperDepth];
      B = [0, 0, q.upperDepth + value];
      mode = "thickness";
    }
    if (k === "planR") {
      A = [q.openingLength / 2 - value, q.openingWidth / 2 - value, 0];
      B = [A[0] + value, A[1], 0];
      mode = "radius";
      arc = Array.from({ length: 17 }, (_, i) => [
        A[0] + value * Math.cos((i * Math.PI) / 32),
        A[1] + value * Math.sin((i * Math.PI) / 32),
        0,
      ]);
    }
    if (k.endsWith("FloorR") || k.endsWith("RimR")) {
      const floor = k.endsWith("FloorR");
      A = [
        0,
        floor ? q.openingWidth / 2 - rt - rf : q.openingWidth / 2,
        sign * (floor ? d - rf : rt),
      ];
      arc = Array.from({ length: 17 }, (_, i) => {
        const angle = (i * Math.PI) / 32;
        return [
          0,
          A[1] + (floor ? value * Math.sin(angle) : -value * Math.cos(angle)),
          A[2] +
            sign * (floor ? value * Math.cos(angle) : -value * Math.sin(angle)),
        ];
      });
      B = arc[0];
      mode = "radius";
    }
    if (
      [
        "sealGap",
        "sealWidth",
        "trimMargin",
        "packagingExtraYMinus",
        "packagingExtraYPlus",
      ].includes(k)
    ) {
      const offset =
          k === "sealGap"
            ? 0
            : k === "sealWidth"
              ? q.sealGap
              : k === "trimMargin"
                ? q.sealGap + q.sealWidth
                : q.sealGap + q.sealWidth + q.trimMargin,
        sg = k.endsWith("Minus") ? -1 : 1;
      A = [0, sg * (q.openingWidth / 2 + offset), 0];
      B = [0, A[1] + sg * value, 0];
      mode = "y";
    }
    if (k === "foldR" || k === "foldAngle") {
      const y = q.openingWidth / 2 + q.sealGap + q.sealWidth,
        R = q.foldR,
        angle = (q.foldAngle * Math.PI) / 180;
      A = [0, y, R];
      B = [0, y, 0];
      arc = Array.from({ length: 17 }, (_, i) => [
        0,
        y + R * Math.sin((angle * i) / 16),
        R - R * Math.cos((angle * i) / 16),
      ]);
      mode = k === "foldR" ? "radius" : "angle";
    }
  } else {
    const pole = p[side],
      t = pole.tab,
      e = pole.end,
      g = t.gatherDistance,
      L = t.rootLength - g - t.axialShortening,
      w = t.foilWidth,
      z = t.gatherZ,
      gy = t.gatherY;
    const xyz = (x, y = gy, zz = z) => [e * (s.length / 2 + x), y, zz];
    if (section === "tab") {
      const m = {
        foilWidth: [
          xyz(0, t.rootY - w / 2, t.rootZ),
          xyz(0, t.rootY + w / 2, t.rootZ),
          "y",
        ],
        rootSpread: [
          xyz(0, t.rootY, t.rootZ - t.rootSpread / 2),
          xyz(0, t.rootY, t.rootZ + t.rootSpread / 2),
          "z",
        ],
        rootY: [xyz(0, 0, t.rootZ), xyz(0, t.rootY, t.rootZ), "y"],
        rootZ: [xyz(0, t.rootY, 0), xyz(0, t.rootY, t.rootZ), "z"],
        rootLength: [
          xyz(0, t.rootY, t.rootZ),
          xyz(t.rootLength, t.rootY, t.rootZ),
          "x",
        ],
        gatherDistance: [xyz(0, t.rootY, t.rootZ), xyz(g), "x"],
        gatherY: [xyz(g, 0, z), xyz(g), "y"],
        gatherZ: [xyz(g, gy, 0), xyz(g), "z"],
        gatheredLength: [xyz(g), xyz(g + L), "x"],
        thickness: [
          xyz(g + L / 2, gy, z - t.thickness / 2),
          xyz(g + L / 2, gy, z + t.thickness / 2),
          "thickness",
        ],
      };
      if (m[k]) [A, B, mode] = m[k];
      if (k === "edgeR") {
        A = xyz(g, gy + w / 2 - value, z + t.thickness / 2 - value);
        B = [A[0], A[1] + value, A[2]];
        mode = "radius";
        arc = Array.from({ length: 17 }, (_, i) => [
          A[0],
          A[1] + value * Math.cos((i * Math.PI) / 32),
          A[2] + value * Math.sin((i * Math.PI) / 32),
        ]);
      }
    } else if (section === "lead" || section === "preweldLead") {
      const l = pole[section],
        lz =
          z +
          ((l.contactSide === "below" ? -1 : 1) * (t.thickness + l.thickness)) /
            2,
        ly = gy + l.offsetY,
        x = g + l.start,
        top = lz + l.thickness / 2;
      const m = {
        start: [xyz(g), xyz(x, ly, top), "x"],
        length: [xyz(x, ly, top), xyz(x + l.length, ly, top), "x"],
        width: [
          xyz(x + l.length / 2, ly - l.width / 2, top),
          xyz(x + l.length / 2, ly + l.width / 2, top),
          "y",
        ],
        thickness: [
          xyz(x + l.length / 2, ly, lz - l.thickness / 2),
          xyz(x + l.length / 2, ly, top),
          "thickness",
        ],
        offsetY: [
          xyz(x + l.length / 2, gy, lz),
          xyz(x + l.length / 2, ly, lz),
          "y",
        ],
      };
      if (m[k]) [A, B, mode] = m[k];
    } else if (["joints", "prewelds", "tapes", "leadFilm"].includes(section)) {
      const it =
          section === "leadFilm"
            ? pole.leadFilm
            : get(p, b.path.split(".").slice(0, -1).join(".")),
        x = g + it.start,
        y = gy + (it.offsetY || 0),
        face = it.face === "bottom" ? -1 : 1,
        zz = z + (face * t.thickness) / 2;
      let width = it.width;
      if (section === "tapes" && it.path === "top_edges")
        width = w + 2 * it.thickness;
      const m = {
        start: [xyz(g), xyz(x, y, zz), "x"],
        length: [xyz(x, y, zz), xyz(x + it.length, y, zz), "x"],
        width: [
          xyz(x + it.length / 2, y - width / 2, zz),
          xyz(x + it.length / 2, y + width / 2, zz),
          "y",
        ],
        offsetY: [
          xyz(x + it.length / 2, gy, zz),
          xyz(x + it.length / 2, y, zz),
          "y",
        ],
        thickness: [
          xyz(x + it.length / 2, y, zz),
          xyz(x + it.length / 2, y, zz + face * it.thickness),
          "thickness",
        ],
        edgeDrop: [
          xyz(x, y + w / 2, z + t.thickness / 2 - t.edgeR),
          xyz(x, y + w / 2, z + t.thickness / 2 - t.edgeR - it.edgeDrop),
          "z",
        ],
      };
      if (m[k]) [A, B, mode] = m[k];
      if (section === "leadFilm") {
        const l = pole.lead,
          ly = gy + l.offsetY,
          lz =
            z +
            ((l.contactSide === "below" ? -1 : 1) *
              (t.thickness + l.thickness)) /
              2;
        if (k === "overhang") {
          A = xyz(x, ly + l.width / 2, lz);
          B = xyz(x, ly + l.width / 2 + value, lz);
          mode = "y";
        }
        if (k === "thickness") {
          A = xyz(x, ly, lz + l.thickness / 2);
          B = xyz(x, ly, lz + l.thickness / 2 + value);
          mode = "z";
        }
      }
    }
  }
  if (!A || !B || ![...A, ...B].every(Number.isFinite)) return null;
  const features = {
    "@a": {
      partId: b.partId,
      kind:
        mode === "radius" ? "radius" : mode === "thickness" ? "face" : "point",
      point: mode === "radius" ? B : A,
      center: A,
      value,
      normal: [0, 0, -1],
    },
    "@b": {
      partId: b.partId,
      kind: mode === "thickness" ? "face" : "point",
      point: B,
      normal,
    },
  };
  return {
    features,
    arc,
    mode,
    value,
    measurement: {
      name: b.label,
      mode: mode === "angle" ? "distance" : mode,
      a: { featureId: "@a" },
      b: { featureId: "@b" },
      offset: mode === "y" ? 8 : 5,
      offsetAxis:
        mode === "y" ? "x" : mode === "z" || mode === "thickness" ? "y" : "y",
      visible: true,
      stage,
    },
  };
}
export function driversForFeature(id, p, stage) {
  const [side, part, item, ...rest] = id.split("."),
    pre = side + ".";
  if (side === "stack") {
    if (id.includes("cornerR")) return ["stack.cornerR"];
    const dim = ["length", "width", "thickness"].find((k) => id.includes(k));
    return dim
      ? ["stack." + dim]
      : ["stack.length", "stack.width", "stack.thickness"];
  }
  if (side === "pouch") {
    if (id.includes("floorR")) return ["pouch." + part + "FloorR"];
    if (id.includes("rimR")) return ["pouch." + part + "RimR"];
    if (id.includes("planR")) return ["pouch.planR"];
    if (id.includes("seal")) return ["pouch.sealWidth", "pouch.sealGap"];
    if (id.includes("trim") || id.includes("margin"))
      return ["pouch.trimMargin", "pouch.foldAngle", "pouch.foldR"];
    return [
      "pouch.openingLength",
      "pouch.openingWidth",
      "pouch.upperDepth",
      "pouch.lowerDepth",
    ];
  }
  if (!["positive", "negative"].includes(side)) return [];
  if (part === "tab") {
    if (id.includes("edgeR")) return [pre + "tab.edgeR"];
    if (/(rootWidth|gatherWidth)/.test(id)) return [pre + "tab.foilWidth"];
    if (/root(Spread|Top|Bottom)/.test(id)) return [pre + "tab.rootSpread"];
    if (id.includes("stockEnd")) return [pre + "tab.rootLength"];
    if (
      id.includes("edge.length") ||
      id.includes("tipCenter") ||
      id.endsWith(".end")
    )
      return stage === "stacked"
        ? [pre + "tab.rootLength"]
        : [pre + "tab.gatheredLength", pre + "tab.gatherDistance"];
    if (id.endsWith(".top") || id.endsWith(".bottom"))
      return [
        pre + "tab." + (stage === "stacked" ? "rootSpread" : "thickness"),
      ];
    if (id.includes("gather"))
      return ["gatherDistance", "gatherY", "gatherZ"].map(
        (k) => pre + "tab." + k,
      );
    return ["foilWidth", "rootY", "rootZ"].map((k) => pre + "tab." + k);
  }
  const sec =
    part === "lead"
      ? stage === "preweld"
        ? "preweldLead"
        : "lead"
      : {
          preweld: "prewelds",
          joint: "joints",
          tape: "tapes",
          leadFilm: "leadFilm",
        }[part];
  if (!sec) return [];
  const i = Array.isArray(p[side][sec])
    ? p[side][sec].findIndex((x) => x.id === item)
    : null;
  if (i === -1) return [];
  const path = pre + sec + (i === null ? "" : "." + i) + ".";
  if (id.includes("overlapWidth"))
    return [pre + "lead.width", pre + "lead.offsetY", pre + "tab.foilWidth"];
  if (id.includes("overlap"))
    return [pre + "lead.start", pre + "tab.gatheredLength"];
  if (/(width|Width)/.test(id))
    return ["width", "offsetY"].map((k) => path + k);
  if (id.endsWith(".start")) return [path + "start"];
  if (id.endsWith(".end") || id.includes("edge.length"))
    return [path + "length", path + "start"];
  return (
    part === "leadFilm"
      ? ["start", "length", "thickness"]
      : ["start", "length", "width"]
  ).map((k) => path + k);
}
