import test from 'node:test';
import assert from 'node:assert/strict';
import { isBoundsVisible, planSceneDraws } from '../src/visual/scene-plan.js';

// Synthetic source-neutral boxes; never recovered SUPERHOT MCD geometry.
const camera = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 };
const bounds = { center: { x: 0, y: 1.7, z: 0 }, radius: 1 };
function packet(scale, width = 1) {
  const m = [scale,0,0,0, 0,1,0,0, 0,0,1,0, 0,1.7,0,1];
  return { id: 'synthetic', visible: true, material: 'chalk', worldMatrix: m,
    primitive: { kind: 'box', size: { x: width, y: 1, z: 1 } },
    bounds: { center: bounds.center, radius: Math.max(1, Math.abs(scale * width / 2)) } };
}

test('culling rejects non-finite projection parameters rather than silently clipping', () => {
  for (const options of [{ aspect: Infinity }, { focalLength: Infinity }, { near: Infinity }, { far: Infinity }]) {
    assert.throws(() => isBoundsVisible(bounds, camera, options), /Invalid perspective projection/);
  }
});
test('culling rejects malformed camera and sphere centers', () => {
  assert.throws(() => isBoundsVisible(bounds, { ...camera, pitch: NaN }), /camera/i);
  assert.throws(() => isBoundsVisible(bounds, { ...camera, x: Infinity }), /camera/i);
  assert.throws(() => isBoundsVisible({ center: { ...bounds.center, z: NaN }, radius: 1 }, camera), /bounds|center/i);
});
test('culling rejects overflow during view-space projection', () => {
  assert.throws(() => isBoundsVisible({ center: { x: -1e308, y: 0, z: 0 }, radius: 1 }, { ...camera, x: 1e308 }), /overflow/i);
});
test('visible legacy box size must fit the float32 WebGL2 uniform', () => {
  assert.throws(() => planSceneDraws([packet(3e38, 4)], camera), /float32/i);
});
test('visible affine matrix must fit float32 even if JS numbers are finite', () => {
  assert.throws(() => planSceneDraws([packet(1e100, 1)], camera), /float32/i);
});
test('ordinary synthetic draw packets are unchanged', () => {
  const plan = planSceneDraws([packet(2, 4)], camera);
  assert.equal(plan.packets.length, 1);
  assert.deepEqual(plan.packets[0].legacyBoxArgs, [0, 1.7, 0, 8, 1, 1, '#e6ecf0']);
  assert.equal(plan.estimatedLegacyDrawCalls, 1);
});
