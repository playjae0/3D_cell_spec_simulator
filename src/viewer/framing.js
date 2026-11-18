import { Matrix4, Vector3 } from "three";

export const ORTHOGRAPHIC_HEIGHT = 230;

// Fit the same world-space union in every pane. Only the camera moves;
// neither CAD result is translated or independently aligned.
export function frameBounds(bounds, camera, viewports) {
  if (!bounds.length || !viewports.length)
    throw Error("화면 맞춤 대상이 없습니다");
  const min = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])));
  if (
    ![...min, ...max].every(Number.isFinite) ||
    min.some((v, i) => v > max[i])
  )
    throw Error("화면 맞춤 외곽값이 유효하지 않습니다");
  if (
    viewports.some(
      (v) =>
        !Number.isFinite(v.width) ||
        !Number.isFinite(v.height) ||
        v.width <= 0 ||
        v.height <= 0,
    )
  )
    throw Error("화면 크기가 유효하지 않습니다");
  const target = new Vector3(...min.map((v, i) => (v + max[i]) / 2));
  const offset = new Vector3(...camera.position).sub(
    new Vector3(...camera.target),
  );
  const position = target.clone().add(offset);
  const basis = new Matrix4().lookAt(
    position,
    target,
    new Vector3(...camera.up),
  );
  const size = max.map((v, i) => v - min[i]);
  const extent = (column) =>
    new Vector3()
      .setFromMatrixColumn(basis, column)
      .toArray()
      .reduce((sum, n, i) => sum + Math.abs(n) * size[i], 0);
  const spanX = Math.max(extent(0), 1e-6),
    spanY = Math.max(extent(1), 1e-6);
  const zoom =
    0.86 *
    Math.min(
      ...viewports.map((v) =>
        Math.min(
          (ORTHOGRAPHIC_HEIGHT * v.width) / v.height / spanX,
          ORTHOGRAPHIC_HEIGHT / spanY,
        ),
      ),
    );
  return {
    position: position.toArray(),
    target: target.toArray(),
    up: [...camera.up],
    zoom,
  };
}
