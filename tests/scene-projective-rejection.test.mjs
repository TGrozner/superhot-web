import test from 'node:test';
import assert from 'node:assert/strict';
import { boxBounds, buildSceneGraph } from '../src/scenes/graph.js';

// Entirely generated matrices and geometry: no Unity/MCD values or assets.
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const unitBox = { x: 1, y: 1, z: 1 };
const requireAffine = /affine matrix.*homogeneous row/i;

test('rejects perspective X: the affine AABB would underestimate a transformed corner', () => {
  const matrix = identity();
  matrix[3] = 0.5; // homogeneous w = 1 + x/2
  const originalCornerX = -0.5;
  const actualCornerX = originalCornerX / (1 + 0.5 * originalCornerX);
  assert.ok(actualCornerX < -0.5, 'projective corner lies beyond the old nominal AABB');
  assert.throws(() => boxBounds(matrix, unitBox), requireAffine);
});

test('rejects any projective homogeneous row component and w scaling', () => {
  for (const [index, value] of [[3, 0.125], [7, -0.25], [11, 0.5], [15, 2]]) {
    const matrix = identity();
    matrix[index] = value;
    assert.throws(() => boxBounds(matrix, unitBox), requireAffine, 'matrix[' + index + ']');
  }
});

test('does not silently accept near-affine projective matrices via epsilon', () => {
  const matrix = identity();
  matrix[11] = Number.EPSILON;
  assert.throws(() => boxBounds(matrix, unitBox), requireAffine);
});

test('retains exact bounds for generated affine shears and nonuniform scales', () => {
  const matrix = [
    1, 0, 0, 0,
    0.5, 2, 0, 0,
    0, 0, 3, 0,
    4, -3, 2, 1,
  ];
  const bounds = boxBounds(matrix, { x: 2, y: 2, z: 4 });
  assert.deepEqual(bounds.center, { x: 4, y: -3, z: 2 });
  assert.deepEqual(bounds.halfExtents, { x: 1.5, y: 2, z: 6 });
  assert.equal(bounds.radius, Math.hypot(1.5, 2, 6));
});

test('normal TRS parent-child graph remains affine and produces valid bounds', () => {
  const graph = buildSceneGraph([
    { id: 'child', parentId: 'parent',
      transform: { position: { x: 2, y: 0, z: -1 } },
      primitive: { kind: 'box', size: { x: 2, y: 1, z: 3 } },
    },
    { id: 'parent', transform: {
      position: { x: 1, y: 2, z: 3 },
      scale: { x: -2, y: 3, z: 4 },
      rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    } },
  ]);
  const child = graph.find((node) => node.id === 'child');
  assert.deepEqual([child.worldMatrix[3], child.worldMatrix[7],
    child.worldMatrix[11], child.worldMatrix[15]], [0, 0, 0, 1]);
  assert.ok(Number.isFinite(child.bounds.radius) && child.bounds.radius > 0);
});
