import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { drawThumbnail } from "../overview/thumbnail.js";

const v = (p) => new T.Vector3(...p);
const cameraDirection = new T.Vector3(0.59, -1, 0.46).normalize();
const neutral = "#edf2f3";

export function thumbnail(canvas, parts) {
  if (!parts.length) return;
  const right = new T.Vector3(0, 0, 1).cross(cameraDirection).normalize();
  const up = cameraDirection.clone().cross(right);
  const box = new T.Box3();
  const projected = parts.map((part) => {
    const positions = [];
    for (let i = 0; i < part.mesh.positions.length; i += 3) {
      const p = new T.Vector3().fromArray(part.mesh.positions, i);
      const point = new T.Vector3(
        right.dot(p),
        up.dot(p),
        cameraDirection.dot(p),
      );
      box.expandByPoint(point);
      positions.push(...point.toArray());
    }
    return { ...part, mesh: { ...part.mesh, positions } };
  });
  const size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3());
  drawThumbnail(
    canvas,
    { parts: projected },
    {
      centerX: center.x,
      centerY: center.y,
      width:
        Math.max(size.x, (size.y * canvas.width) / canvas.height, 3) * 1.17,
      tilt: 0,
    },
  );
}

function dispose(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  group.clear();
}

export class PrismView {
  constructor(host, onPick) {
    this.host = host;
    this.scene = new T.Scene();
    this.scene.background = new T.Color(neutral);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x9aaeb3, 2.4));
    const light = new T.DirectionalLight(0xffffff, 2);
    light.position.set(100, -150, 250);
    this.scene.add(light);
    this.solids = new T.Group();
    this.guides = new T.Group();
    this.scene.add(this.solids, this.guides);
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    host.append(this.renderer.domElement);
    this.camera = new T.OrthographicCamera(-120, 120, 100, -100, 0.1, 10000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(cameraDirection).multiplyScalar(450);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.paint());
    new ResizeObserver(() => this.resize()).observe(host);
    const canvas = this.renderer.domElement;
    let down;
    canvas.addEventListener("pointerdown", (e) => {
      down = [e.clientX, e.clientY];
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4)
        return;
      const rect = canvas.getBoundingClientRect(),
        ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          (2 * (e.clientX - rect.left)) / rect.width - 1,
          1 - (2 * (e.clientY - rect.top)) / rect.height,
        ),
        this.camera,
      );
      const hit = ray
        .intersectObjects(this.solids.children, false)
        .find(
          (h) =>
            h.object.isMesh &&
            (!this.plane || this.plane.distanceToPoint(h.point) >= 0),
        );
      if (hit) onPick(hit.object.userData.id);
    });
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.left = (-this.span * w) / h / 2;
    this.camera.right = -this.camera.left;
    this.camera.top = this.span / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.paint();
  }
  paint() {
    this.renderer.render(this.scene, this.camera);
  }
  fitWitness(measure) {
    const bounds = new T.Box3().setFromPoints(
      [measure.start, measure.end, ...measure.dimensionLine].map(v),
    );
    bounds.expandByScalar(6);
    this.fit("witness", bounds);
  }
  fit(preset = "standard", bounds) {
    const detail = ["joint", "foil", "underside"].includes(preset);
    const targets = detail
      ? this.solids.children.filter(
          (o) =>
            o.isMesh &&
            (preset === "underside"
              ? ["collector"]
              : preset === "foil"
                ? ["foil-root", "foil-gather", "tab"]
                : ["foil-root", "foil-gather", "tab", "collector", "joint"]
            ).includes(o.userData.id),
        )
      : this.solids.children;
    const b = bounds ?? new T.Box3();
    if (!bounds) for (const obj of targets) b.expandByObject(obj);
    if (b.isEmpty()) return;
    if (preset === "seam") {
      const corner = b.max.clone();
      corner.y = b.min.y;
      const radius = Math.max(4, (b.max.y - b.min.y) * 0.5);
      b.set(
        corner.clone().add(v([-radius, -radius, -radius])),
        corner.clone().add(v([radius, radius, radius])),
      );
    }
    const direction = (
      {
        witness: v([0.9, -0.55, 0.42]),
        top: v([0.17, -0.48, 1]),
        bottom: v([0.38, -0.55, -1]),
        underside: v([0.7, -0.8, -0.75]),
        joint: v([0.92, -0.55, 0.2]),
        foil: v([0.8, -0.65, 0.72]),
        opening: v([0.45, -0.74, 1.05]),
      }[preset] ?? cameraDirection
    )
      .clone()
      .normalize();
    const right = v([0, 0, 1]).cross(direction).normalize(),
      up = direction.clone().cross(right);
    const size = b.getSize(new T.Vector3()),
      center = b.getCenter(new T.Vector3());
    const projected = (axis) =>
      Math.abs(axis.x) * size.x +
      Math.abs(axis.y) * size.y +
      Math.abs(axis.z) * size.z;
    this.span =
      Math.max(
        6,
        projected(up),
        projected(right) /
          Math.max(0.3, this.host.clientWidth / (this.host.clientHeight || 1)),
      ) * (detail ? 1.65 : 1.18);
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .addScaledVector(direction, Math.max(400, this.span * 2));
    this.camera.zoom = 1;
    this.controls.update();
    this.resize();
  }
  show(
    model,
    parts,
    { selected, axis, measure, fit, offsets = {}, muted = [] },
  ) {
    dispose(this.solids);
    dispose(this.guides);
    const normal = { x: [-1, 0, 0], y: [0, 1, 0], z: [0, 0, -1] }[axis];
    const point = [model.datums.S[0], model.datums.S[1], model.sectionZ];
    this.plane = normal
      ? new T.Plane().setFromNormalAndCoplanarPoint(v(normal), v(point))
      : null;
    const clippingPlanes = this.plane ? [this.plane] : [];
    for (const part of parts) {
      const geom = new T.BufferGeometry();
      geom.setAttribute(
        "position",
        new T.Float32BufferAttribute(part.mesh.positions, 3),
      );
      geom.setIndex(part.mesh.indices);
      geom.computeVertexNormals();
      const material = new T.MeshStandardMaterial({
        color: part.id === selected ? "#eba84c" : part.color,
        metalness: 0.12,
        roughness: 0.74,
        side: T.DoubleSide,
        clippingPlanes,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      if (part.role === "region") {
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
      }
      const mesh = new T.Mesh(geom, material);
      mesh.userData.id = part.id;
      if (muted.includes(part.id)) {
        material.transparent = true;
        material.opacity = 0.18;
        material.depthWrite = false;
      }
      if (offsets[part.id]) mesh.position.fromArray(offsets[part.id]);
      const outline = new T.LineSegments(
        new T.EdgesGeometry(geom, 20),
        new T.LineBasicMaterial({
          color:
            part.id === "weld"
              ? "#c88313"
              : part.id === selected
                ? "#975100"
                : "#475d65",
          clippingPlanes,
        }),
      );
      outline.position.copy(mesh.position);
      this.solids.add(mesh, outline);
    }
    if (parts.some((p) => p.id === "weld") && !axis) {
      this.line(
        model.features.W02.path,
        selected === "weld" ? "#eb7d10" : "#b88024",
        false,
      );
    }
    if (axis && model.sections[axis]) {
      for (const part of parts)
        for (const [a, b] of model.sections[axis][part.id] || [])
          this.line(
            [a, b],
            part.id === selected ? "#d77212" : "#253d48",
            false,
          );
    }
    if (measure) this.guide(measure);
    if (fit || !this.span) this.fit(typeof fit === "string" ? fit : "standard");
    else this.paint();
  }
  line(points, color, overlay = true) {
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints(points.map(v)),
      new T.LineBasicMaterial({ color, depthTest: !overlay }),
    );
    line.renderOrder = overlay ? 5 : 1;
    this.guides.add(line);
  }
  guide(m) {
    const color = m.value < 0 ? "#c83428" : "#007f78";
    const endpoints = m.dimensionLine || [m.start, m.end];
    this.line(m.path || endpoints, color);
    if (m.dimensionLine) {
      this.line([m.start, endpoints[0]], color);
      this.line([m.end, endpoints[1]], color);
    }
    const a = v(m.start),
      b = v(m.end),
      delta = v(endpoints[1]).sub(v(endpoints[0]));
    const radius = Math.min(1.2, Math.max(0.18, delta.length() / 10));
    for (const p of [a, b]) {
      const marker = new T.Mesh(
        new T.SphereGeometry(radius, 12, 8),
        new T.MeshBasicMaterial({ color, depthTest: false }),
      );
      marker.renderOrder = 6;
      marker.position.copy(p);
      this.guides.add(marker);
      if (m.dimensionLine) continue;
      // Two square outlines lie in the datum/end planes, normal to the measurement.
      const axes = [0, 1, 2].filter((i) => i !== m.axis),
        points = [];
      for (const [i, j] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ]) {
        const corner = p.toArray();
        corner[axes[0]] += i * 2;
        corner[axes[1]] += j * 2;
        points.push(corner);
      }
      this.line(points, color);
    }
    if (delta.length() > 1e-6 && !m.path) {
      const length = delta.length(),
        head = Math.min(3, length * 0.35);
      const arrow = new T.ArrowHelper(
        delta.normalize(),
        v(endpoints[0]),
        length,
        color,
        head,
        head * 0.6,
      );
      arrow.traverse((o) => {
        if (o.material) {
          o.material.depthTest = false;
          o.renderOrder = 7;
        }
      });
      this.guides.add(arrow);
    }
  }
}

