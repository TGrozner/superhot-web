import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph, boxBounds, composeLocalMatrix, multiplyMatrices } from '../src/scenes/graph.js';

// Synthetic stress inputs only. These tests do not establish any MCD values.
const box = { kind: 'box', size: { x: 2, y: 2, z: 2 } };

test('an overflowing finite quaternion norm is rejected before normalization', () => {
  assert.throws(() => composeLocalMatrix({
    rotation: { x: 1.7e308, y: 1.7e308, z: 0, w: 0 },
  }), /quaternion norm overflow/);
});

test('finite parent and child scales cannot produce an infinite world matrix', () => {
  const parent = composeLocalMatrix({ scale: { x: 1e308, y: 1, z: 1 } });
  const child = composeLocalMatrix({ scale: { x: 100, y: 1, z: 1 } });
  assert.throws(() => multiplyMatrices(parent, child), /Scene matrix overflow/);
});

test('finite translations cannot overflow hierarchy composition silently', () => {
  assert.throws(() => buildSceneGraph([
    { id: 'child', parentId: 'parent', primitive: box,
      transform: { position: { x: 1e308, y: 0, z: 0 } } },
    { id: 'parent', transform: { position: { x: 1e308, y: 0, z: 0 } } },
  ]), /Scene matrix overflow/);
});

test('finite transform and box dimensions cannot overflow calculated extents', () => {
  const matrix = composeLocalMatrix({ scale: { x: 1e308, y: 1, z: 1 } });
  assert.throws(() => boxBounds(matrix, { x: 10, y: 2, z: 2 }), /Box bounds extents overflow/);
});

test('finite extents cannot overflow only when calculating the sphere radius', () => {
  const matrix = composeLocalMatrix({ scale: { x: 1.5e308, y: 1.5e308, z: 1 } });
  assert.throws(() => boxBounds(matrix, { x: 2, y: 2, z: 0 }), /Box bounds radius overflow/);
});

test('direct boxBounds callers cannot provide malformed or nonfinite matrices', () => {
  assert.throws(() => boxBounds([], box.size), /4x4 matrix/);
  const matrix = composeLocalMatrix();
  matrix[12] = Infinity;
  assert.throws(() => boxBounds(matrix, box.size), /finite matrix entries/);
});

test('ordinary source-neutral affine hierarchy still computes finite bounds', () => {
  const graph = buildSceneGraph([
    { id: 'child', parentId: 'parent', primitive: box,
      transform: { position: { x: 2, y: 0, z: 0 } } },
    { id: 'parent', transform: { scale: { x: 2, y: 3, z: 4 } } },
  ]);
  assert.equal(graph[0].worldMatrix[12], 4);
  assert.deepEqual(graph[0].bounds.halfExtents, { x: 2, y: 3, z: 4 });
  assert.ok(Number.isFinite(graph[0].bounds.radius));
});
