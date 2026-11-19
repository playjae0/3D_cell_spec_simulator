import * as T from "three";
import { SoftwareRenderer } from "../viewer/software.js";

// Recorded public models: finished folded cell, taped assembly, formed pouch
// and an assembly loaded into open R4 cups, respectively.
export const modelImages = {
  "pouch-phase1": new URL("./images/pouch-phase1.png", import.meta.url).href,
  demo: new URL("./images/demo.png", import.meta.url).href,
  "pouch-process": new URL("./images/pouch-process.png", import.meta.url).href,
  "process-tooling-r4": new URL("./images/process-tooling-r4.png", import.meta.url).href,
};

const cache = new WeakMap();

export function renderParts(parts, width, height, bottom=false) {
  const scene = new T.Scene();
  for (const part of parts) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(part.mesh.positions, 3));
    geometry.setIndex(part.mesh.indices);
    scene.add(new T.Mesh(geometry, new T.MeshBasicMaterial({ color: part.color })));
  }

  const box = new T.Box3().setFromObject(scene);
  const center = box.getCenter(new T.Vector3());
  const distance = Math.max(1, box.getSize(new T.Vector3()).length());
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 3 * distance);
  camera.up.set(0, 0, 1);
  camera.position.copy(center).addScaledVector(new T.Vector3(.35, -1, bottom?-1.4:1.4).normalize(), 2 * distance);
  camera.lookAt(center);
  camera.updateMatrixWorld();

  const projected = new T.Box3();
  const vertex = new T.Vector3();
  for (const obj of scene.children) {
    const positions = obj.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      projected.expandByPoint(vertex.fromBufferAttribute(positions, i).project(camera));
    }
  }
  const size = projected.getSize(new T.Vector3());
  const midpoint = projected.getCenter(new T.Vector3());
  const aspect = width / height;
  const halfHeight = Math.max(size.x / aspect, size.y, 0.01) * 0.55;
  camera.left = midpoint.x - halfHeight * aspect;
  camera.right = midpoint.x + halfHeight * aspect;
  camera.bottom = midpoint.y - halfHeight;
  camera.top = midpoint.y + halfHeight;
  camera.updateProjectionMatrix();

  const renderer = new SoftwareRenderer();
  renderer.setSize(width, height);
  renderer.render(scene, camera);
  for (const obj of scene.children) {
    obj.geometry.dispose();
    obj.material.dispose();
  }
  return renderer.domElement.toDataURL();
}

// The selected stage's mesh is the cache key. New CAD output gets a fresh image.
export function partImage(part) {
  if (!part?.mesh?.indices?.length) return "";
  if (!cache.has(part.mesh)) cache.set(part.mesh, renderParts([part], 88, 58));
  return cache.get(part.mesh);
}

const detailCache = new WeakMap();
export function detailImage(part) {
  if (!detailCache.has(part.mesh)) detailCache.set(part.mesh, renderParts([part], 420, 158));
  return detailCache.get(part.mesh);
}
