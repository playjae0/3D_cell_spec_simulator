import { partAppearance, canPickPart } from "./presentation.js";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SoftwareRenderer } from "./software.js";
import { clipMesh } from "./clip.js";
import { locateOnPatch } from "../annotations/anchors.js";
import { ORTHOGRAPHIC_HEIGHT, frameBounds } from "./framing.js";
import { dimensionLayout, worldVector } from "../annotations/measure.js";
const NS = "http://www.w3.org/2000/svg";
const sv = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};
export class Viewer {
  constructor(host, { onSelect, onPick, onAnchor, onCamera, onHover, onEdit }) {
    this.onHover = onHover;
    this.onEdit = onEdit;
    this.selectionMode = "part";
    this.dimensionHits = [];
    this.highlight = null;
    this.hovered = null;
    this.host = host;
    this.onSelect = onSelect;
    this.onPick = onPick;
    this.onCamera = onCamera;
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-180, 180, 110, -110, 0.1, 3000);
    this.camera.position.set(160, -220, 320);
    this.camera.up.set(0, 0, 1);
    try {
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.mode = "WebGL · CAD 메시";
    } catch {
      this.renderer = new SoftwareRenderer();
      this.mode = "CPU CAD 미리보기 · 투명 합성 근사";
    }
    this.host.append(this.renderer.domElement);
    this.overlay = sv("svg", { class: "model-overlay" });
    this.host.append(this.overlay);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => {
      this.draw();
      onCamera?.(this.getCamera());
    });
    this.scene.add(new T.HemisphereLight(0xffffff, 0x71828b, 2));
    const lamp = new T.DirectionalLight(0xffffff, 2.4);
    lamp.position.set(-50, -80, 200);
    this.scene.add(lamp);
    this.model = new T.Group();
    this.scene.add(this.model);
    this.meshes = [];
    this.selected = null;
    this.picking = false;
    this.pickKind = "point";
    this.through = false;
    this.zoomScale = 1;
    this.ray = new T.Raycaster();
    let down,
      dragged = false,
      lastMove = 0;
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => {
      down = [e.clientX, e.clientY];
      dragged = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (
        down &&
        e.buttons &&
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5
      )
        dragged = true;
      if (e.buttons || performance.now() - lastMove < 65) return;
      lastMove = performance.now();
      const hit = this.hit(e),
        part = hit.hits[0]?.object.userData.part;
      const feature = part
        ? this.nearestFeature(hit.pt, part.id, this.selectionMode)
        : null;
      const id = part?.id || null;
      if (id !== this.hovered) {
        this.hovered = id;
        this.applyColors();
        this.draw();
      }
      this.onHover?.(
        part
          ? {
              partId: part.id,
              name: part.name,
              featureId: feature?.id,
              featureName: feature?.f.name,
              kind: feature?.f.kind || "part",
              x: hit.pt[0],
              y: hit.pt[1],
            }
          : null,
      );
    });
    canvas.addEventListener("pointerleave", () => {
      this.hovered = null;
      this.applyColors();
      this.draw();
      this.onHover?.(null);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (
        !down ||
        dragged ||
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5
      ) {
        down = null;
        return;
      }
      down = null;
      const { hits, pt } = this.hit(e);
      if (this.picking) {
        if (this.pickKind === "surface") {
          const hit = hits[0];
          if (hit)
            for (const [id, f] of this.visibleFeatures()) {
              if (f.partId !== hit.object.userData.part.id) continue;
              const uv = locateOnPatch(f, hit.point.toArray());
              if (uv) {
                onAnchor?.({ baseFeatureId: id, ...uv });
                return;
              }
            }
          onAnchor?.(null);
          return;
        }
        const part = hits[0]?.object.userData.part.id || this.selected;
        const near = this.nearestFeature(pt, part, this.pickKind, true);
        if (near && near.distance < 24) onPick(near.id);
        return;
      }
      const part = hits[0]?.object.userData.part;
      if (part) {
        let f = this.nearestFeature(pt, part.id, this.selectionMode);
        if (f && this.selectionMode !== "face" && f.distance > 18) f = null;
        this.select(part.id);
        this.selectedFeature = f?.id || null;
        onSelect(part.id, f?.id);
        this.draw();
      }
    });
    canvas.addEventListener("dblclick", (e) => {
      if (dragged) return;
      e.preventDefault();
      const hit = this.hit(e),
        dim = this.dimensionHits
          .map((x) => ({ ...x, d: segmentDistance(hit.pt, x.a, x.b) }))
          .sort((a, b) => a.d - b.d)[0];
      if (dim && dim.d < 13) {
        this.onEdit?.({
          measurement: dim.measurement,
          x: hit.pt[0],
          y: hit.pt[1],
        });
        return;
      }
      const part = hit.hits[0]?.object.userData.part;
      const f = part ? this.nearestFeature(hit.pt, part.id, "edge") : null;
      if (f && f.distance < 16)
        this.onEdit?.({
          featureId: f.id,
          partId: part.id,
          x: hit.pt[0],
          y: hit.pt[1],
        });
    });
    new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      this.renderer.setSize(w, h);
      const half = ORTHOGRAPHIC_HEIGHT / 2;
      this.camera.left = (-half * w) / h;
      this.camera.right = (half * w) / h;
      this.camera.top = half;
      this.camera.bottom = -half;
      this.camera.updateProjectionMatrix();
      this.overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
      this.draw();
    }).observe(host);
    this.view("iso");
  }
  disposeModel() {
    for (const child of [...this.model.children]) {
      child.geometry?.dispose();
      child.material?.dispose();
      this.model.remove(child);
    }
    this.meshes = [];
  }
  setModel(data, state) {
    this.data = data;
    this.state = state;
    this.disposeModel();
    const hidden = new Set(state.view.hidden);
    for (const part of data.parts) {
      const { mesh, contours } = clipMesh(
        part.mesh,
        state.view.section.axis,
        state.view.section.position,
      );
      const geo = new T.BufferGeometry();
      geo.setAttribute(
        "position",
        new T.Float32BufferAttribute(mesh.positions, 3),
      );
      geo.setIndex(mesh.indices);
      geo.computeVertexNormals();
      const appearance = partAppearance(part, state.view);
      const material = new T.MeshStandardMaterial({
        color: part.color,
        metalness: 0.28,
        roughness: 0.55,
        side: T.DoubleSide,
        ...appearance,
        polygonOffset: part.role === "region",
        polygonOffsetFactor: -1,
      });
      const obj = new T.Mesh(geo, material);
      obj.userData.part = part;
      obj.visible = !hidden.has(part.id);
      this.model.add(obj);
      this.meshes.push(obj);
      if (contours.length && !hidden.has(part.id)) {
        const line = new T.LineSegments(
          new T.BufferGeometry().setFromPoints(
            contours.flat().map((p) => new T.Vector3(...p)),
          ),
          new T.LineBasicMaterial({ color: "#dc6a42" }),
        );
        this.model.add(line);
      }
    }
    for (const path of data.paths) {
      if (hidden.has(path.partId)) continue;
      const k = ["x", "y", "z"].indexOf(state.view.section.axis),
        points = path.points;
      const segments = [];
      for (let i = 1; i < points.length; i++) {
        let a = points[i - 1],
          b = points[i];
        if (k >= 0) {
          const da = a[k] - state.view.section.position,
            db = b[k] - state.view.section.position;
          if (da > 0 && db > 0) continue;
          if (da * db < 0) {
            const v = a.map((x, j) => x + ((b[j] - x) * da) / (da - db));
            if (da > 0) a = v;
            else b = v;
          }
        }
        segments.push(a, b);
      }
      const line = new T.LineSegments(
        new T.BufferGeometry().setFromPoints(
          segments.map((p) => new T.Vector3(...p)),
        ),
        new T.LineBasicMaterial({ color: path.color }),
      );
      this.model.add(line);
    }
    this.selectionEdges = new Map();
    this.applyColors();
    this.draw();
  }
  visibleFeatures() {
    return Object.entries(this.data?.features || {}).filter(
      ([, f]) =>
        f.available !== false &&
        f.point &&
        (["x", "y", "z"].indexOf(this.state?.view.section.axis) < 0 ||
          f.point[["x", "y", "z"].indexOf(this.state.view.section.axis)] <=
            this.state.view.section.position + 0.001) &&
        !this.state?.view.hidden.includes(f.partId) &&
        canPickPart(f.partId, this.through),
    );
  }
  project(p) {
    const v = new T.Vector3(...p).project(this.camera);
    return [
      ((v.x + 1) * this.host.clientWidth) / 2,
      ((1 - v.y) * this.host.clientHeight) / 2,
      v.z,
    ];
  }
  hit(event) {
    const r = this.host.getBoundingClientRect(),
      pt = [event.clientX - r.left, event.clientY - r.top];
    this.ray.setFromCamera(
      new T.Vector2((pt[0] / r.width) * 2 - 1, (-pt[1] / r.height) * 2 + 1),
      this.camera,
    );
    return {
      pt,
      hits: this.ray.intersectObjects(
        this.meshes.filter(
          (m) => m.visible && canPickPart(m.userData.part.id, this.through),
        ),
      ),
    };
  }
  nearestFeature(pt, partId, kind, allowAll = false) {
    if (kind === "part") return null;
    const fs = this.visibleFeatures().filter(
      ([, f]) =>
        ((!partId && allowAll) || f.partId === partId) &&
        (f.kind === kind || (kind === "edge" && f.kind === "radius")),
    );
    const candidates = fs
      .map(([id, f]) => {
        const point = this.project(f.point);
        let distance = Math.hypot(point[0] - pt[0], point[1] - pt[1]);
        if (f.segment)
          distance = segmentDistance(
            pt,
            ...f.segment.map((p) => this.project(p)),
          );
        if (f.arc)
          distance = Math.min(
            ...f.arc
              .slice(1)
              .map((p, i) =>
                segmentDistance(pt, this.project(f.arc[i]), this.project(p)),
              ),
          );
        return { id, f, distance };
      })
      .sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }
  applyColors() {
    for (const mesh of this.meshes) {
      const id = mesh.userData.part.id;
      mesh.material.emissive?.set(
        id === this.highlight?.partId || this.highlight?.partIds?.includes(id)
          ? "#513810"
          : this.selectedIds?.includes(id)
            ? "#173f40"
            : id === this.hovered
              ? "#263c55"
              : "#000000",
      );
    }
  }
  select(id, members = id ? [id] : []) {
    this.selected = id;
    this.selectedIds = members;
    this.applyColors();
    this.draw();
  }
  setHighlight(highlight) {
    this.highlight = highlight;
    this.applyColors();
    this.draw();
  }
  setPicking(on, kind = "point") {
    this.picking = on;
    this.pickKind = kind;
    this.draw();
  }
  getCamera() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      up: this.camera.up.toArray(),
      zoom: this.camera.zoom,
    };
  }
  restore(c) {
    if (!c) return;
    this.camera.position.fromArray(c.position);
    this.camera.up.fromArray(c.up);
    this.camera.zoom = c.zoom;
    this.camera.updateProjectionMatrix();
    this.controls.target.fromArray(c.target);
    this.controls.update();
    this.draw();
  }
  view(name) {
    const target = this.controls?.target.clone() || new T.Vector3();
    const dirs = {
      front: [0, 0, 400],
      back: [0, 0, -400],
      side: [0, -400, 0],
      end: [400, 0, 0],
      iso: [130, -190, 320],
    };
    this.camera.up.set(
      0,
      name === "front" || name === "back" ? 1 : 0,
      name === "front" || name === "back" ? 0 : 1,
    );
    this.camera.position.copy(target).add(new T.Vector3(...dirs[name]));
    this.camera.lookAt(target);
    this.controls.update();
    this.draw();
  }
  fit(id) {
    const parts = this.data?.parts || [];
    const part = parts.find(p => p.id === id);
    const visible = part ? [part] : parts.filter(p => !this.state.view.hidden.includes(p.id));
    if (!visible.length || !this.host.clientWidth || !this.host.clientHeight) return;
    this.view("iso");
    this.restore(frameBounds(visible.map(p => p.bounds), this.getCamera(), [{
      width: this.host.clientWidth, height: this.host.clientHeight,
    }]));
  }
  draw() {
    if (!this.renderer || !this.overlay) return;
    this.renderer.render(this.scene, this.camera);
    this.overlay.replaceChildren();
    this.dimensionHits = [];
    const svg = this.overlay;
    const line = (a, b, color = "#158b82", width = 1, dash) => {
      const x = this.project(a),
        y = this.project(b);
      const attrs = {
        x1: x[0],
        y1: x[1],
        x2: y[0],
        y2: y[1],
        stroke: color,
        "stroke-width": width,
      };
      if (dash) attrs["stroke-dasharray"] = "4 3";
      svg.append(sv("line", attrs));
      return [x, y];
    };
    // Project the selected mesh edges above the enclosure, including in the CPU renderer.
    for (const mesh of this.meshes) {
      const id = mesh.userData.part.id;
      if (!mesh.visible || !this.selectedIds?.includes(id)) continue;
      let vertices = this.selectionEdges?.get(id);
      if (!vertices) {
        const edges = new T.EdgesGeometry(mesh.geometry, 22);
        vertices = edges.attributes.position.array;
        this.selectionEdges?.set(id, vertices);
        edges.dispose();
      }
      const segments = [];
      for (let i = 0; i < vertices.length; i += 6) {
        const a = this.project(vertices.subarray(i,i+3)), b = this.project(vertices.subarray(i+3,i+6));
        segments.push(`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
      }
      svg.append(sv("path", {"data-selection-outline":id,d:segments.join(""),fill:"none",
        stroke:"#ab4b00","stroke-width":1.6,"stroke-linejoin":"round"}));
    }
    const text = (p, label, color = "#146e6a") => {
      const [x, y] = this.project(p);
      svg.append(
        sv(
          "text",
          {
            x,
            y: y - 6,
            fill: color,
            class: "dim-text",
            "text-anchor": "middle",
          },
          label,
        ),
      );
    };
    if (this.state?.view.datums && this.state.view.section.axis === "none") {
      const guides = [
        ["phase1.gas.outer", "#317ca5", "가스방 외곽 실링"],
        ["phase1.final.inner", "#92643a", "몸체 쪽 최종 실링"],
        ["phase1.cut.line", "#435b66", "절단선"],
      ];
      for (const [id, color, label] of guides) {
        const feature = this.data?.features[id];
        if (!feature?.available || this.state.view.hidden.includes(feature.partId)) continue;
        line(...feature.segment, color, 1.1, true);
        const [a, b] = feature.segment;
        text(a.map((value, i) => value * .7 + b[i] * .3), label, color);
      }
    }
    if (this.state?.view.datums) {
      const L = this.state.product.stack.length,
        W = this.state.product.stack.width;
      line([-L * 0.6, 0, 0], [L * 0.6, 0, 0], "#d98763", 0.8, true);
      line([0, -W * 0.8, 0], [0, W * 0.8, 0], "#6f9b84", 0.8, true);
      line([0, 0, -18], [0, 0, 18], "#718ac5", 0.8, true);
      text([L * 0.6, 0, 0], "X · C");
      text([0, W * 0.8, 0], "Y · B");
      text([0, 0, 18], "Z · A (설계)");
      const frames = [
        { id: "legacy", name: "기본 검사", ...this.state.datumSet },
        ...(this.state.inspectionDatums || []),
      ];
      for (const f of frames) {
        if (f.visible === false) continue;
        for (const [axis, color] of [
          ["x", "#b36ac0"],
          ["y", "#279597"],
          ["z", "#5d64c4"],
        ]) {
          const v = [0, 0, 0];
          v[["x", "y", "z"].indexOf(axis)] = 16;
          const end = worldVector(v, f).map((x, i) => x + f.origin[i]);
          line(f.origin, end, color, 1.6);
          text(end, `${f.name} ${axis.toUpperCase()}`, color);
        }
      }
    }
    let shown = 0;
    for (const m of this.state?.measurements || []) {
      if (
        this.state.view.showDimensions === false ||
        !m.visible ||
        m.stage !== this.state.stage ||
        shown >= 200
      )
        continue;
      const d = dimensionLayout(m, this.data.features, this.state);
      if (!d) continue;
      shown++;
      line(d.a, d.c, "#559b96", 0.8);
      line(d.b, d.d, "#559b96", 0.8);
      const [a, b] = line(d.c, d.d, "#0b877e", 1.2);
      this.dimensionHits.push({ a, b, measurement: m });
      this.dimensionHits.push({
        a: this.project(d.label),
        b: this.project(d.label),
        measurement: m,
      });
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 2) {
        const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        for (const [v, sgn] of [
          [a, 1],
          [b, -1],
        ])
          svg.append(
            sv("path", {
              d: `M${v[0]} ${v[1]} L${v[0] + sgn * u[0] * 7 - u[1] * 2.6} ${v[1] + sgn * u[1] * 7 + u[0] * 2.6} L${v[0] + sgn * u[0] * 7 + u[1] * 2.6} ${v[1] + sgn * u[1] * 7 - u[0] * 2.6} Z`,
              fill: "#0b877e",
            }),
          );
      }
      if (d.leader) line(...d.leader, "#0b877e", 0.8);
      text(
        d.label,
        `${m.mode === "radius" ? "R " : ""}${d.value.toFixed(2)} · ${m.name}`,
      );
    }
    const h = this.highlight;
    if (h?.guide && this.state.view.showDimensions !== false) {
      const g = h.guide,
        color = h.pending ? "#ca7c1c" : "#167d86",
        d = dimensionLayout(
          g.measurement,
          g.features,
          g.context || {
            origin: [0, 0, 0],
            rotationZ: 0,
          },
        );
      if (d) {
        line(d.a, d.c, color, 1, true);
        line(d.b, d.d, color, 1, true);
        line(d.c, d.d, color, 2, h.pending);
        const ca = this.project(d.c),
          cb = this.project(d.d),
          len = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]);
        if (len > 1e-8) {
          const u = [(cb[0] - ca[0]) / len, (cb[1] - ca[1]) / len];
          for (const [v, sign] of [
            [ca, 1],
            [cb, -1],
          ])
            svg.append(
              sv("path", {
                d: `M${v[0]} ${v[1]} L${v[0] + sign * u[0] * 8 - u[1] * 3} ${v[1] + sign * u[1] * 8 + u[0] * 3} L${v[0] + sign * u[0] * 8 + u[1] * 3} ${v[1] + sign * u[1] * 8 - u[0] * 3} Z`,
                fill: color,
              }),
            );
        }
        for (const pt of [d.a, d.b]) {
          const [cx, cy] = this.project(pt);
          svg.append(
            sv("circle", {
              cx,
              cy,
              r: 4,
              fill: color,
              stroke: "white",
              "stroke-width": 1,
            }),
          );
        }
        text(
          d.label,
          (h.pending
            ? g.committed
              ? "마지막 확정 · "
              : "예상 변경 · "
            : "기준 · ") +
            (Number.isFinite(g.value) ? g.value : d.value).toFixed(3) +
            (g.mode === "angle" ? "°" : " mm") +
            " · " +
            h.label,
          color,
        );
        this.dimensionHits.push({
          a: this.project(d.c),
          b: this.project(d.d),
          measurement: { ...g.measurement, driverPath: h.path },
        });
      }
      if (g.arc)
        for (let i = 1; i < g.arc.length; i++)
          line(g.arc[i - 1], g.arc[i], color, 3);
    }
    if (
      this.selectedFeature &&
      this.data?.features[this.selectedFeature]?.available !== false
    ) {
      const f = this.data?.features[this.selectedFeature];
      if (f?.segment) line(...f.segment, "#d08b27", 3);
    }
    if (this.picking || this.selectionMode !== "part") {
      for (const [id, f] of this.visibleFeatures().filter(
        ([, f]) =>
          f.partId === this.selected &&
          f.kind === (this.picking ? this.pickKind : this.selectionMode),
      )) {
        const [cx, cy] = this.project(f.point);
        const mark = sv("circle", {
          cx,
          cy,
          r: 4,
          fill: "#f8a244",
          stroke: "white",
          "stroke-width": 1,
        });
        mark.append(sv("title", {}, id + " · " + f.name));
        svg.append(mark);
      }
    }
  }
}

function segmentDistance(p, a, b) {
  const v = [b[0] - a[0], b[1] - a[1]],
    l = v[0] * v[0] + v[1] * v[1],
    t = l
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / l),
        )
      : 0;
  return Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]);
}