// Plot the intersection edges returned by OpenCascade. The detail viewport is
// centered on the selected pair of faces and uses equal horizontal/vertical scale.
export function sectionDrawing(canvas, model, parts, axis, m) {
  const ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  ctx.fillStyle = "#f8fafb";
  ctx.fillRect(0, 0, w, h);
  const axes = { x: [1, 2], y: [0, 2], z: [0, 1] }[axis];
  const paths = parts.flatMap((p) =>
    (model.sections[axis]?.[p.id] || []).map((edge) => ({ p, edge })),
  );
  if (!paths.length) return;
  const zoom = m && ["A02", "A03", "A04", "A05", "A06"].includes(m.id);
  const points = zoom ? [m.start, m.end] : paths.flatMap((s) => s.edge);
  const extent = axes.map((i) => [
    Math.min(...points.map((p) => p[i])),
    Math.max(...points.map((p) => p[i])),
  ]);
  const center = extent.map(([a, b]) => (a + b) / 2);
  const scale = Math.min(
    (w - 56) / Math.max(zoom ? 3 : 1, extent[0][1] - extent[0][0]),
    (h - 26) / Math.max(zoom ? 1.5 : 1, extent[1][1] - extent[1][0]),
  );
  const project = (p) => [
    w / 2 + (p[axes[0]] - center[0]) * scale,
    h / 2 - (p[axes[1]] - center[1]) * scale,
  ];
  function line(a, b, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...project(a));
    ctx.lineTo(...project(b));
    ctx.stroke();
  }
  for (const {
    p,
    edge: [a, b],
  } of paths)
    line(
      a,
      b,
      p.id === "can" ? "#465f75" : p.id === "insulation" ? "#008675" : p.color,
      2.3,
    );
  if (m) {
    const color = m.value < 0 ? "#c43128" : "#075d6d";
    if (m.dimensionLine) {
      const [a, b] = m.dimensionLine;
      line(m.start, a, color, 1);
      line(m.end, b, color, 1);
      line(a, b, color, 3);
    } else {
      line(m.start, m.end, color, 3);
    }
    for (const p of [m.start, m.end]) {
      ctx.beginPath();
      ctx.arc(...project(p), 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (zoom) {
      const names = ["A02", "A04", "A06"].includes(m.id)
        ? ["캔 내면", "절연 외면"]
        : ["절연 외면", "캔 내면"];
      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      for (const [i, p] of [m.start, m.end].entries()) {
        const [x, y] = project(p);
        ctx.fillStyle = color;
        ctx.fillText(
          names[i],
          x,
          Math.max(22, Math.min(h - 8, y + (i ? 33 : -18))),
        );
      }
    }
  }
}
