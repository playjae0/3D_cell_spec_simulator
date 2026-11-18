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
  const width = canvas.width, height = canvas.height;
  const image = ctx.createImageData(width, height);
  const pixels = image.data;
  const depth = new Float64Array(width * height).fill(-Infinity);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels.set([237, 242, 243, 255], i);
  }
  // Per-pixel depth is needed for long triangles on different sheets and layers.
  // Sorting whole triangles can make the internal stack show through a pocket.
  const wedge = (ax, ay, bx, by) => ax * by - ay * bx;
  for (const part of model.parts) {
    if (part.id.startsWith("tool.") || part.id.includes(".contact.")) continue;
    const { positions, indices } = part.mesh;
    const points = [];
    for (let i = 0; i < positions.length; i += 3)
      points.push(project(positions.slice(i, i + 3)));
    const hex = colors[part.id] || part.color;
    const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]];
      const [ux, uy] = [b[0] - a[0], b[1] - a[1]];
      const [vx, vy] = [c[0] - a[0], c[1] - a[1]];
      const area = wedge(ux, uy, vx, vy);
      if (Math.abs(area) < 1e-7) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x + .5 - a[0], dy = y + .5 - a[1];
          const u = wedge(dx, dy, vx, vy) / area;
          const v = wedge(ux, uy, dx, dy) / area;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]);
          const index = y * width + x;
          if (z < depth[index]) continue;
          depth[index] = z;
          pixels.set(rgb, index * 4);
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
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
