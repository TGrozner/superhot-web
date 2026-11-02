import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph, boxBounds } from '../src/scenes/graph.js';
import { planSceneDraws } from '../src/visual/scene-plan.js';

// Entirely synthetic. These cases characterize the WEB adapter, not MCD.
const camera = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 };

test('sub-epsilon rotation cannot be silently flattened to a legacy box', () => {
  const yaw = 1e-8;
  const graph = buildSceneGraph([{
    id: 'generated-rotated', material: 'chalk',
    primitive: { kind: 'box', size: { x: 2e8, y: 2, z: 2 } },
    transform: {
      position: { x: 0, y: 1.7, z: 0 },
      rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    },
  }]);
  const m = graph[0].worldMatrix;
  assert.ok(Math.abs(m[2]) > 0 && Math.abs(m[2]) < 1e-7);
  // A corner at x=1e8 moves about 1 world unit in Z, despite tiny m[2].
  assert.ok(Math.abs(m[2] * 1e8) > 0.99);
  const plan = planSceneDraws(graph, camera);
  assert.equal(plan.packets.length, 1);
  assert.equal(plan.packets[0].legacyBoxArgs, null);
  assert.equal(plan.affineRequired, 1);
  assert.equal(plan.estimatedLegacyDrawCalls, 0);
  assert.deepEqual(plan.packets[0].matrix, m);
});

test('small but nonzero shear stays affine instead of being silently dropped', () => {
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 4e-8, 0, 1, 0, 0, 1.7, 0, 1];
  const size = { x: 2, y: 2, z: 1e8 };
  const graph = [{
    id: 'generated-sheared', material: 'steel', visible: true,
    primitive: { kind: 'box', size }, worldMatrix: matrix,
    bounds: boxBounds(matrix, size),
  }];
  assert.ok(matrix[8] > 0 && matrix[8] < 1e-7);
  const plan = planSceneDraws(graph, camera);
  assert.equal(plan.packets.length, 1);
  assert.equal(plan.packets[0].legacyBoxArgs, null);
  assert.equal(plan.affineRequired, 1);
});

test('inherited object keys are never accepted as generated materials', () => {
  for (const material of ['constructor', 'toString', '__proto__']) {
    const graph = buildSceneGraph([{
      id: 'generated', material,
      primitive: { kind: 'box', size: { x: 2, y: 2, z: 2 } },
      transform: { position: { x: 0, y: 1.7, z: 0 } },
    }]);
    assert.throws(() => planSceneDraws(graph, camera), /Unknown generated material/);
  }
});

test('an explicitly declared generated material still produces a legacy packet', () => {
  const graph = buildSceneGraph([{
    id: 'generated', material: 'chalk',
    primitive: { kind: 'box', size: { x: 2, y: 2, z: 2 } },
    transform: { position: { x: 0, y: 1.7, z: 0 } },
  }]);
  const plan = planSceneDraws(graph, camera);
  assert.deepEqual(plan.packets[0].legacyBoxArgs, [0, 1.7, 0, 2, 2, 2, '#e6ecf0']);
  assert.equal(plan.affineRequired, 0);
});
