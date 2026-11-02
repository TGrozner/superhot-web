import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph } from '../src/scenes/graph.js';
import { planSceneDraws } from '../src/visual/scene-plan.js';

// Entirely synthetic boxes: tests the existing WEB shader contract, not MCD.
const camera = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 };
const cube = { kind: 'box', size: { x: 2, y: 2, z: 2 } };
const scene = (scale) => buildSceneGraph([{
  id: 'generated', primitive: cube,
  transform: { position: { x: 0, y: 1.7, z: 0 }, scale },
}]);

test('reflected boxes are not sent to the legacy shader with wrong normals', () => {
  for (const axis of ['x', 'y', 'z']) {
    const scale = { x: 1, y: 1, z: 1 };
    scale[axis] = -1;
    const plan = planSceneDraws(scene(scale), camera);
    assert.equal(plan.packets.length, 1);
    assert.equal(plan.affineRequired, 1);
    assert.equal(plan.estimatedLegacyDrawCalls, 0);
    assert.equal(plan.packets[0].legacyBoxArgs, null);
    // Geometry is retained for a future affine + normal-matrix renderer.
    assert.deepEqual(plan.packets[0].bounds.halfExtents, { x: 1, y: 1, z: 1 });
  }
});

test('zero-scale axes also require a nonlegacy path', () => {
  const plan = planSceneDraws(scene({ x: 1, y: 0, z: 1 }), camera);
  assert.equal(plan.packets[0].legacyBoxArgs, null);
  assert.equal(plan.affineRequired, 1);
});

test('positive axis-aligned nonuniform boxes remain renderer.box compatible', () => {
  const plan = planSceneDraws(scene({ x: 2, y: 3, z: 4 }), camera);
  assert.deepEqual(plan.packets[0].legacyBoxArgs, [0, 1.7, 0, 4, 6, 8, '#e6ecf0']);
  assert.equal(plan.affineRequired, 0);
  assert.equal(plan.estimatedLegacyDrawCalls, 1);
});

test('synthetic visible mixed-sign scene reports submissions honestly', () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => ({
    id: 'box-' + i, primitive: cube, material: 'chalk',
    transform: {
      position: { x: i >= 500 ? 200 : 0, y: 1.7, z: -4 },
      scale: { x: i % 2 === 0 ? 1 : -1, y: 1, z: 1 },
    },
  }));
  const plan = planSceneDraws(buildSceneGraph(nodes), camera);
  assert.equal(plan.culled, 500);
  assert.equal(plan.packets.length, 500);
  assert.equal(plan.affineRequired, 250);
  assert.equal(plan.estimatedLegacyDrawCalls, 250);
  // These are CPU submission estimates, not GPU timings/FPS measurements.
});
