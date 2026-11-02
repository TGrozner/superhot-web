import test from 'node:test';
import assert from 'node:assert/strict';
import { defineIndexedMesh } from '../src/render/mesh-format.js';
import { createIndexedSkinBinding, skinIndexedCharacter } from '../src/characters/skinning.js';

// Authored single-triangle fixture, NOT MCD mesh/weights/rig/animation.
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translateX = x => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const scaleX = x => [x, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const base = () => defineIndexedMesh({
  positions: [0,0,0, 1,0,0, 0,1,0],
  normals: [0,0,1, 0,0,1, 0,0,1],
  uvs: [0,0, 1,0, 0,1],
  indices: [0,1,2],
});
const weights = [1,0,0,0, 0,1,0,0, .5,.5,0,0];
const indices = [0,1,0,0, 0,1,0,0, 0,1,0,0];
const bind = (overrides = {}) => createIndexedSkinBinding({
  mesh: base(), boneIds: ['custom-joint-A', 'custom-joint-B'],
  inverseBindMatrices: [identity(), identity()],
  boneIndices: indices, boneWeights: weights, ...overrides,
});
const vertex = (mesh, i) => Array.from(mesh.vertices.slice(i * 8, i * 8 + 3));
const near = (actual, expected, tolerance=1e-6) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < tolerance,
    'index ' + i + ': ' + value + ' !== ' + expected[i]));
};

test('bind pose leaves authored triangle unchanged under identity poses', () => {
  const binding = bind();
  const original = Array.from(binding.mesh.vertices);
  const result = skinIndexedCharacter(binding, {
    'custom-joint-A': identity(), 'custom-joint-B': identity(),
  });
  assert.deepEqual(Array.from(result.mesh.vertices), original);
  assert.deepEqual(Array.from(result.mesh.indices), [0, 1, 2]);
  assert.equal(result.mesh.triangleCount, 1);
  assert.equal(result.skinned, true);
  assert.equal(result.nativeBoneWeightsVerified, false);
  assert.equal(result.nativePoseVerified, false);
});

test('two weighted joints deform all three vertices with blended matrices', () => {
  const binding = bind();
  const result = skinIndexedCharacter(binding, new Map([
    ['custom-joint-A', identity()],
    ['custom-joint-B', translateX(2)],
  ]));
  near(vertex(result.mesh, 0), [0,0,0]);
  near(vertex(result.mesh, 1), [3,0,0]);
  near(vertex(result.mesh, 2), [1,1,0]);
  near(result.deformedBounds.min, [0,0,0]);
  near(result.deformedBounds.max, [3,1,0]);
  assert.deepEqual(Array.from(binding.mesh.vertices.slice(16,19)), [0,1,0],
    'the original source-neutral mesh must remain untouched');
  assert.deepEqual(Array.from(result.mesh.vertices.slice(22,24)), [0,1],
    'UVs survive skin deformation');
});

test('inverse bind matrix cancels the joint transform in original bind pose', () => {
  const binding = bind({
    inverseBindMatrices: [identity(), translateX(-2)],
  });
  const result = skinIndexedCharacter(binding, {
    'custom-joint-A': identity(), 'custom-joint-B': translateX(2),
  });
  near(vertex(result.mesh, 1), [1,0,0]);
  near(vertex(result.mesh, 2), [0,1,0]);
});

test('normal inverse-transpose is correct with nonuniform scale', () => {
  const diagonal = Math.SQRT1_2;
  const mesh = defineIndexedMesh({
    positions:[0,0,0, 1,0,0, 0,1,0],
    normals: [diagonal,diagonal,0, diagonal,diagonal,0, diagonal,diagonal,0],
    uvs:[0,0, 1,0, 0,1], indices:[0,1,2],
  });
  const binding = bind({ mesh, boneWeights:[0,1,0,0, 0,1,0,0, 0,1,0,0] });
  const result = skinIndexedCharacter(binding, {
    'custom-joint-A': identity(), 'custom-joint-B': scaleX(2),
  });
  const normal = Array.from(result.mesh.vertices.slice(3,6));
  near(normal, [1/Math.sqrt(5), 2/Math.sqrt(5),0]);
  near(vertex(result.mesh,1), [2,0,0]);
});

test('skin binding refuses absent, fractional, out-of-range, negative and nonnormalized weights', () => {
  assert.throws(() => bind({ boneWeights: weights.slice(1) }), /exactly/);
  assert.throws(() => bind({ boneIndices: [2,...indices.slice(1)] }), /Invalid skin/);
  assert.throws(() => bind({ boneIndices: [.5,...indices.slice(1)] }), /Invalid skin/);
  assert.throws(() => bind({ boneWeights: [-1,...weights.slice(1)] }), /Invalid skin/);
  assert.throws(() => bind({ boneWeights: [0.9,...weights.slice(1)] }), /must total 1/);
  assert.throws(() => bind({ boneIds: ['duplicate','duplicate'] }), /Bone IDs/);
  assert.throws(() => bind({ inverseBindMatrices: [identity()] }), /Bone IDs/);
});

test('source-neutral pose contract refuses missing, singular and NaN joint matrices', () => {
  const binding = bind();
  assert.throws(() => skinIndexedCharacter(binding, { 'custom-joint-A': identity() }), /Missing measured/);
  assert.throws(() => skinIndexedCharacter(binding, {
    'custom-joint-A': identity(), 'custom-joint-B': scaleX(0),
  }), /Singular|unstable/);
  const broken = translateX(NaN);
  assert.throws(() => skinIndexedCharacter(binding, {
    'custom-joint-A': identity(), 'custom-joint-B': broken,
  }), /finite column-major/);
});

test('skinning does not change indices or fabricate unprovided geometry/material evidence', () => {
  const result = skinIndexedCharacter(bind(), {
    'custom-joint-A': identity(), 'custom-joint-B': translateX(2),
  });
  assert.deepEqual(result.mesh.indices.constructor.name, 'Uint16Array');
  assert.match(result.geometryProvenance, /not-native-qualified/);
  assert.equal(result.runtimeEnemyInstanceVerified, false);
});
