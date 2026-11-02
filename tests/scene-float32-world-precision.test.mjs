import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph } from '../src/scenes/graph.js';
import { planSceneDraws } from '../src/visual/scene-plan.js';

// Entirely generated fixtures: float32/WebGL2 contract, NOT MCD geometry.
const camera = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 };
const sceneAt = (x, width = 2) => buildSceneGraph([{
  id: 'synthetic-box', material: 'chalk',
  primitive: { kind: 'box', size: { x: width, y: 2, z: 2 } },
  transform: { position: { x, y: 1.7, z: 0 } },
}]);

test('rejects finite camera positions which overflow the WebGL2 float32 uniform', () => {
  const farCamera = { ...camera, x: 1e100 };
  assert.equal(Math.fround(farCamera.x), Infinity);
  assert.throws(() => planSceneDraws(sceneAt(1e100), farCamera), /camera exceeds WebGL2 float32/i);
});

test('rejects a visible 1-unit relative offset lost on float32 camera/mesh conversion', () => {
  const shiftedCamera = { ...camera, x: 1e8 };
  const center = 1e8 + 1;
  assert.equal(center - shiftedCamera.x, 1);
  assert.equal(Math.fround(center), Math.fround(shiftedCamera.x));
  // A wide box rules out the separate thin-geometry-collapse guard.
  assert.throws(() => planSceneDraws(sceneAt(center, 100), shiftedCamera), /loses camera-relative position/i);
});

test('rejects a nonzero box axis collapsed by float32 vertex plus translation', () => {
  const shiftedCamera = { ...camera, x: 1e8 };
  const center = Math.fround(1e8), half = Math.fround(1);
  assert.equal(Math.fround(center - half), Math.fround(center + half));
  assert.throws(() => planSceneDraws(sceneAt(1e8, 2), shiftedCamera), /generated box collapses/i);
});

test('preserves normal visible boxes with float32-distinguishable positions and faces', () => {
  const ordinary = planSceneDraws(sceneAt(0), camera);
  assert.equal(ordinary.packets.length, 1);
  assert.equal(ordinary.estimatedLegacyDrawCalls, 1);

  const shifted = planSceneDraws(sceneAt(1e5 + 4, 2), { ...camera, x: 1e5 });
  assert.equal(shifted.packets.length, 1);
  assert.deepEqual(shifted.packets[0].legacyBoxArgs, [100004, 1.7, 0, 2, 2, 2, '#e6ecf0']);
});

test('keeps intentionally zero-width generated geometry and culled objects explicit', () => {
  const degenerate = planSceneDraws(sceneAt(0, 0), camera);
  assert.equal(degenerate.packets.length, 1);
  assert.equal(degenerate.packets[0].legacyBoxArgs[3], 0);

  const farCamera = { ...camera, x: 1e100 };
  const culled = planSceneDraws(sceneAt(0), farCamera);
  assert.equal(culled.packets.length, 0);
  assert.equal(culled.culled, 1);
});
