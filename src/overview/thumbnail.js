// One fixed orthographic projection of the same tessellation used by the detail viewer.
export const overviewFrame = { centerX: 0, centerY: 17, width: 366, tilt: 0.24 };
const colors = {
  stack: "#637883",
  "pouch.upper.flange": "#a9c6c4",
  "pouch.lower.flange": "#91b4af",
  "pouch.upper.pocket": "#c0d2d7",
  "pouch.lower.pocket": "#c1d5db",
};

export function drawThumbnail(canvas, model, frame = overviewFrame) {
  const ctx = canvas.getContext("2d");
  const scale = canvas.width / frame.width;
  const tilt = frame.tilt;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const project = ([x, y, z]) => [
    canvas.width / 2 + (x - frame.centerX) * scale,
    canvas.height / 2 - ((y - frame.centerY) * c + z * s) * scale,
    z * c - y * s,
  ];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#edf2f3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const triangles = [];
  for (const part of model.parts) {
    if (part.id.startsWith("tool.") || part.id.includes(".contact.")) continue;
    const { positions, indices } = part.mesh;
    const points = [];
    for (let i = 0; i < positions.length; i += 3)
      points.push(project(positions.slice(i, i + 3)));
    const color = colors[part.id] || part.color;
    for (let i = 0; i < indices.length; i += 3) {
      const a = points[indices[i]], b = points[indices[i + 1]], d = points[indices[i + 2]];
      triangles.push({ a, b, d, depth: a[2] + b[2] + d[2], color });
    }
  }
  triangles.sort((a, b) => a.depth - b.depth);
  for (const { a, b, d, color } of triangles) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.fill();
    ctx.lineWidth = .55;
    ctx.stroke();
  }
  // The cut guide is a registered CAD reference; the remaining material is drawn above from its mesh.
  if (model.stage === "final_sealed") {
    const line = model.features["phase1.cut.line"]?.segment;
    if (line) {
      const [a, b] = line.map(project);
      ctx.beginPath();
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#425665";
      ctx.lineWidth = 1.2;
      ctx.moveTo(a[0], a[1] - 1);
      ctx.lineTo(b[0], b[1] - 1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
