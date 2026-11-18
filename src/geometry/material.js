// Same circular/straight material map as cad/pouch_material.py (mm, radians).
export function materialPoint(m, point) {
  const [x, y, z] = point,
    b = m.bounds;
  if (
    b &&
    (x < b.xMinus - 1e-7 ||
      x > b.xPlus + 1e-7 ||
      y < b.yMinus - 1e-7 ||
      y > b.yPlus + 1e-7)
  )
    return null;
  const p = m.profiles?.[y >= 0 ? "yPlus" : "yMinus"];
  if (!p) return [...point];
  const s = Math.abs(y),
    seg = p.pieces.find((t) => s >= t[0] - 1e-7 && s <= t[1] + 1e-7);
  if (!seg) return null;
  const [a, , [y0, z0], theta, k] = seg,
    u = s - a,
    angle = theta + k * u;
  const yy = k
    ? y0 + (Math.sin(angle) - Math.sin(theta)) / k
    : y0 + u * Math.cos(theta);
  const zz = k
    ? z0 + (-Math.cos(angle) + Math.cos(theta)) / k
    : z0 + u * Math.sin(theta);
  const off = z - p.neutral;
  return [
    x,
    (y >= 0 ? 1 : -1) * (yy - off * Math.sin(angle)),
    zz + off * Math.cos(angle),
  ];
}
export function materialCoordinates(p, point) {
  const m = p.material,
    [ox, oy, oz] = m.origin,
    hu = Math.hypot(...p.u),
    hv = Math.hypot(...p.v),
    sign = p.v[1] >= 0 ? 1 : -1;
  const u = (point[0] - ox) / p.u[0];
  if (Math.abs(u) > 1 + 1e-7) return null;
  // Find the nearest point on each circular/straight interval, avoiding an
  // ambiguous inverse at multiple folds. The material ID selects this patch.
  const prof = m.profiles?.[oy >= 0 ? "yPlus" : "yMinus"];
  const candidates = [];
  const score = (v) => {
    const world = materialPoint(m, [point[0], oy + v * p.v[1], oz]);
    return world ? Math.hypot(...world.map((n, i) => n - point[i])) : Infinity;
  };
  const cuts = [-1, 1];
  if (prof)
    for (const piece of prof.pieces)
      for (const s of piece.slice(0, 2)) {
        const v = ((oy >= 0 ? 1 : -1) * s - oy) / p.v[1];
        if (v > -1 && v < 1) cuts.push(v);
      }
  cuts.sort((a, b) => a - b);
  for (let i = 1; i < cuts.length; i++) {
    let a = cuts[i - 1],
      b = cuts[i];
    for (let j = 0; j < 50; j++) {
      const l = a + (b - a) / 3,
        r = b - (b - a) / 3;
      if (score(l) < score(r)) b = r;
      else a = l;
    }
    for (const v of [cuts[i - 1], (a + b) / 2, cuts[i]])
      candidates.push({ u, v, error: score(v) });
  }
  const best = candidates.sort((a, b) => a.error - b.error)[0];
  return best?.error <= 0.025 ? { u: best.u, v: best.v } : null;
}
export function rigidPoint(v, p, translate = true) {
  let [x, y, z] = v;
  for (const [i, key] of ["rx", "ry", "rz"].entries()) {
    const a = (p[key] * Math.PI) / 180,
      c = Math.cos(a),
      s = Math.sin(a);
    if (i === 0) [y, z] = [y * c - z * s, y * s + z * c];
    if (i === 1) [x, z] = [x * c + z * s, -x * s + z * c];
    if (i === 2) [x, y] = [x * c - y * s, x * s + y * c];
  }
  return translate ? [x + p.x, y + p.y, z + p.z] : [x, y, z];
}
