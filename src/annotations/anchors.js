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
  const features = { ...data.features },
    diagnostics = [...data.diagnostics];
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
    else if (host?.available === false) {
      features[a.id] = {
        partId: host.partId,
        name: a.name,
        kind: "unavailable",
        available: false,
      };
      diagnostics.push({
        level: "info",
        message: a.name + ": 해당 상태에서 사용 불가 · 참조 ID 보존",
      });
    } else
      diagnostics.push({
        level: "error",
        message: a.name + ": 부착 기준 소실 또는 면 범위 이탈 · 재선택 필요",
      });
  }
  return { ...data, features, diagnostics };
}
