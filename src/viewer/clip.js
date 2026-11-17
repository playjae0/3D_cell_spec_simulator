// Clip display triangles only. CAD shape and semantic measurement references never change.
export function clipMesh(mesh, axis, position) {
  if (axis === "none") return { mesh, contours: [] };
  const k = ["x", "y", "z"].indexOf(axis),
    positions = [],
    indices = [],
    contours = [];
  const p = mesh.positions,
    idx = mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const poly = idx.slice(i, i + 3).map((j) => p.slice(j * 3, j * 3 + 3));
    const out = [],
      cuts = [];
    for (let j = 0; j < 3; j++) {
      const a = poly[j],
        b = poly[(j + 1) % 3],
        da = a[k] - position,
        db = b[k] - position;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db),
          q = a.map((v, n) => v + t * (b[n] - v));
        out.push(q);
        cuts.push(q);
      }
    }
    for (const point of poly)
      if (
        Math.abs(point[k] - position) < 1e-9 &&
        !cuts.some((c) => Math.hypot(...c.map((v, n) => v - point[n])) < 1e-9)
      )
        cuts.push(point);
    if (cuts.length === 2) contours.push(cuts);
    for (let j = 1; j < out.length - 1; j++) {
      const n = positions.length / 3;
      positions.push(...out[0], ...out[j], ...out[j + 1]);
      indices.push(n, n + 1, n + 2);
    }
  }
  return { mesh: { positions, indices }, contours };
}
