// Persistent surface points are coordinates on named analytic patches, never mesh indices.
export function pointOnPatch(feature, u, v) {
  const p = feature?.patch;
  if (
    !p ||
    ![u, v].every(Number.isFinite) ||
    Math.abs(u) > 1 + 1e-7 ||
    Math.abs(v) > 1 + 1e-7
  )
    return null;
  if (p.cornerR) {
    const x = Math.abs(u) * p.halfSize[0],
      y = Math.abs(v) * p.halfSize[1],
      dx = Math.max(0, x - p.halfSize[0] + p.cornerR),
      dy = Math.max(0, y - p.halfSize[1] + p.cornerR);
    if (Math.hypot(dx, dy) > p.cornerR + 1e-7) return null;
  }
  return feature.point.map((x, i) => x + u * p.u[i] + v * p.v[i]);
}
export function locateOnPatch(feature, point) {
  const p = feature.patch;
  if (!p) return null;
  const d = point.map((x, i) => x - feature.point[i]),
    dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
    u = dot(d, p.u) / dot(p.u, p.u),
    v = dot(d, p.v) / dot(p.v, p.v),
    position = pointOnPatch(feature, u, v);
  if (!position || Math.hypot(...position.map((x, i) => x - point[i])) > 0.025)
    return null;
  return { u, v };
}
export function anchorPoint(host, a) {
  if (a.mode !== "fixed_mm") return pointOnPatch(host, a.u, a.v);
  if (!host?.patch) return null;
  const hu = Math.hypot(...host.patch.u),
    hv = Math.hypot(...host.patch.v);
  const bases = {
      origin: [0, 0, 1, 1],
      u_minus: [-1, 0, 1, 1],
      u_plus: [1, 0, -1, 1],
      v_minus: [0, -1, 1, 1],
      v_plus: [0, 1, 1, -1],
    },
    base = bases[a.reference];
  if (!base || ![a.distanceU, a.distanceV].every(Number.isFinite)) return null;
  return pointOnPatch(
    host,
    base[0] + (base[2] * a.distanceU) / hu,
    base[1] + (base[3] * a.distanceV) / hv,
  );
}
export function withAnchors(data, anchors = []) {
  const features = Object.fromEntries(Object.entries(data.features).filter(([id,f])=>!id.startsWith("anchor.")&&!f.anchor)),
    diagnostics = data.diagnostics.filter(d=>!d.anchorId);
  for (const a of anchors) {
    const host = features[a.baseFeatureId],
      point = anchorPoint(host, a);
    if (point)
      features[a.id] = {
        partId: host.partId,
        name: a.name,
        kind: "point",
        point,
        anchor: true,
      };
    else {
      const code = host?.available === false ? host.reasonCode || "stage_absent" : !host ? "reference_lost" : "anchor_outside";
      const reason = code === "stage_absent" ? "해당 공정에 없음" : code === "reference_lost" ? "부착 기준 참조 소실" : "측정점이 평탄 패치 범위를 벗어남";
      features[a.id] = {partId:host?.partId,name:a.name,kind:"invalid",available:false,reasonCode:code,reason};
      diagnostics.push({anchorId:a.id,level:code === "stage_absent"?"info":"error",message:a.name+": "+reason+" · 자동 재연결하지 않음"});
    }
  }
  return { ...data, features, diagnostics };
}
