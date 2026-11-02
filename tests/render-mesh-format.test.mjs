import test from 'node:test';
import assert from 'node:assert/strict';
import { defineIndexedMesh, makeCylinderMesh, meshModelMatrices, MESH_VERTEX_STRIDE } from '../src/render/mesh-format.js';

const unitTriangle = () => defineIndexedMesh({
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  uvs: [0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
});

test('interleaves full position, normal and UV attributes, chooses uint16 indices', () => {
  const m = unitTriangle();
  assert.equal(m.strideBytes, MESH_VERTEX_STRIDE);
  assert.equal(m.strideBytes, 32);
  assert.deepEqual(Array.from(m.vertices.slice(8, 16)), [1, 0, 0, 0, 0, 1, 1, 0]);
  assert.ok(m.indices instanceof Uint16Array);
  assert.deepEqual(Array.from(m.indices), [0, 1, 2]);
  assert.deepEqual(m.bounds.min, [0, 0, 0]);
  assert.deepEqual(m.bounds.max, [1, 1, 0]);
  assert.equal(m.triangleCount, 1);
});

test('rejects malformed triangles and out-of-buffer indices before GPU access', () => {
  const source = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: Array(9).fill(0), uvs: Array(6).fill(0), indices: [0, 1, 2] };
  assert.throws(() => defineIndexedMesh({ ...source, indices: [0, 1, 3] }), /outside/);
  assert.throws(() => defineIndexedMesh({ ...source, indices: [0, 1] }), /complete triangles/);
  assert.throws(() => defineIndexedMesh({ ...source, normals: [0, 0, 1] }), /component count/);
  assert.throws(() => defineIndexedMesh({ ...source, positions: [Infinity, ...source.positions.slice(1)] }), /finite float32/);
  assert.throws(() => defineIndexedMesh({ ...source, indices: [0, 1, 1.5] }), /outside/);
});

test('procedural cylinder is actually an indexed curved, capped mesh with outward winding', () => {
  const segments = 24;
  const m = makeCylinderMesh({ segments, height: 3, radius: 2 });
  assert.equal(m.vertexCount, 4 * segments + 4);
  assert.equal(m.triangleCount, 4 * segments);
  assert.equal(m.indexCount, 12 * segments);
  assert.equal(m.bounds.min[1], -1.5);
  assert.equal(m.bounds.max[1], 1.5);
  const coord = (i) => Array.from(m.vertices.slice(i * 8, i * 8 + 3));
  const a = coord(m.indices[0]), b = coord(m.indices[1]), c = coord(m.indices[2]);
  const ab = b.map((v, j) => v - a[j]), ac = c.map((v, j) => v - a[j]);
  const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
  assert.ok(cross[0] > 0, 'cylinder side triangles face outward at +X');
  // Cap normal must be flat, not smoothed with side at the seam.
  const capCenter = 2 * (segments + 1);
  assert.deepEqual(Array.from(m.vertices.slice(capCenter * 8 + 3, capCenter * 8 + 6)), [0, 1, 0]);
});

test('inverse-transpose transforms normals perpendicular to sheared, nonuniform tangent plane', () => {
  const m = [2, 0, 0, 0, 1, 3, 0, 0, 0, 0.5, -4, 0, 5, -2, 1, 1];
  const out = meshModelMatrices(m);
  const tangentA = [m[0], m[1], m[2]];
  const tangentB = [m[4], m[5], m[6]];
  const faceNormal = [out.normal[6], out.normal[7], out.normal[8]];
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  assert.ok(Math.abs(dot(faceNormal, tangentA)) < 1e-6);
  assert.ok(Math.abs(dot(faceNormal, tangentB)) < 1e-6);
  assert.equal(out.mirrored, true);
  assert.deepEqual(Array.from(out.model.slice(12)), [5, -2, 1, 1]);
  assert.throws(() => meshModelMatrices([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), /Singular/);
  assert.throws(() => meshModelMatrices([...m.slice(0, 15), 2]), /affine/);
});
