import test from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera, Vector3 } from "three";
import { frameBounds, ORTHOGRAPHIC_HEIGHT } from "../src/viewer/framing.js";

test("common orthographic fit keeps both displaced CAD bounds inside narrow and wide panes in every view", () => {
  const bounds = [
    { min: [-170, -35, -4], max: [172, 35, 4] },
    { min: [410, -60, -9], max: [800, 50, 20] },
  ];
  const sizes = [
    { width: 528, height: 274 },
    { width: 270, height: 380 },
  ];
  const before = structuredClone(bounds);
  for (const [position, up] of [
    [
      [0, 0, 400],
      [0, 1, 0],
    ],
    [
      [0, -400, 0],
      [0, 0, 1],
    ],
    [
      [130, -190, 320],
      [0, 0, 1],
    ],
  ]) {
    const source = { position, up, target: [0, 0, 0], zoom: 5 };
    const original = structuredClone(source);
    const result = frameBounds(bounds, source, sizes);
    for (const size of sizes) {
      const half = ORTHOGRAPHIC_HEIGHT / 2;
      const camera = new OrthographicCamera(
        (-half * size.width) / size.height,
        (half * size.width) / size.height,
        half,
        -half,
        0.1,
        3000,
      );
      camera.position.fromArray(result.position);
      camera.up.fromArray(result.up);
      camera.lookAt(new Vector3(...result.target));
      camera.zoom = result.zoom;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const b of bounds)
        for (const x of [b.min[0], b.max[0]])
          for (const y of [b.min[1], b.max[1]])
            for (const z of [b.min[2], b.max[2]]) {
              const projected = new Vector3(x, y, z).project(camera);
              assert.ok(Math.abs(projected.x) <= 0.86 + 1e-8);
              assert.ok(Math.abs(projected.y) <= 0.86 + 1e-8);
            }
    }
    assert.deepEqual(source, original);
    assert.deepEqual(bounds, before);
    assert.equal(result.target[0], 315);
  }
});

test("common fit rejects unavailable view sizes instead of publishing an invalid camera", () => {
  const bounds = [{ min: [-1, -1, -1], max: [1, 1, 1] }];
  const camera = {
    position: [0, 0, 400],
    target: [0, 0, 0],
    up: [0, 1, 0],
    zoom: 1,
  };
  assert.throws(
    () => frameBounds(bounds, camera, [{ width: 0, height: 0 }]),
    /화면 크기/,
  );
  assert.throws(
    () => frameBounds([], camera, [{ width: 400, height: 300 }]),
    /대상이 없습니다/,
  );
});
